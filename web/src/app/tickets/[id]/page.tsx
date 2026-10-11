"use client";

import { useGSAP } from "@gsap/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import gsap from "gsap";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { LocalAccount } from "viem";
import { errorMessage, useAccount } from "@/components/account";
import { EASE, prefersReducedMotion } from "@/components/motion";
import { QR } from "@/components/qr";
import { Shell } from "@/components/shell";
import { TicketStub, ticketTint } from "@/components/ticket-stub";
import { Button, Field, inputClass, Notice, Panel, Pill, SmallButton } from "@/components/ui";
import { firstrowAbi } from "@/lib/abi";
import { network, publicClient } from "@/lib/chain";
import { encodeEntry } from "@/lib/entry";
import { dateLabel, formatAusd, parseAusd, phaseOf, TicketStatus, timeLabel } from "@/lib/events";
import { useEvent, useSupporter, useTickets } from "@/lib/hooks";
import { deriveDoorKey } from "@/lib/passkey";
import { ticketState } from "@/lib/ticket-status";
import { send, signCheckIn } from "@/lib/signing";

const CODE_LIFETIME = 300;
const REFRESH_EVERY = 240;

const codeDeadline = () => BigInt(Math.floor(Date.now() / 1000) + CODE_LIFETIME);

export default function TicketPage() {
  const params = useParams<{ id: string }>();
  const ticketId = /^\d+$/.test(params.id) ? BigInt(params.id) : null;
  const { address, name, unlock } = useAccount();
  const { data: tickets } = useTickets(address);
  const ticket = tickets?.find((t) => t.id === ticketId);
  const { data: event } = useEvent(ticket?.eventId ?? null);
  const { data: supporter } = useSupporter(event?.host, address);
  const queryClient = useQueryClient();

  const { data: listing } = useQuery({
    queryKey: ["listing", ticketId?.toString()],
    enabled: ticketId !== null,
    refetchInterval: 6_000,
    queryFn: async () => {
      const [listed, price] = await Promise.all([
        publicClient.readContract({ address: network.firstrow, abi: firstrowAbi, functionName: "isListed", args: [ticketId!] }),
        publicClient.readContract({ address: network.firstrow, abi: firstrowAbi, functionName: "listingPrice", args: [ticketId!] }),
      ]);
      return { listed, price };
    },
  });

  // Every valid ticket this fan holds for the event goes into one code, so a group gets in with one scan.
  const group = (tickets ?? []).filter((t) => t.eventId === ticket?.eventId && t.status === TicketStatus.Valid);
  const groupIds = group.map((t) => t.id);
  const groupKey = groupIds.join(",");

  const door = useRef<{ account: LocalAccount; end: () => void } | null>(null);
  const [code, setCode] = useState<{ value: string; expires: number } | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resalePrice, setResalePrice] = useState("");
  const welcome = useRef<HTMLDivElement>(null);

  const sign = useCallback(async () => {
    if (!door.current || !ticket || groupIds.length === 0) return;
    const deadline = codeDeadline();
    const signature = await signCheckIn(door.current.account, ticket.eventId, groupIds, deadline);
    setCode({ value: encodeEntry({ eventId: ticket.eventId, ticketIds: groupIds, deadline, signature }), expires: Number(deadline) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.eventId, groupKey]);

  useEffect(() => {
    if (!code) return;
    const tick = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    const refresh = setTimeout(sign, REFRESH_EVERY * 1000);
    return () => {
      clearInterval(tick);
      clearTimeout(refresh);
    };
  }, [code, sign]);

  useEffect(() => () => door.current?.end(), []);

  const checkedIn = ticket?.status === TicketStatus.CheckedIn;
  useEffect(() => {
    if (!checkedIn) return;
    door.current?.end();
    door.current = null;
  }, [checkedIn]);

  useGSAP(
    () => {
      if (!checkedIn || prefersReducedMotion()) return;
      gsap.from("[data-welcome]", { yPercent: 100, duration: 1, ease: EASE });
      gsap.from("[data-welcome-line]", { y: 60, autoAlpha: 0, duration: 1.2, ease: EASE, stagger: 0.1, delay: 0.3 });
    },
    { scope: welcome, dependencies: [checkedIn] },
  );

  if (!address) return <Shell><p className="text-lg text-ink-2">Sign in to see this ticket.</p></Shell>;
  if (!tickets || (ticket && !event)) return <Shell><p className="label text-mute">Reading the chain…</p></Shell>;
  if (!ticket || !event) return <Shell><h1 className="display text-6xl">Not your ticket.</h1></Shell>;

  const phase = phaseOf(event);
  const face = event.tiers[ticket.tier]?.price ?? 0n;
  const cap = (face * BigInt(10_000 + event.resaleCapBps)) / 10_000n;
  const refundable =
    ticket.status === TicketStatus.Valid &&
    (event.cancelled || (now * 1000 > event.endsAt.getTime() && now * 1000 <= event.endsAt.getTime() + 7 * 864e5));
  const canShow = ticket.status === TicketStatus.Valid && (phase === "on-sale" || phase === "live" || phase === "presale" || phase === "upcoming");
  const checkInOpen = now * 1000 >= event.startsAt.getTime() - 6 * 3600e3;

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  const showCode = () =>
    run("code", async () => {
      door.current?.end();
      door.current = await deriveDoorKey(ticket.eventId);
      await sign();
    });

  const secondsLeft = code ? Math.max(0, code.expires - now) : 0;

  const state = ticketState(ticket.status, event, new Date(now * 1000));
  const number = supporter && supporter.number > 0 ? String(supporter.number).padStart(3, "0") : null;
  const canSell = !code && ticket.status === TicketStatus.Valid && !event.cancelled && phase !== "ended" && phase !== "live";

  return (
    <Shell footer={false}>
      <p className="label text-ink-2">
        <Link href="/tickets" className="link-line">
          ← My tickets
        </Link>
      </p>

      <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-14">
        <div className="min-w-0">
          <TicketStub
            title={event.meta.name}
            date={`${dateLabel(event.startsAt)}, ${timeLabel(event.startsAt)}`}
            venue={event.meta.venue || event.meta.city}
            holder={name || "You"}
            tier={event.tiers[ticket.tier]?.name ?? ""}
            number={`#${ticket.id}`}
            tint={ticketTint(event.id)}
            spent={!state.usable && !checkedIn}
            status={<Pill tone={listing?.listed && state.usable ? "warn" : state.tone}>{listing?.listed && state.usable ? "For sale" : state.label}</Pill>}
          />
          {number && (
            <p className="label mt-4 text-ink-2">
              You are supporter No. {number} of this host · {supporter!.shows} show{supporter!.shows === 1 ? "" : "s"}
            </p>
          )}
          <Link href={`/events/${event.id}`} className="label mt-3 inline-block link-line">
            Event details →
          </Link>
        </div>

        <div className="space-y-6">
          {checkedIn ? (
            <div ref={welcome} className="overflow-hidden">
              <div data-welcome className="bg-go p-8 text-paper">
                <p data-welcome-line className="display text-[clamp(3.5rem,9vw,6rem)]">
                  Welcome in.
                </p>
                {number && (
                  <p data-welcome-line className="lede mt-6 text-paper/90">
                    You&apos;re supporter No. {number} for this host, on the record for good.
                  </p>
                )}
              </div>
            </div>
          ) : code ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="headline text-3xl">Show this to the door.</h2>
                <Pill tone="go">Live</Pill>
              </div>
              <div className="bg-white p-6">
                <QR value={code.value} label="Entry code" className="mx-auto w-full max-w-sm" />
              </div>
              <p className="label text-ink-2">
                Admits {groupIds.length} · new code in {Math.max(0, secondsLeft - (CODE_LIFETIME - REFRESH_EVERY))}s
              </p>
              <Notice>Only your passkey can make this code, and it expires in minutes. A screenshot won&apos;t get anyone in.</Notice>
            </div>
          ) : canShow ? (
            <Panel>
              <h2 className="headline text-3xl">At the door</h2>
              <ol className="mt-5 space-y-3">
                {["Tap the button below.", "Confirm with your face or fingerprint.", "Hold the code up to the door scanner."].map((text, i) => (
                  <li key={text} className="flex items-baseline gap-3">
                    <span className="label flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-paper">{i + 1}</span>
                    <span>{text}</span>
                  </li>
                ))}
              </ol>
              {groupIds.length > 1 && <p className="mt-4 text-sm text-ink-2">One code covers all {groupIds.length} of your tickets for this event.</p>}
              <Button className="mt-6 w-full" busy={busy === "code"} onClick={showCode}>
                <span className="text-lg">{busy === "code" ? "Confirm with your passkey…" : "Show entry code"}</span>
              </Button>
              {!checkInOpen && (
                <p className="label mt-4 text-ink-2">
                  The door starts scanning 6 hours before {timeLabel(event.startsAt)} on {dateLabel(event.startsAt)}.
                </p>
              )}
            </Panel>
          ) : (
            <Panel>
              <p className="headline text-3xl">
                {ticket.status === TicketStatus.Refunded ? "Refunded." : event.cancelled ? "This event was cancelled." : "This event has ended."}
              </p>
              {refundable && <p className="mt-3 text-ink-2">Your money is still in escrow. Claim it back below.</p>}
            </Panel>
          )}

          {refundable && (
            <Button className="w-full" busy={busy === "refund"} onClick={() => run("refund", async () => send(await unlock(), "refund", [groupIds, address]))}>
              <span className="text-lg">
                Claim refund · {formatAusd(group.reduce((sum, t) => sum + (event.tiers[t.tier]?.price ?? 0n), 0n), { free: false })}
              </span>
            </Button>
          )}

          {canSell && (
            <Panel>
              <h2 className="headline text-2xl">Can&apos;t go? Sell this ticket.</h2>
              {listing?.listed ? (
                <div className="mt-4 space-y-4">
                  <Notice tone="warn">
                    On sale for {formatAusd(listing.price)}. It&apos;s shown on the event page, and you&apos;re paid the moment someone buys it
                    {event.royaltyBps > 0 ? `, minus the host's ${event.royaltyBps / 100}% cut` : ""}.
                  </Notice>
                  <SmallButton busy={busy === "unlist"} onClick={() => run("unlist", async () => send(await unlock(), "unlist", [ticket.id]))}>
                    Take it off sale
                  </SmallButton>
                </div>
              ) : (
                <>
                  <p className="mt-2 text-sm text-ink-2">
                    List it and it appears on the event page for others to buy. You&apos;re paid as soon as it sells
                    {event.royaltyBps > 0 ? ` (the host keeps ${event.royaltyBps / 100}%)` : ""}. Until then it&apos;s still yours to use.
                  </p>
                  <form
                    className="mt-5 grid grid-cols-[1fr_auto] items-end gap-4"
                    onSubmit={(e) => {
                      e.preventDefault();
                      run("list", async () => {
                        const price = resalePrice ? parseAusd(resalePrice) : face;
                        if (price > cap) throw new Error(`The host caps resale at ${formatAusd(cap, { free: false })}.`);
                        await send(await unlock(), "list", [ticket.id, price]);
                      });
                    }}
                  >
                    <Field label={`Your price in $ (up to ${formatAusd(cap, { free: false })})`}>
                      <input inputMode="decimal" placeholder={formatAusd(face, { free: false }).slice(1)} value={resalePrice} onChange={(e) => setResalePrice(e.target.value)} className={inputClass} />
                    </Field>
                    <SmallButton type="submit" variant="ink" busy={busy === "list"}>
                      List for sale
                    </SmallButton>
                  </form>
                </>
              )}
            </Panel>
          )}

          {error && <Notice tone="error">{error}</Notice>}
        </div>
      </div>
    </Shell>
  );
}
