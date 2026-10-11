"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "./account";
import { BlockClock } from "./block-clock";
import { Logo } from "./logo";

const links = [
  { href: "/events", label: "Events" },
  { href: "/tickets", label: "My tickets" },
  { href: "/host", label: "Host" },
];

export function Nav() {
  const { address, name, ready, openSheet } = useAccount();
  const pathname = usePathname();

  return (
    <header className="gutter pointer-events-none fixed inset-x-0 top-0 z-40 pt-5 text-paper mix-blend-difference">
      <div className="flex items-start justify-between gap-6">
        <div className="pointer-events-auto">
          <Link href="/" className="headline flex items-center gap-2.5 text-2xl tracking-tight">
            <Logo mono className="size-7" />
            Firstrow
          </Link>
          <p className="label mt-1 hidden opacity-70 sm:block">Tickets tied to a person</p>
        </div>

        <nav className="pointer-events-auto hidden gap-6 pt-1.5 md:flex" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`label ${pathname.startsWith(l.href) ? "" : "opacity-60 hover:opacity-100"}`}>
              {pathname.startsWith(l.href) ? "■ " : "□ "}
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="pointer-events-auto flex flex-col items-end gap-1.5">
          {ready && (address ? (
            <Link href="/tickets" className="label rounded-full border border-current px-4 py-2">
              {name || `${address.slice(0, 6)}…${address.slice(-4)}`}
            </Link>
          ) : (
            <button onClick={openSheet} className="label rounded-full border border-current px-4 py-2">
              Sign in
            </button>
          ))}
          <BlockClock className="hidden opacity-60 sm:block" />
        </div>
      </div>
      <nav className="pointer-events-auto mt-4 flex gap-5 md:hidden" aria-label="Main mobile">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={`label ${pathname.startsWith(l.href) ? "" : "opacity-60"}`}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
