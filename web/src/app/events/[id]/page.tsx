"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { errorMessage, useAccount } from "@/components/account";
import { Reveal } from "@/components/motion";
import { Poster } from "@/components/poster";
import { Shell } from "@/components/shell";
import { Button, Notice, Panel, Pill, SmallButton, SmallLink, type Tone } from "@/components/ui";
import { buyResale, buyTickets } from "@/lib/actions";
import { chain } from "@/lib/chain";
import { dateLabel, formatAusd, phaseOf, soldOut, timeLabel, TicketStatus } from "@/lib/events";
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

  const sold = soldOut(event);
  const status: { label: string; tone: Tone } =
    phase === "cancelled"
      ? { label: "Cancelled", tone: "stop" }
      : phase === "ended"
        ? { label: "Ended", tone: "done" }
        : sold
          ? { label: "Sold out", tone: "stop" }
          : phase === "live"
            ? { label: "Happening now", tone: "go" }
            : phase === "on-sale"
              ? { label: "On sale", tone: "go" }
              : phase === "presale"
                ? { label: "Presale for returning fans", tone: "warn" }
                : { label: `On sale ${dateLabel(event.saleStartsAt)}`, tone: "done" };

  const open = phase !== "cancelled" && phase !== "ended";
  const resale = open ? (listings ?? []).filter((l) => l.seller.toLowerCase() !== address?.toLowerCase()) : [];
  const ownListings = open ? (listings ?? []).filter((l) => l.seller.toLowerCase() === address?.toLowerCase()) : [];
  const cheapest = resale.reduce<bigint | null>((min, l) => (min === null || l.price < min ? l.price : min), null);
  const valid = mine.filter((t) => t.status === TicketStatus.Valid);

  return (
    <Shell>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          {event.meta.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.meta.poster} alt="" className="aspect-[3/4] w-full bg-paper-2 object-cover" />
          ) : (
            <Poster seed={`${event.id}:${event.meta.name}`} title={event.meta.name} />
          )}
        </div>

        <div className="min-w-0">
          <Pill tone={status.tone}>{status.label}</Pill>
          <Reveal as="h1" lines immediate className="display mt-5 text-[clamp(3rem,7vw,6.5rem)]">
            {event.meta.name}
          </Reveal>

          {valid.length > 0 && !done && (
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 bg-go-soft p-4 text-go">
              <p className="font-medium">
                You have {valid.length} ticket{valid.length === 1 ? "" : "s"} for this.
              </p>
              <SmallLink href={`/tickets/${valid[0].id}`} variant="ink">
                Open my ticket →
              </SmallLink>
            </div>
          )}

          <dl className="mt-8 grid grid-cols-2 gap-6 border-t-2 border-ink pt-6 sm:grid-cols-3">
            <div>
              <dt className="label text-ink-2">Date</dt>
              <dd className="mt-1 font-medium">{dateLabel(event.startsAt)}</dd>
            </div>
            <div>
              <dt className="label text-ink-2">Doors</dt>
              <dd className="mt-1 font-medium">
                {timeLabel(event.startsAt)}–{timeLabel(event.endsAt)}
              </dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="label text-ink-2">Where</dt>
              <dd className="mt-1 font-medium">{[event.meta.venue, event.meta.city].filter(Boolean).join(", ") || "TBA"}</dd>
            </div>
          </dl>

          {event.meta.description && <p className="lede mt-8 max-w-2xl whitespace-pre-line text-ink-2">{event.meta.description}</p>}

          {address && shows > 0 && (
            <div className="mt-8 flex flex-wrap items-baseline gap-x-4 gap-y-1 bg-ink px-5 py-4 text-paper">
              <span className="display text-5xl tabular-nums">No. {String(supporter!.number).padStart(3, "0")}</span>
              <span className="label text-paper/70">
                Your supporter number with this host · {shows} show{shows === 1 ? "" : "s"}
              </span>
            </div>
          )}

          {open && (
            <section id="tickets" className="mt-12 scroll-mt-28">
              <h2 className="headline text-3xl">Tickets</h2>

              {cheapest !== null && (
                <a href="#resale" className="mt-4 flex items-center justify-between gap-4 bg-warn-soft px-4 py-3 text-warn">
                  <span className="font-medium">
                    {resale.length} resale ticket{resale.length === 1 ? "" : "s"} from fans, from {formatAusd(cheapest)}
                  </span>
                  <span className="label">See below ↓</span>
                </a>
              )}

              <div className="mt-5 space-y-2" role="radiogroup" aria-label="Ticket tier">
                {event.tiers.map((t, i) => {
                  const remaining = t.supply - t.sold;
                  const selected = tier === i && remaining > 0;
                  return (
                    <button
                      key={i}
                      role="radio"
                      aria-checked={selected}
                      onClick={() => {
                        setTier(i);
                        setQuantity(1);
                      }}
                      disabled={remaining <= 0}
                      className={`grid w-full grid-cols-[1.25rem_1fr_auto] items-center gap-4 border-2 px-4 py-4 text-left transition-colors disabled:cursor-not-allowed ${
                        selected ? "border-ink bg-paper-2" : "border-ink/15 hover:border-ink/50"
                      } ${remaining <= 0 ? "opacity-60" : ""}`}
                    >
                      <span className={`size-5 rounded-full border-2 ${selected ? "border-ink bg-signal shadow-[inset_0_0_0_3px_var(--color-paper-2)]" : "border-ink/40"}`} />
                      <span className="min-w-0">
                        <span className="headline block text-xl sm:text-2xl">{t.name}</span>
                        <span className={`label mt-1 block ${remaining <= 0 ? "text-stop" : remaining <= 10 ? "font-medium text-warn" : "text-ink-2"}`}>
                          {remaining <= 0 ? "Sold out" : remaining <= 10 ? `Only ${remaining} left` : `${remaining} left`}
                        </span>
                      </span>
                      <span className="headline text-2xl tabular-nums">{formatAusd(t.price)}</span>
                    </button>
                  );
                })}
              </div>

              {event.presaleMinShows > 0 && phase === "presale" && (
                <div className="mt-5">
                  <Notice tone={presaleOk ? "ok" : "warn"}>
                    {presaleOk
                      ? `You're in the presale: you've been to ${shows} of this host's shows.`
                      : `Presale is for fans who've been to ${event.presaleMinShows}+ of this host's shows. Public sale opens ${dateLabel(event.saleStartsAt)} at ${timeLabel(event.saleStartsAt)}.`}
                  </Notice>
                </div>
              )}

              {done ? (
                <div className="mt-6 bg-go p-6 text-paper">
                  <p className="display text-5xl">You&apos;re in.</p>
                  <p className="mt-3 text-paper/85">Your ticket is on your passkey. Open it at the door to show your entry code.</p>
                  <SmallLink href="/tickets" variant="paper" className="mt-5">
                    Open my tickets →
                  </SmallLink>
                </div>
              ) : canBuy && left > 0 ? (
                <div className="mt-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="label text-ink-2">How many</span>
                    <div className="flex items-center gap-4">
                      <button
                        className="size-11 border-2 border-ink text-xl disabled:opacity-30"
                        disabled={quantity <= 1}
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        aria-label="Fewer"
                      >
                        −
                      </button>
                      <span className="headline w-8 text-center text-3xl tabular-nums">{quantity}</span>
                      <button
                        className="size-11 border-2 border-ink text-xl disabled:opacity-30"
                        disabled={quantity >= Math.min(10, left)}
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
                      <Notice tone="warn">
                        You need {formatAusd(total, { free: false })} and have {formatAusd(balance ?? 0n, { free: false })}. Add money first, then buy.
                      </Notice>
                      {chain.testnet ? (
                        <Button className="w-full" busy={busy === "faucet"} onClick={topUp}>
                          <span className="text-lg">Add $100 test dollars</span>
                        </Button>
                      ) : (
                        <SmallLink href="/tickets" variant="primary">
                          Add money →
                        </SmallLink>
                      )}
                    </>
                  ) : (
                    <Button className="w-full" busy={busy === "buy"} onClick={() => run("buy", async () => buyTickets(await unlock(), event, tier, quantity))}>
                      <span className="text-lg">
                        {busy === "buy" ? "Confirm with your passkey…" : `Buy ${quantity} ticket${quantity === 1 ? "" : "s"} · ${formatAusd(total)}`}
                      </span>
                    </Button>
                  )}
                  <ul className="label flex flex-wrap gap-x-5 gap-y-1 text-ink-2">
                    {["Held in escrow until you're in", "Refund yourself if cancelled", "No fees"].map((line) => (
                      <li key={line}>
                        <span className="text-go">✓</span> {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : sold && cheapest === null ? (
                <div className="mt-6">
                  <Notice tone="info">Sold out. If a fan lists a ticket for resale, it will appear on this page.</Notice>
                </div>
              ) : null}

              {error && (
                <div className="mt-5">
                  <Notice tone="error">{error}</Notice>
                </div>
              )}
            </section>
          )}

          {(resale.length > 0 || ownListings.length > 0) && (
            <Panel className="mt-12 scroll-mt-28">
              <h2 id="resale" className="headline scroll-mt-28 text-3xl">
                Resale tickets
              </h2>
              <p className="mt-2 text-sm text-ink-2">
                From fans who can&apos;t make it. The host caps the price at {event.resaleCapBps === 0 ? "face value" : `face value +${event.resaleCapBps / 100}%`}, and the
                ticket moves to you the moment you pay.
              </p>
              <div className="mt-5 space-y-2">
                {[...resale, ...ownListings].map((l) => {
                  const own = l.seller.toLowerCase() === address?.toLowerCase();
                  const cannotAfford = !!address && (balance ?? 0n) < l.price;
                  return (
                    <div key={l.id} className="grid grid-cols-[1fr_auto] items-center gap-4 bg-paper px-4 py-3">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{event.tiers[l.tier]?.name}</span>
                        <span className="label text-ink-2">
                          Ticket #{l.id.toString()}
                          {cannotAfford && !own ? " · add money to buy" : ""}
                        </span>
                      </span>
                      {own ? (
                        <Pill tone="warn">Your listing · {formatAusd(l.price)}</Pill>
                      ) : (
                        <SmallButton
                          variant="primary"
                          busy={busy === `resale-${l.id}`}
                          disabled={!!busy || cannotAfford}
                          onClick={() => (address ? run(`resale-${l.id}`, async () => buyResale(await unlock(), event.id, l.id, l.price)) : openSheet())}
                        >
                          Buy · {formatAusd(l.price)}
                        </SmallButton>
                      )}
                    </div>
                  );
                })}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </Shell>
  );
}
