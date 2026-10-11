import Link from "next/link";
import { explorer, network } from "@/lib/chain";
import { RowMark } from "./row-mark";

export function Footer() {
  return (
    <footer className="bg-ink text-paper">
      <div className="gutter grid gap-12 pt-24 pb-10 md:grid-cols-[1.4fr_1fr]">
        <h2 className="display text-[clamp(3rem,8vw,7.5rem)]">
          Ready to host
          <br />
          something real?
        </h2>
        <div className="flex flex-col justify-end gap-3 md:items-end">
          {[
            { href: "/host/new", label: "Create an event" },
            { href: "/events", label: "Find something to go to" },
          ].map((l, i) => (
            <Link key={l.href} href={l.href} className={`flex w-full max-w-xs items-center justify-between px-5 py-4 font-medium transition-colors ${i === 0 ? "bg-signal text-ink hover:brightness-95" : "border border-paper text-paper hover:bg-paper hover:text-ink"}`}>
              {l.label} <span aria-hidden>→</span>
            </Link>
          ))}
        </div>
      </div>
      <div className="gutter grid gap-6 pb-10 text-paper/60 sm:grid-cols-3">
        <p className="label">© Firstrow 2026</p>
        <p className="label">Built on Monad · paid in AUSD · signed with passkeys</p>
        <a
          className="label sm:text-right"
          href={`${explorer}/address/${network.firstrow}`}
          target="_blank"
          rel="noreferrer"
        >
          Contract ↗
        </a>
      </div>
      <div className="gutter pb-6">
        <RowMark />
      </div>
    </footer>
  );
}
