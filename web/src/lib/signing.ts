import {
  BaseError,
  concat,
  decodeErrorResult,
  encodeFunctionData,
  isHex,
  keccak256,
  toHex,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type Hex,
  type LocalAccount,
} from "viem";
import { firstrowAbi, forwarderAbi } from "./abi";
import { chain, network, publicClient } from "./chain";

export type ForwardRequest = {
  from: Address;
  to: Address;
  value: string;
  gas: string;
  deadline: number;
  data: Hex;
  signature: Hex;
};

export type Authorization = {
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
  v: number;
  r: Hex;
  s: Hex;
};

const REQUEST_TTL_SECONDS = 10 * 60;

const forwardRequestTypes = {
  ForwardRequest: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "gas", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint48" },
    { name: "data", type: "bytes" },
  ],
} as const;

const receiveTypes = {
  ReceiveWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

const checkInTypes = {
  CheckIn: [
    { name: "eventId", type: "uint256" },
    { name: "ticketIds", type: "uint256[]" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

// A call the contract would refuse. `reason` is the contract's error name, such as "SoldOut".
export class ContractRevert extends Error {
  constructor(readonly reason: string) {
    super(revertMessages[reason] ?? "That didn't go through. Please try again.");
  }
}

const revertMessages: Record<string, string> = {
  SoldOut: "Those tickets just sold out.",
  SaleNotOpen: "Tickets aren't on sale yet.",
  SaleClosed: "This event has ended.",
  PresaleLocked: "The presale is for fans who've been to this host's shows before.",
  EventIsCancelled: "This event was cancelled.",
  NotRefundable: "This ticket can't be refunded right now.",
  TicketNotValid: "This ticket has already been used or refunded.",
  PriceAboveCap: "That's above the resale price the host allows.",
  NotListed: "That ticket is no longer for sale.",
  OwnTicket: "That's your own listing.",
  NothingToWithdraw: "There's nothing to withdraw yet.",
  NotHost: "Only the host can do that.",
  NotOwner: "That ticket belongs to someone else.",
  InvalidSchedule: "Check the dates: the event has to start in the future and end after it starts.",
  InvalidTiers: "Add at least one ticket tier with at least one ticket.",
};

function revertData(error: unknown): Hex | undefined {
  if (!(error instanceof BaseError)) return undefined;
  const found = error.walk((e) => isHex((e as { data?: unknown }).data));
  return (found as { data?: Hex } | null)?.data;
}

// Estimation errors often arrive without the revert data, so replay the call to read the contract's own error.
async function revertReason(call: { account: Address; to: Address; data: Hex }, error: unknown): Promise<string> {
  let data = revertData(error);
  if (!data) {
    try {
      await publicClient.call(call);
    } catch (replayed) {
      data = revertData(replayed);
    }
  }
  if (!data) return "Unknown";
  try {
    return decodeErrorResult({ abi: firstrowAbi, data }).errorName;
  } catch {
    return "Unknown";
  }
}

type WriteName = ContractFunctionName<typeof firstrowAbi, "nonpayable">;

// Signs a forward request for a Firstrow call made by `account`. The relayer submits it and pays the gas.
export async function signForwardRequest<name extends WriteName>(
  account: LocalAccount,
  functionName: name,
  args: ContractFunctionArgs<typeof firstrowAbi, "nonpayable", name>,
): Promise<ForwardRequest> {
  const data = encodeFunctionData({ abi: firstrowAbi, functionName, args } as never);

  // Simulate the call exactly as the forwarder makes it: from the forwarder, with the signer appended.
  const forwarded = { account: network.forwarder, to: network.firstrow, data: concat([data, account.address]) };
  const [estimate, nonce] = await Promise.all([
    publicClient.estimateGas(forwarded).catch(async (error) => {
      throw new ContractRevert(await revertReason(forwarded, error));
    }),
    publicClient.readContract({
      address: network.forwarder,
      abi: forwarderAbi,
      functionName: "nonces",
      args: [account.address],
    }),
  ]);
  const gas = (estimate * 12n) / 10n;
  const deadline = Math.floor(Date.now() / 1000) + REQUEST_TTL_SECONDS;

  const signature = await account.signTypedData({
    domain: { name: "Firstrow", version: "1", chainId: chain.id, verifyingContract: network.forwarder },
    types: forwardRequestTypes,
    primaryType: "ForwardRequest",
    message: {
      from: account.address,
      to: network.firstrow,
      value: 0n,
      gas,
      nonce,
      deadline,
      data,
    },
  });

  return {
    from: account.address,
    to: network.firstrow,
    value: "0",
    gas: gas.toString(),
    deadline,
    data,
    signature,
  };
}

// EIP-3009 authorization letting the Firstrow contract pull `value` AUSD from the account.
export async function signPayment(account: LocalAccount, value: bigint): Promise<Authorization> {
  const validBefore = BigInt(Math.floor(Date.now() / 1000) + REQUEST_TTL_SECONDS);
  const nonce = keccak256(toHex(crypto.getRandomValues(new Uint8Array(32))));
  const signature = await account.signTypedData({
    domain: { name: "Agora Dollar", version: "1", chainId: chain.id, verifyingContract: network.ausd },
    types: receiveTypes,
    primaryType: "ReceiveWithAuthorization",
    message: { from: account.address, to: network.firstrow, value, validAfter: 0n, validBefore, nonce },
  });
  const r = `0x${signature.slice(2, 66)}` as Hex;
  const s = `0x${signature.slice(66, 130)}` as Hex;
  const v = parseInt(signature.slice(130, 132), 16);
  return { validAfter: 0n, validBefore, nonce, v, r, s };
}

// A free authorization for zero-priced tickets, which the contract ignores.
export const emptyAuthorization: Authorization = {
  validAfter: 0n,
  validBefore: 0n,
  nonce: `0x${"00".repeat(32)}`,
  v: 0,
  r: `0x${"00".repeat(32)}`,
  s: `0x${"00".repeat(32)}`,
};

// The fan's check-in signature, shown as a QR at the door. Made with the event's door key.
export async function signCheckIn(account: LocalAccount, eventId: bigint, ticketIds: bigint[], deadline: bigint) {
  return account.signTypedData({
    domain: { name: "Firstrow", version: "1", chainId: chain.id, verifyingContract: network.firstrow },
    types: checkInTypes,
    primaryType: "CheckIn",
    message: { eventId, ticketIds, deadline },
  });
}

export type RelayResult = { hash: Hex };

export async function relay(request: ForwardRequest): Promise<RelayResult> {
  const response = await fetch("/api/relay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Relay failed");
  return body;
}

// Signs and relays a Firstrow call in one step.
export async function send<name extends WriteName>(
  account: LocalAccount,
  functionName: name,
  args: ContractFunctionArgs<typeof firstrowAbi, "nonpayable", name>,
) {
  return relay(await signForwardRequest(account, functionName, args));
}
