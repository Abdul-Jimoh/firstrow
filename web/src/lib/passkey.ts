import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { sha256, stringToBytes, type Address, type LocalAccount } from "viem";
import { chain, network } from "./chain";

const CREDENTIAL_KEY = "firstrow.credential";
const DOOR_KEYS_KEY = "firstrow.doorKeys";
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export type StoredCredential = PasskeyCredentialMetadata & { name: string; address: Address };

export class PasskeyError extends Error {
  constructor(
    readonly code: "PRF_UNAVAILABLE" | "CANCELLED" | "UNSUPPORTED" | "UNKNOWN",
    message: string,
  ) {
    super(message);
  }
}

let session: Secp256k1SigningSession | null = null;
let account: LocalAccount | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function rpId() {
  return window.location.hostname;
}

// Same derivation as Mera's docs, so the account can be exported as a standard 24-word recovery phrase.
function walletKey(prfOutput: Uint8Array): Uint8Array {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive("m/44'/60'/0'/0/0");
  if (!node.privateKey) throw new PasskeyError("UNKNOWN", "Key derivation failed");
  return node.privateKey;
}

// Each event gets its own PRF salt, so its door key is an unrelated secret from the same passkey.
// It can sign check-ins for that event and nothing else, and the wallet key never comes out at the door.
export function doorKeySalt(eventId: bigint): Uint8Array {
  return sha256(stringToBytes(`firstrow.door.v1:${chain.id}:${network.firstrow.toLowerCase()}:${eventId}`), "bytes");
}

function wrap(error: unknown): PasskeyError {
  if (error instanceof PasskeyError) return error;
  if (isMeraError(error)) {
    if (error.code === "PRF_UNAVAILABLE") {
      return new PasskeyError(
        "PRF_UNAVAILABLE",
        "This passkey provider can't be used here. Save the passkey to iCloud Keychain, Google Password Manager or 1Password.",
      );
    }
    if (error.code === "PASSKEY_OPERATION_FAILED") return new PasskeyError("CANCELLED", "Passkey prompt was dismissed.");
    if (error.code === "CRYPTO_UNAVAILABLE") return new PasskeyError("UNSUPPORTED", "Passkeys need a secure (https) page.");
  }
  return new PasskeyError("UNKNOWN", error instanceof Error ? error.message : "Something went wrong.");
}

function startSession(prfOutput: Uint8Array): LocalAccount {
  endSession();
  session = createSecp256k1SigningSession({ privateKey: walletKey(prfOutput) });
  account = toViemAccount(session);
  touch();
  return account;
}

function touch() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(endSession, IDLE_TIMEOUT_MS);
}

export function endSession() {
  clearTimeout(idleTimer);
  session?.end();
  session = null;
  account = null;
}

const listeners = new Set<() => void>();
let cached: { raw: string | null; value: StoredCredential | null } = { raw: null, value: null };

export function storedCredential(): StoredCredential | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(CREDENTIAL_KEY);
  } catch {}
  if (raw !== cached.raw) {
    let value: StoredCredential | null = null;
    try {
      value = raw ? (JSON.parse(raw) as StoredCredential) : null;
    } catch {}
    cached = { raw, value };
  }
  return cached.value;
}

// For useSyncExternalStore: fires on sign-in/out here and in other tabs.
export function subscribeCredential(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function storeCredential(credential: StoredCredential | null) {
  if (credential) localStorage.setItem(CREDENTIAL_KEY, JSON.stringify(credential));
  else localStorage.removeItem(CREDENTIAL_KEY);
  listeners.forEach((l) => l());
}

export function forget() {
  endSession();
  localStorage.removeItem(DOOR_KEYS_KEY);
  storeCredential(null);
}

export async function signUp(name: string): Promise<{ account: LocalAccount; credential: StoredCredential }> {
  try {
    const created = await createPasskeyWithPrfOutput({
      rp: { id: rpId(), name: "Firstrow" },
      user: { name, displayName: name },
    });
    const acct = startSession(created.prfOutput);
    const credential: StoredCredential = {
      credentialId: created.credentialId,
      transports: created.transports,
      name,
      address: acct.address,
    };
    storeCredential(credential);
    return { account: acct, credential };
  } catch (error) {
    throw wrap(error);
  }
}

// Signs in with the stored passkey, or lets the browser offer any Firstrow passkey on a new device.
export async function signIn(): Promise<{ account: LocalAccount; credential: StoredCredential }> {
  const stored = storedCredential();
  try {
    const result = await getPasskeyPrfOutput({
      rpId: rpId(),
      credential: stored ? { credentialId: stored.credentialId, transports: stored.transports } : undefined,
    });
    const acct = startSession(result.prfOutput);
    const credential: StoredCredential = {
      credentialId: result.credentialId,
      transports: stored?.credentialId === result.credentialId ? stored.transports : undefined,
      name: stored?.credentialId === result.credentialId ? stored.name : "",
      address: acct.address,
    };
    storeCredential(credential);
    return { account: acct, credential };
  } catch (error) {
    throw wrap(error);
  }
}

// The signed-in account, if the session is still open.
export function currentAccount(): LocalAccount | null {
  if (account) touch();
  return account;
}

export async function requireAccount(): Promise<LocalAccount> {
  return currentAccount() ?? (await signIn()).account;
}

// Derives the event's door key with one passkey prompt. Call `end` as soon as the signature is made.
export async function deriveDoorKey(eventId: bigint): Promise<{ address: Address; account: LocalAccount; end: () => void }> {
  const stored = storedCredential();
  try {
    const result = await getPasskeyPrfOutput({
      rpId: rpId(),
      credential: stored ? { credentialId: stored.credentialId, transports: stored.transports } : undefined,
      prfSalt: doorKeySalt(eventId),
    });
    const doorSession = createSecp256k1SigningSession({ privateKey: result.prfOutput });
    const doorAccount = toViemAccount(doorSession);
    rememberDoorKey(eventId, doorAccount.address);
    return { address: doorAccount.address, account: doorAccount, end: () => doorSession.end() };
  } catch (error) {
    throw wrap(error);
  }
}

function doorKeys(): Record<string, Address> {
  try {
    return JSON.parse(localStorage.getItem(DOOR_KEYS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function rememberDoorKey(eventId: bigint, address: Address) {
  localStorage.setItem(DOOR_KEYS_KEY, JSON.stringify({ ...doorKeys(), [`${chain.id}:${eventId}`]: address }));
}

// Door key addresses are public, so they're cached to avoid a second prompt when it's only needed for display.
export function knownDoorKey(eventId: bigint): Address | undefined {
  return doorKeys()[`${chain.id}:${eventId}`];
}
