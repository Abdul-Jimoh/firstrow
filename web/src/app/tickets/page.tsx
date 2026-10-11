"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAccount } from "@/components/account";
import { Reveal } from "@/components/motion";
import { QR } from "@/components/qr";
import { Shell } from "@/components/shell";
import { TicketStub } from "@/components/ticket-stub";
import { Button } from "@/components/ui";
import { chain } from "@/lib/chain";
import { dateLabel, formatAusd, TicketStatus, timeLabel, type EventView } from "@/lib/events";
import { useAusd, useEvents, useTickets } from "@/lib/hooks";

const statusPill = (status: TicketStatus, event: EventView) => {
  const [text, dark] =
    status === TicketStatus.CheckedIn
      ? ["Checked in", false]
      : status === TicketStatus.Refunded
        ? ["Refunded", false]
        : event.cancelled
          ? ["Cancelled", false]
          : event.endsAt < new Date()
            ? ["Unused", false]
            : ["Valid", true];
  return <span className={`label rounded-full px-2.5 py-1 ${dark ? "bg-ink text-paper" : "border border-ink/30 text-ink-2"}`}>{text}</span>;
};

export default function TicketsPage() {
  const { address, name, ready, openSheet, signOut } = useAccount();
  const { data: tickets, isLoading } = useTickets(address);
  const { data: events } = useEvents();
  const { data: balance } = useAusd(address);
  const queryClient = useQueryClient();
  const [toppingUp, setToppingUp] = useState(false);
  const [receiving, setReceiving] = useState(false);

  const byId = new Map((events ?? []).map((e) => [e.id, e]));
  const rows = (tickets ?? []).map((t) => ({ ticket: t, event: byId.get(t.eventId) })).filter((r) => r.event) as {
    ticket: NonNullable<typeof tickets>[number];
    event: EventView;
  }[];
  rows.sort((a, b) => b.event.startsAt.getTime() - a.event.startsAt.getTime());

  async function topUp() {
    setToppingUp(true);
    await fetch("/api/faucet", { method: "POST", body: JSON.stringify({ address }) });
    await queryClient.invalidateQueries({ queryKey: ["ausd"] });
    setToppingUp(false);
  }

  return (
    <Shell>
      <Reveal as="h1" lines immediate className="display text-[clamp(3.5rem,10vw,9rem)]">
        My tickets
      </Reveal>

      {!ready ? null : !address ? (
        <div className="mt-16 max-w-md space-y-6">
          <p className="text-lg text-ink-2">Your tickets live on your passkey. Sign in to see them.</p>
          <Button onClick={openSheet} className="w-full">
            <span className="text-lg">Sign in</span>
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-12 flex flex-wrap items-baseline gap-x-10 gap-y-4 border-t border-ink pt-5">
            <p className="label">
              <span className="text-mute">Signed in as</span> {name || "you"}
            </p>
            <p className="label">
              <span className="text-mute">Balance</span> {formatAusd(balance ?? 0n, { free: false })}
            </p>
            {chain.testnet && (
              <button onClick={topUp} disabled={toppingUp} className="label link-line disabled:opacity-40">
                {toppingUp ? "Adding…" : "+ Add test dollars"}
              </button>
            )}
            <button onClick={() => setReceiving((r) => !r)} className="label link-line">
              {receiving ? "Hide" : "Add money"}
            </button>
            <Link href={`/fans/${address}`} className="label link-line">
              Your record →
            </Link>
            <button onClick={signOut} className="label ml-auto text-mute link-line">
              Sign out of this device
            </button>
          </div>

          {receiving && (
            <div className="mt-8 grid max-w-2xl items-center gap-6 bg-paper-2 p-6 sm:grid-cols-[10rem_1fr]">
              <QR value={address} label="Your account address" className="w-40" />
              <div>
                <p className="headline text-2xl">Send AUSD on Monad to your account.</p>
                <p className="mt-2 text-sm text-ink-2">
                  From an exchange or another wallet. It arrives in under a second and shows up as your balance.
                </p>
                <button className="label mt-4 break-all text-left link-line" onClick={() => navigator.clipboard.writeText(address)}>
                  {address} · copy
                </button>
              </div>
            </div>
          )}

          <div className="mt-14">
            {isLoading ? (
              <p className="label text-mute">Reading the chain…</p>
            ) : rows.length === 0 ? (
              <p className="headline text-2xl text-ink-2">
                No tickets yet.{" "}
                <Link href="/events" className="link-line">
                  Find something to go to →
                </Link>
              </p>
            ) : (
              <div className="grid gap-8 lg:grid-cols-2">
                {rows.map(({ ticket, event }) => (
                  <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="block transition-transform duration-500 hover:-translate-y-1">
                    <TicketStub
                      title={event.meta.name}
                      date={`${dateLabel(event.startsAt)}, ${timeLabel(event.startsAt)}`}
                      venue={event.meta.venue || event.meta.city}
                      holder={name || "You"}
                      tier={event.tiers[ticket.tier]?.name ?? ""}
                      number={`#${ticket.id}`}
                      status={statusPill(ticket.status, event)}
                    />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}
