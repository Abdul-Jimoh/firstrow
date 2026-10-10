"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AccountProvider } from "./account";
import { SignInSheet } from "./sign-in-sheet";
import { SmoothScroll } from "./motion";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, refetchOnWindowFocus: true } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <AccountProvider>
        <SmoothScroll>
          {children}
          <SignInSheet />
        </SmoothScroll>
      </AccountProvider>
    </QueryClientProvider>
  );
}
