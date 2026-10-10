"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage, useAccount } from "@/components/account";
import { Reveal } from "@/components/motion";
import { Poster } from "@/components/poster";
import { Shell } from "@/components/shell";
import { Button, Notice } from "@/components/ui";
import { buyResale, buyTickets } from "@/lib/actions";
import { chain } from "@/lib/chain";
import { dateLabel, formatAusd, phaseOf, timeLabel, TicketStatus } from "@/lib/events";
import { useAusd, useEvent, useListings, useSupporter, useTickets } from "@/lib/hooks";

export default function EventPage() {
  const params = useParams<{ id: string }>();
  const id = /^\d+$/.test(params.id) ? BigInt(params.id) : null;
  const { data: event, isLoading } = useEvent(id);
  const { address, unlock, openSheet } = useAccount();
  const { data: balance } = useAusd(address);
  const { data: supporter } = useSupporter(event?.host, address);
  const { data: tickets } = useTickets(address);
  const { data: listings } = useListings(id);
  const queryClient = useQueryClient();

  const [tier, setTier] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (isLoading) return <Shell><p className="label text-mute">Reading the chain…</p></Shell>;
  if (!event) return <Shell><h1 className="display text-6xl">No such event.</h1></Shell>;

  const phase = phaseOf(event);
  const selected = event.tiers[tier];
  const left = selected ? selected.supply - selected.sold : 0;
  const total = selected ? selected.price * BigInt(quantity) : 0n;
  const shows = supporter?.shows ?? 0;
  const presaleOk = phase === "presale" && shows >= event.presaleMinShows;
  const canBuy = phase === "on-sale" || phase === "live" || presaleOk;
  const mine = (tickets ?? []).filter((t) => t.eventId === event.id && t.status !== TicketStatus.Refunded);
  const short = balance !== undefined && total > balance;

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await action();
      setDone(true);
      await queryClient.invalidateQueries();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function topUp() {
    setBusy("faucet");
    setError(null);
    try {
      const res = await fetch("/api/faucet", { method: "POST", body: JSON.stringify({ address }) });
      if (!res.ok) throw new Error((await res.json()).error);
      await queryClient.invalidateQueries({ queryKey: ["ausd"] });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const phaseLabel = {
    cancelled: "Cancelled",
    upcoming: `On sale ${dateLabel(event.saleStartsAt)}`,
    presale: `Presale for returning fans`,
    "on-sale": "On sale",
    live: "Happening now",
    ended: "Ended",
  }[phase];

  return (
    <Shell>
      <div className="grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <div className="lg:sticky lg:top-36 lg:self-start">
          {event.meta.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.meta.poster} alt="" className="aspect-[3/4] w-full object-cover" />
          ) : (
            <Poster seed={`${event.id}:${event.meta.name}`} title={event.meta.name} />
          )}
        </div>

        <div>
          <p className="label flex items-center gap-3">
            <span className={`inline-block size-2 rounded-full ${phase === "on-sale" || phase === "live" ? "bg-signal" : "bg-mute"}`} />
            {phaseLabel}
          </p>
          <Reveal as="h1" lines immediate className="display mt-6 text-[clamp(3rem,7vw,6.5rem)]">
            {event.meta.name}
          </Reveal>

          <dl className="mt-10 grid grid-cols-2 gap-6 border-t border-ink pt-6 sm:grid-cols-3">
            <div>
              <dt className="label text-mute">Date</dt>
              <dd className="mt-1">{dateLabel(event.startsAt)}</dd>
            </div>
            <div>
              <dt className="label text-mute">Doors</dt>
              <dd className="mt-1">
                {timeLabel(event.startsAt)}–{timeLabel(event.endsAt)}
              </dd>
            </div>
            <div>
              <dt className="label text-mute">Where</dt>
              <dd className="mt-1">{[event.meta.venue, event.meta.city].filter(Boolean).join(", ") || "TBA"}</dd>
            </div>
          </dl>

          {event.meta.description && <p className="mt-10 max-w-2xl text-lg whitespace-pre-line text-ink-2">{event.meta.description}</p>}

          {address && shows > 0 && (
            <div className="mt-10 flex items-baseline gap-4 bg-ink px-5 py-4 text-paper">
              <span className="accent text-3xl">No.</span>
              <span className="display text-5xl tabular-nums">{String(supporter!.number).padStart(3, "0")}</span>
              <span className="label opacity-70">
                Your supporter number with this host · {shows} show{shows === 1 ? "" : "s"}
              </span>
            </div>
          )}

          <section className="mt-14">
            <p className="label">[ Tickets ]</p>
            <div className="mt-4 border-t border-ink">
              {event.tiers.map((t, i) => {
                const remaining = t.supply - t.sold;
                return (
                  <button
                    key={i}
                    onClick={() => setTier(i)}
                    disabled={remaining <= 0}
                    className={`grid w-full grid-cols-[1.5rem_1fr_auto] items-baseline gap-4 border-b rule py-5 text-left disabled:opacity-40 ${tier === i ? "" : "text-ink-2"}`}
                  >
                    <span className="label">{tier === i ? "■" : "□"}</span>
                    <span>
                      <span className="headline text-2xl">{t.name}</span>
                      <span className="label ml-3 text-mute">{remaining <= 0 ? "Sold out" : `${remaining} left`}</span>
                    </span>
                    <span className="headline text-2xl tabular-nums">{formatAusd(t.price)}</span>
                  </button>
                );
              })}
            </div>

            {event.presaleMinShows > 0 && phase === "presale" && (
              <div className="mt-6">
                <Notice tone={presaleOk ? "ok" : "info"}>
                  {presaleOk
                    ? `You're in the presale: you've been to ${shows} of this host's shows.`
                    : `Presale is for fans who've been to ${event.presaleMinShows}+ of this host's shows. Public sale opens ${dateLabel(event.saleStartsAt)} at ${timeLabel(event.saleStartsAt)}.`}
                </Notice>
              </div>
            )}

            {done ? (
              <div className="mt-8 bg-ink p-6 text-paper">
                <p className="display text-5xl">You&apos;re in.</p>
                <p className="mt-3 text-paper/70">Your ticket is tied to your passkey. Show it at the door from My tickets.</p>
                <Link href="/tickets" className="label mt-6 inline-block link-line">
                  Go to my tickets →
                </Link>
              </div>
            ) : canBuy && left > 0 ? (
              <div className="mt-8 space-y-5">
                <div className="flex items-center justify-between">
                  <span className="label text-mute">Quantity</span>
                  <div className="flex items-center gap-5">
                    <button className="label size-9 border border-ink" onClick={() => setQuantity((q) => Math.max(1, q - 1))} aria-label="Fewer">
                      −
                    </button>
                    <span className="headline w-6 text-center text-2xl tabular-nums">{quantity}</span>
                    <button
                      className="label size-9 border border-ink"
                      onClick={() => setQuantity((q) => Math.min(10, left, q + 1))}
                      aria-label="More"
                    >
                      +
                    </button>
                  </div>
                </div>
                {!address ? (
                  <Button className="w-full" onClick={openSheet}>
                    <span className="text-lg">Sign in to buy · {formatAusd(total)}</span>
                  </Button>
                ) : short ? (
                  <>
                    <Notice>You need {formatAusd(total, { free: false })} in your balance. You have {formatAusd(balance ?? 0n, { free: false })}.</Notice>
                    {chain.testnet && (
                      <Button className="w-full" variant="line" busy={busy === "faucet"} onClick={topUp}>
                        <span className="text-lg">Add $100 test dollars</span>
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    className="w-full"
                    busy={busy === "buy"}
                    onClick={() => run("buy", async () => buyTickets(await unlock(), event, tier, quantity))}
                  >
                    <span className="text-lg">{busy === "buy" ? "Confirm with your passkey…" : `Buy ${quantity} · ${formatAusd(total)}`}</span>
                  </Button>
                )}
                <p className="label text-mute">
                  Held in escrow until you&apos;re checked in · refundable if cancelled · no fees for you
                </p>
              </div>
            ) : null}

            {error && (
              <div className="mt-5">
                <Notice tone="error">{error}</Notice>
              </div>
            )}

            {mine.length > 0 && !done && (
              <Link href="/tickets" className="label mt-6 inline-block link-line">
                You have {mine.length} ticket{mine.length === 1 ? "" : "s"} for this →
              </Link>
            )}
          </section>

          {listings && listings.length > 0 && (
            <section className="mt-16">
              <p className="label">[ Resale · capped at {event.resaleCapBps === 0 ? "face value" : `+${event.resaleCapBps / 100}%`} ]</p>
              <div className="mt-4 border-t border-ink">
                {listings.map((l) => (
                  <div key={l.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b rule py-4">
                    <span>
                      {event.tiers[l.tier]?.name} <span className="label text-mute">#{l.id.toString()}</span>
                    </span>
                    <span className="headline text-xl tabular-nums">{formatAusd(l.price)}</span>
                    {l.seller.toLowerCase() === address?.toLowerCase() ? (
                      <span className="label text-mute">Yours</span>
                    ) : (
                      <button
                        className="label border border-ink px-3 py-2 disabled:opacity-40"
                        disabled={!!busy || !address || (balance ?? 0n) < l.price}
                        onClick={() => run(`resale-${l.id}`, async () => buyResale(await unlock(), event.id, l.id, l.price))}
                      >
                        {busy === `resale-${l.id}` ? "···" : "Buy"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </Shell>
  );
}
