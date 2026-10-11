"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAccount } from "@/components/account";
import { Reveal } from "@/components/motion";
import { QR } from "@/components/qr";
import { Shell } from "@/components/shell";
import { TicketStub, ticketTint } from "@/components/ticket-stub";
import { Button, Notice, Pill, SmallButton, SmallLink } from "@/components/ui";
import { chain } from "@/lib/chain";
import { dateLabel, formatAusd, timeLabel, type EventView, type TicketView } from "@/lib/events";
import { useAusd, useEvents, useTickets } from "@/lib/hooks";
import { ticketState } from "@/lib/ticket-status";

type Row = { ticket: TicketView; event: EventView };

function TicketList({ title, rows, holder }: { title: string; rows: Row[]; holder: string }) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-14">
      <h2 className="label border-b border-ink pb-3">
        {title} · {rows.length}
      </h2>
      <div className="mt-8 grid gap-10 lg:grid-cols-2">
        {rows.map(({ ticket, event }) => {
          const state = ticketState(ticket.status, event);
          return (
            <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="group block min-w-0">
              <div className="transition-transform duration-500 group-hover:-translate-y-1">
                <TicketStub
                  title={event.meta.name}
                  date={`${dateLabel(event.startsAt)}, ${timeLabel(event.startsAt)}`}
                  venue={event.meta.venue || event.meta.city}
                  holder={holder}
                  tier={event.tiers[ticket.tier]?.name ?? ""}
                  number={`#${ticket.id}`}
                  tint={ticketTint(event.id)}
                  spent={!state.usable}
                  status={<Pill tone={state.tone}>{state.label}</Pill>}
                />
              </div>
              <p className="label mt-3 flex items-center justify-between">
                <span className={state.usable ? "font-medium text-ink" : "text-ink-2"}>
                  {state.usable ? "Open to show at the door, or sell it" : "Open ticket"}
                </span>
                <span aria-hidden>→</span>
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default function TicketsPage() {
  const { address, name, ready, openSheet, signOut, rename } = useAccount();
  const { data: tickets, isLoading } = useTickets(address);
  const { data: events } = useEvents();
  const { data: balance } = useAusd(address);
  const queryClient = useQueryClient();
  const [toppingUp, setToppingUp] = useState(false);
  const [topUpError, setTopUpError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  async function saveName() {
    if (!naming?.trim()) return;
    setSavingName(true);
    setTopUpError(null);
    try {
      await rename(naming.trim());
      setNaming(null);
    } catch (e) {
      setTopUpError(e instanceof Error ? e.message : "Couldn't save your name.");
    } finally {
      setSavingName(false);
    }
  }

  const byId = new Map((events ?? []).map((e) => [e.id, e]));
  const rows = (tickets ?? []).flatMap((ticket) => {
    const event = byId.get(ticket.eventId);
    return event ? [{ ticket, event }] : [];
  });
  rows.sort((a, b) => a.event.startsAt.getTime() - b.event.startsAt.getTime());
  const current = rows.filter((r) => ticketState(r.ticket.status, r.event).usable);
  const past = rows.filter((r) => !ticketState(r.ticket.status, r.event).usable).reverse();

  async function topUp() {
    setToppingUp(true);
    setTopUpError(null);
    try {
      const res = await fetch("/api/faucet", { method: "POST", body: JSON.stringify({ address }) });
      if (!res.ok) throw new Error((await res.json()).error ?? "Couldn't add test dollars.");
      await queryClient.invalidateQueries({ queryKey: ["ausd"] });
    } catch (e) {
      setTopUpError(e instanceof Error ? e.message : "Couldn't add test dollars.");
    } finally {
      setToppingUp(false);
    }
  }

  return (
    <Shell>
      <Reveal as="h1" lines immediate className="display text-[clamp(3.5rem,10vw,9rem)]">
        My tickets
      </Reveal>

      {!ready ? null : !address ? (
        <div className="mt-12 max-w-md space-y-6">
          <p className="lede text-ink-2">Your tickets live on your passkey. Sign in to see them.</p>
          <Button onClick={openSheet} className="w-full">
            <span className="text-lg">Sign in</span>
          </Button>
        </div>
      ) : (
        <>
          <section className="mt-10 grid gap-6 bg-ink p-5 text-paper sm:p-6 md:grid-cols-[1fr_auto] md:items-end">
            <div className="min-w-0">
              <p className="label text-paper/60">Signed in as</p>
              {naming !== null ? (
                <form
                  className="mt-2 flex max-w-sm items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveName();
                  }}
                >
                  <input
                    autoFocus
                    aria-label="Your name"
                    maxLength={40}
                    value={naming}
                    onChange={(e) => setNaming(e.target.value)}
                    placeholder="Name on your tickets"
                    className="w-full border-b border-paper/50 bg-transparent pb-1 text-xl outline-none placeholder:text-paper/40 focus:border-paper"
                  />
                  <SmallButton type="submit" variant="primary" busy={savingName}>
                    Save
                  </SmallButton>
                </form>
              ) : (
                <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
                  <span className="headline truncate text-2xl">{name || `${address.slice(0, 6)}…${address.slice(-4)}`}</span>
                  <button className="label text-paper/70 underline underline-offset-4 hover:text-paper" onClick={() => setNaming(name)}>
                    {name ? "Change" : "Add your name"}
                  </button>
                </p>
              )}
              <p className="label mt-5 text-paper/60">Balance</p>
              <p className="display mt-1 text-5xl tabular-nums">{formatAusd(balance ?? 0n, { free: false })}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {chain.testnet && (
                <SmallButton variant="primary" busy={toppingUp} onClick={topUp}>
                  + Add $100 test dollars
                </SmallButton>
              )}
              <SmallButton variant="paper" onClick={() => setReceiving((r) => !r)}>
                {receiving ? "Hide address" : "Receive money"}
              </SmallButton>
              <SmallLink href={`/fans/${address}`} variant="paper">
                My record
              </SmallLink>
            </div>
          </section>

          {topUpError && (
            <div className="mt-4">
              <Notice tone="error">{topUpError}</Notice>
            </div>
          )}

          {receiving && (
            <div className="mt-4 grid max-w-2xl items-center gap-6 bg-paper-2 p-6 sm:grid-cols-[10rem_1fr]">
              <QR value={address} label="Your account address" className="w-40" />
              <div className="min-w-0">
                <p className="headline text-2xl">Send AUSD on Monad to your account.</p>
                <p className="mt-2 text-sm text-ink-2">From an exchange or another wallet. It arrives in under a second and shows up as your balance.</p>
                <p className="label mt-4 break-all text-ink-2">{address}</p>
                <SmallButton className="mt-3" onClick={() => navigator.clipboard.writeText(address)}>
                  Copy address
                </SmallButton>
              </div>
            </div>
          )}

          {isLoading ? (
            <p className="label mt-14 text-mute">Reading the chain…</p>
          ) : rows.length === 0 ? (
            <div className="mt-14 max-w-md space-y-5">
              <p className="headline text-3xl">No tickets yet.</p>
              <p className="text-ink-2">Tickets you buy show up here, ready to show at the door.</p>
              <SmallLink href="/events" variant="primary">
                Find an event →
              </SmallLink>
            </div>
          ) : (
            <>
              <TicketList title="Coming up" rows={current} holder={name || "You"} />
              <TicketList title="Past" rows={past} holder={name || "You"} />
            </>
          )}

          <div className="mt-20 border-t rule pt-6">
            <button onClick={signOut} className="label text-ink-2 link-line">
              Sign out of this device
            </button>
          </div>
        </>
      )}
    </Shell>
  );
}
