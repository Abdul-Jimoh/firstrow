"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Address, LocalAccount } from "viem";
import {
  currentAccount,
  forget,
  PasskeyError,
  signIn as passkeySignIn,
  signUp as passkeySignUp,
  storedCredential,
  subscribeCredential,
} from "@/lib/passkey";

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
};

const AccountContext = createContext<AccountContextValue | null>(null);

export function AccountProvider({ children }: { children: ReactNode }) {
  // undefined on the server, so nothing account-specific renders before hydration.
  const credential = useSyncExternalStore(subscribeCredential, storedCredential, () => undefined);
  const [sheetOpen, setSheetOpen] = useState(false);

  const signUp = useCallback(async (displayName: string) => {
    const { account } = await passkeySignUp(displayName);
    setSheetOpen(false);
    return account;
  }, []);

  const signIn = useCallback(async () => {
    const { account } = await passkeySignIn();
    setSheetOpen(false);
    return account;
  }, []);

  const unlock = useCallback(async () => currentAccount() ?? signIn(), [signIn]);

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
    }),
    [credential, sheetOpen, signUp, signIn, unlock],
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
