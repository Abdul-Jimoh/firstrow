"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Address, LocalAccount } from "viem";
import {
  currentAccount,
  forget,
  PasskeyError,
  rememberName,
  signIn as passkeySignIn,
  signUp as passkeySignUp,
  storedCredential,
  subscribeCredential,
} from "@/lib/passkey";
import { fetchName, saveProfile } from "@/lib/profile";

type AccountContextValue = {
  address: Address | null;
  name: string;
  ready: boolean;
  sheetOpen: boolean;
  openSheet: () => void;
  closeSheet: () => void;
  signUp: (name: string) => Promise<LocalAccount>;
  signIn: () => Promise<LocalAccount>;
  signOut: () => void;
  // The unlocked account, prompting for the passkey when the session has ended.
  unlock: () => Promise<LocalAccount>;
  // Sets the display name shown on tickets and at the door.
  rename: (name: string) => Promise<void>;
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  // undefined on the server, so nothing account-specific renders before hydration.
  const credential = useSyncExternalStore(subscribeCredential, storedCredential, () => undefined);
  const [sheetOpen, setSheetOpen] = useState(false);

  const signUp = useCallback(async (displayName: string) => {
    const { account } = await passkeySignUp(displayName);
    setSheetOpen(false);
    // Saved with the account so the name follows it to other devices. Not worth blocking sign-up on.
    saveProfile(account, displayName).catch(() => {});
    return account;
  }, []);

  const signIn = useCallback(async () => {
    const { account, credential } = await passkeySignIn();
    setSheetOpen(false);
    // A new device learns the name from the saved profile; a device that knows it saves it if that never happened.
    fetchName(account.address)
      .then((saved) => {
        if (!credential.name && saved) rememberName(saved);
        else if (credential.name && !saved) return saveProfile(account, credential.name);
      })
      .catch(() => {});
    return account;
  }, []);

  const unlock = useCallback(async () => currentAccount() ?? signIn(), [signIn]);

  const rename = useCallback(
    async (displayName: string) => {
      await saveProfile(await unlock(), displayName);
      rememberName(displayName);
    },
    [unlock],
  );

  const value = useMemo(
    () => ({
      address: credential?.address ?? null,
      name: credential?.name ?? "",
      ready: credential !== undefined,
      sheetOpen,
      openSheet: () => setSheetOpen(true),
      closeSheet: () => setSheetOpen(false),
      signUp,
      signIn,
      signOut: forget,
      unlock,
      rename,
    }),
    [credential, sheetOpen, signUp, signIn, unlock, rename],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount outside AccountProvider");
  return ctx;
}

export function errorMessage(error: unknown) {
  if (error instanceof PasskeyError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong.";
}
