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
import { TicketStub } from "@/components/ticket-stub";
import { Button, Field, inputClass, Notice } from "@/components/ui";
import { firstrowAbi } from "@/lib/abi";
import { network, publicClient } from "@/lib/chain";
import { encodeEntry } from "@/lib/entry";
import { dateLabel, formatAusd, parseAusd, phaseOf, TicketStatus, timeLabel } from "@/lib/events";
import { useEvent, useSupporter, useTickets } from "@/lib/hooks";
import { deriveDoorKey } from "@/lib/passkey";
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

  return (
    <Shell footer={false}>
      <p className="label text-mute">
        <Link href="/tickets" className="link-line">
          My tickets
        </Link>{" "}
        / #{ticket.id.toString()}
      </p>

      <div className="mt-8 grid gap-14 lg:grid-cols-2">
        <div>
          <TicketStub
            title={event.meta.name}
            date={`${dateLabel(event.startsAt)}, ${timeLabel(event.startsAt)}`}
            venue={event.meta.venue || event.meta.city}
            holder={name || "You"}
            tier={event.tiers[ticket.tier]?.name ?? ""}
            number={supporter && supporter.number > 0 ? String(supporter.number).padStart(3, "0") : `#${ticket.id}`}
          />
          {supporter && supporter.number > 0 && (
            <p className="label mt-4 text-mute">
              Supporter No. {String(supporter.number).padStart(3, "0")} of this host · {supporter.shows} show{supporter.shows === 1 ? "" : "s"}
            </p>
          )}
        </div>

        <div>
          {checkedIn ? (
            <div ref={welcome} className="overflow-hidden">
              <div data-welcome className="bg-ink p-8 text-paper">
                <p data-welcome-line className="display text-[clamp(3.5rem,9vw,6rem)]">
                  Welcome in.
                </p>
                {supporter && supporter.number > 0 && (
                  <p data-welcome-line className="mt-6 text-lg text-paper/80">
                    You&apos;re supporter No. {String(supporter.number).padStart(3, "0")} for this host, on the record for good.
                  </p>
                )}
              </div>
            </div>
          ) : code ? (
            <div className="space-y-5">
              <div className="bg-paper-2 p-6">
                <QR value={code.value} label="Entry code" className="mx-auto w-full max-w-sm" />
              </div>
              <div className="flex items-center justify-between">
                <p className="label">
                  Admits {groupIds.length} · refreshes in {Math.max(0, secondsLeft - (CODE_LIFETIME - REFRESH_EVERY))}s
                </p>
                <span className="label flex items-center gap-2">
                  <span className="inline-block size-2 animate-pulse rounded-full bg-signal" /> Live
                </span>
              </div>
              <Notice>Only your passkey can make this code, and it expires in minutes. A screenshot won&apos;t get anyone in.</Notice>
            </div>
          ) : canShow ? (
            <div className="space-y-5">
              <h2 className="headline text-4xl">At the door?</h2>
              <p className="text-ink-2">
                Unlock your entry code with your passkey. It covers all {groupIds.length} of your tickets for this event.
                {!checkInOpen && ` Doors open ${dateLabel(event.startsAt)} at ${timeLabel(event.startsAt)}; the code works from 6 hours before.`}
              </p>
              <Button className="w-full" busy={busy === "code"} onClick={showCode}>
                <span className="text-lg">{busy === "code" ? "Confirm with your passkey…" : "Show entry code"}</span>
              </Button>
            </div>
          ) : (
            <p className="headline text-3xl text-ink-2">
              {ticket.status === TicketStatus.Refunded ? "Refunded." : event.cancelled ? "This event was cancelled." : "This event has ended."}
            </p>
          )}

          {!code && ticket.status === TicketStatus.Valid && !event.cancelled && phase !== "ended" && phase !== "live" && (
            <section className="mt-14 border-t border-ink pt-6">
              <p className="label">[ Can&apos;t make it? ]</p>
              {listing?.listed ? (
                <div className="mt-4 space-y-4">
                  <p className="text-ink-2">
                    Listed for {formatAusd(listing.price)}. You&apos;ll be paid the moment someone buys it, minus the host&apos;s{" "}
                    {event.royaltyBps / 100}% cut.
                  </p>
                  <button className="label link-line" disabled={!!busy} onClick={() => run("unlist", async () => send(await unlock(), "unlist", [ticket.id]))}>
                    {busy === "unlist" ? "Removing…" : "Take it off sale"}
                  </button>
                </div>
              ) : (
                <form
                  className="mt-4 grid grid-cols-[1fr_auto] items-end gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run("list", async () => {
                      const price = resalePrice ? parseAusd(resalePrice) : face;
                      if (price > cap) throw new Error(`The host caps resale at ${formatAusd(cap, { free: false })}.`);
                      await send(await unlock(), "list", [ticket.id, price]);
                    });
                  }}
                >
                  <Field label={`Resell for (max ${formatAusd(cap, { free: false })})`}>
                    <input inputMode="decimal" placeholder={formatAusd(face, { free: false }).slice(1)} value={resalePrice} onChange={(e) => setResalePrice(e.target.value)} className={inputClass} />
                  </Field>
                  <button type="submit" disabled={!!busy} className="label border border-ink px-4 py-3 disabled:opacity-40">
                    {busy === "list" ? "···" : "List it"}
                  </button>
                </form>
              )}
            </section>
          )}

          {refundable && (
            <Button className="mt-10 w-full" busy={busy === "refund"} onClick={() => run("refund", async () => send(await unlock(), "refund", [groupIds, address]))}>
              <span className="text-lg">
                Claim refund · {formatAusd(group.reduce((sum, t) => sum + (event.tiers[t.tier]?.price ?? 0n), 0n), { free: false })}
              </span>
            </Button>
          )}

          {error && (
            <div className="mt-6">
              <Notice tone="error">{error}</Notice>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
