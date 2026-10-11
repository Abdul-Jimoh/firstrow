"use client";

import { useGSAP } from "@gsap/react";
import { useQuery } from "@tanstack/react-query";
import gsap from "gsap";
import Link from "next/link";
import { useRef } from "react";
import { fetchEvents } from "@/lib/events";
import { fetchTotals } from "@/lib/indexer";
import { EventCard } from "./event-card";
import { EASE, prefersReducedMotion, Reveal } from "./motion";
import { RowMark } from "./row-mark";
import { TicketStub } from "./ticket-stub";
import { Pill } from "./ui";

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-stub]", { y: 120, rotate: 6, autoAlpha: 0, duration: 1.6, ease: EASE, delay: 0.35 });
      gsap.to("[data-stub]", {
        yPercent: -18,
        rotate: -9,
        ease: "none",
        scrollTrigger: { trigger: root.current, start: "top top", end: "bottom top", scrub: true },
      });
      gsap.from("[data-cta]", { y: 16, autoAlpha: 0, duration: 1, ease: EASE, stagger: 0.08, delay: 0.6 });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="gutter relative grid min-h-dvh grid-rows-[1fr_auto] pt-36 pb-10 md:pt-40">
      <div className="grid items-center gap-16 md:grid-cols-[1.35fr_1fr]">
        <div>
          <Reveal immediate>
            <p className="label text-ink-2">[ Season 01 — live on Monad testnet ]</p>
          </Reveal>
          <Reveal as="h1" lines immediate delay={0.1} className="display mt-6 text-[clamp(3.6rem,11vw,10.5rem)]">
            Be in the first row.
          </Reveal>
          <Reveal immediate delay={0.35}>
            <p className="lede mt-8 max-w-xl text-ink-2">
              Tickets tied to you, not an email. Your money waits in escrow until you&apos;re through the door, and every
              show you make it to goes on the record, so hosts can look after the people who were there first.
            </p>
          </Reveal>
          <div className="mt-10 flex max-w-md flex-col gap-3">
            <Link
              href="/events"
              data-cta
              className="flex items-center justify-between bg-signal px-5 py-4 text-lg font-medium text-ink transition-[filter] hover:brightness-95"
            >
              Find an event <span aria-hidden>→</span>
            </Link>
            <Link
              href="/host/new"
              data-cta
              className="flex items-center justify-between border border-ink px-5 py-4 text-lg font-medium transition-colors hover:bg-ink hover:text-paper"
            >
              Host an event <span aria-hidden>→</span>
            </Link>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md md:mx-0 md:justify-self-end">
          <div data-stub className="rotate-[-4deg]">
            <TicketStub
              title="Lagos Late Night Jazz"
              date="Fri 17 Oct, 21:00"
              venue="Freedom Park"
              holder="Ada Obi"
              tier="Front row"
              number="007"
              tint="#d9cfe8"
              status={<Pill tone="go">Valid</Pill>}
            />
          </div>
          <p className="label mt-8 text-center text-mute md:text-right">Supporter No. 007 · since your first show</p>
        </div>
      </div>
      <div className="label mt-16 flex justify-between text-mute">
        <span>Scroll</span>
        <span>Hover the rows ↓</span>
      </div>
    </section>
  );
}

export function Mark() {
  return (
    <section className="gutter pb-16" aria-hidden>
      <RowMark />
    </section>
  );
}

const steps = [
  {
    title: "Pay into escrow",
    body: "Buy with Face ID or your fingerprint. Your dollars sit in a contract, not in the host's account.",
  },
  {
    title: "Walk through the door",
    body: "Your phone shows a code only your passkey can make. One scan, settled in under a second.",
  },
  {
    title: "The host gets paid",
    body: "Each ticket's money goes to the host when its holder walks in. Cancelled? Claim it back yourself, no support ticket.",
  },
];

export function HowItWorks() {
  return (
    <section className="bg-ink text-paper">
      <div className="gutter py-24 md:py-36">
        <div className="flex items-baseline justify-between">
          <p className="label">[01] How it works</p>
          <p className="label hidden opacity-60 sm:block">Money moves when people do</p>
        </div>
        <Reveal as="h2" lines className="display mt-10 max-w-5xl text-[clamp(2.75rem,7vw,6.5rem)]">
          The money waits at the door.
        </Reveal>
        <div className="mt-20 grid gap-px bg-paper/15 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.08} className="bg-ink py-8 md:px-10 md:first:pl-0 md:last:pr-0">
              <p className="display text-7xl tabular-nums text-paper/25">{String(i + 1).padStart(2, "0")}</p>
              <p className="headline mt-8 text-2xl">{s.title}</p>
              <p className="mt-3 max-w-sm text-paper/70">{s.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Supporters() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = root.current?.querySelector("[data-count]");
      if (!el || prefersReducedMotion()) return;
      const state = { n: 999 };
      gsap.to(state, {
        n: 1,
        duration: 2.4,
        ease: "expo.out",
        scrollTrigger: { trigger: el, start: "top 80%", once: true },
        onUpdate: () => (el.textContent = String(Math.round(state.n)).padStart(3, "0")),
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="gutter py-24 md:py-36">
      <p className="label">[02] Early supporters</p>
      <div className="mt-10 grid items-end gap-12 md:grid-cols-[1.2fr_1fr]">
        <p className="display text-[clamp(7rem,26vw,24rem)] leading-[0.8] tabular-nums">
          <span className="mr-4 align-top text-[0.3em] tracking-normal">No.</span>
          <span data-count>001</span>
        </p>
        <div className="max-w-md pb-6">
          <Reveal as="p" className="lede text-3xl md:text-4xl">
            The first person through the door at a host&apos;s first show is their supporter No.&nbsp;001. For good.
          </Reveal>
          <Reveal as="p" delay={0.1} className="mt-6 text-ink-2">
            Every check-in is written onchain, so attendance becomes a record nobody can fake or buy. Hosts open presales
            to the people who actually showed up. No algorithm, no bots, no queue-jumping.
          </Reveal>
        </div>
      </div>
    </section>
  );
}

const rules = [
  ["Resale at face value", "Tickets can change hands, but only through Firstrow, at the price the host allows, with a cut back to the host."],
  ["Hosts can't fake a check-in", "Every scan carries the ticket holder's own signature. No scan, no payout."],
  ["Refund yourself", "Cancelled, or you never got in? Your money comes back from the contract, not from a support inbox."],
  ["No seed phrase, no gas, no app", "A passkey is your account. Firstrow covers the network fees."],
];

export function Rules() {
  return (
    <section className="gutter pb-24 md:pb-36">
      <div className="flex items-baseline justify-between border-b border-ink pb-4">
        <p className="label">[03] Written into the contract</p>
        <p className="label hidden text-mute sm:block">Not a policy page</p>
      </div>
      {rules.map(([title, body], i) => (
        <Reveal key={title} delay={i * 0.04} className="grid gap-2 border-b rule py-6 md:grid-cols-[3rem_1fr_1fr] md:gap-8">
          <span className="label text-mute">{String(i + 1).padStart(2, "0")}</span>
          <p className="headline text-2xl md:text-3xl">{title}</p>
          <p className="text-ink-2">{body}</p>
        </Reveal>
      ))}
    </section>
  );
}

export function Upcoming() {
  const { data, isLoading } = useQuery({ queryKey: ["events"], queryFn: () => fetchEvents(12) });
  const upcoming = (data ?? [])
    .filter((e) => !e.cancelled && e.endsAt > new Date())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, 6);

  return (
    <section className="gutter pb-24 md:pb-36">
      <div className="flex items-baseline justify-between">
        <p className="label">■ Upcoming events</p>
        <Link href="/events" className="label link-line">
          Explore all ↳
        </Link>
      </div>
      {isLoading ? (
        <p className="label mt-10 text-mute">Reading the chain…</p>
      ) : upcoming.length === 0 ? (
        <div className="mt-10 border border-dashed border-ink/30 p-10">
          <p className="headline text-2xl">Nothing on yet.</p>
          <Link href="/host/new" className="label link-line mt-4 inline-block">
            Be the first host →
          </Link>
        </div>
      ) : (
        <div className="mt-10 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {upcoming.map((e, i) => (
            <EventCard key={e.id} event={e} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

// Live counts from the Envio indexer. Hidden when it isn't reachable.
export function Totals() {
  const { data } = useQuery({ queryKey: ["totals"], queryFn: fetchTotals, refetchInterval: 10_000 });
  if (!data) return null;
  const cells: [string, number][] = [
    ["Events", data.events],
    ["Tickets sold", data.ticketsSold],
    ["Through the door", data.checkIns],
    ["Supporters on record", data.supporters],
  ];
  return (
    <section className="gutter pb-24 md:pb-36">
      <div className="flex items-baseline justify-between border-b border-ink pb-4">
        <p className="label">[04] On the record so far</p>
        <p className="label hidden text-mute sm:block">Live from Monad, indexed by Envio</p>
      </div>
      <div className="grid grid-cols-2 gap-y-10 pt-10 md:grid-cols-4">
        {cells.map(([label, value]) => (
          <div key={label}>
            <p className="display text-[clamp(3.5rem,8vw,7rem)] tabular-nums">{value.toLocaleString("en-US")}</p>
            <p className="label mt-3 text-mute">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
