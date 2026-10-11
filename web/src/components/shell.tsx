import type { ReactNode } from "react";
import { Footer } from "./footer";

export function Shell({ children, footer = true }: { children: ReactNode; footer?: boolean }) {
  return (
    <>
      <main className="gutter min-h-dvh pt-36 pb-24 md:pt-40">{children}</main>
      {footer && <Footer />}
    </>
  );
}
