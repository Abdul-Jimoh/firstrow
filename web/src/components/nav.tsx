"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useAccount } from "./account";
import { BlockClock } from "./block-clock";
import { Logo } from "./logo";

const links = [
  { href: "/events", label: "Events" },
  { href: "/tickets", label: "My tickets" },
  { href: "/host", label: "My events" },
];

function subscribeScroll(listener: () => void) {
  window.addEventListener("scroll", listener, { passive: true });
  return () => window.removeEventListener("scroll", listener);
}

// At the top the nav floats over the page. Once content scrolls under it, it becomes a solid bar and drops the
// tagline and block clock so nothing shows through or overlaps.
const useScrolled = () => useSyncExternalStore(subscribeScroll, () => window.scrollY > 24, () => false);

export function Nav() {
  const { address, name, ready, openSheet } = useAccount();
  const pathname = usePathname();
  const scrolled = useScrolled();
  const secondary = scrolled ? "hidden" : "hidden opacity-70 sm:block";

  return (
    <header
      className={`gutter fixed inset-x-0 top-0 z-40 text-ink transition-[padding,background-color,border-color] duration-300 ${
        scrolled ? "border-b border-ink/15 bg-paper py-3" : "border-b border-transparent pt-5 pb-3"
      }`}
    >
      <div className="flex items-start justify-between gap-6">
        <div>
          <Link href="/" className="headline flex items-center gap-2.5 text-2xl tracking-tight">
            <Logo mono className="size-7" />
            Firstrow
          </Link>
          <p className={`label mt-1 ${secondary}`}>Tickets tied to a person</p>
        </div>

        <nav className="hidden gap-6 pt-1.5 md:flex" aria-label="Main">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={`label ${pathname.startsWith(l.href) ? "" : "opacity-60 hover:opacity-100"}`}>
              {pathname.startsWith(l.href) ? "■ " : "□ "}
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col items-end gap-1.5">
          {ready && (address ? (
            <Link href="/tickets" className="label rounded-full border border-current px-4 py-2">
              {name || `${address.slice(0, 6)}…${address.slice(-4)}`}
            </Link>
          ) : (
            <button onClick={openSheet} className="label rounded-full border border-current px-4 py-2">
              Sign in
            </button>
          ))}
          <BlockClock className={secondary} />
        </div>
      </div>
      <nav className={`flex gap-5 md:hidden ${scrolled ? "mt-2" : "mt-4"}`} aria-label="Main mobile">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className={`label ${pathname.startsWith(l.href) ? "" : "opacity-60"}`}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
