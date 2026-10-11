"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { isAddress, type Address } from "viem";
import { useAccount } from "@/components/account";
import { Reveal } from "@/components/motion";
import { Shell } from "@/components/shell";
import { Stat } from "@/components/ui";
import { explorer } from "@/lib/chain";
import { dateLabel } from "@/lib/events";
import { useEvents } from "@/lib/hooks";
import { fetchFanRecord } from "@/lib/indexer";
import { fetchName } from "@/lib/profile";

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const no = (n: number) => String(n).padStart(3, "0");

export default function FanPage() {
  const params = useParams<{ address: string }>();
  const fan = isAddress(params.address) ? (params.address as Address) : null;
  const { address, name } = useAccount();
  const mine = !!fan && fan.toLowerCase() === address?.toLowerCase();
  const { data: record, isLoading } = useQuery({ queryKey: ["fan", fan], queryFn: () => fetchFanRecord(fan!), enabled: !!fan });
  const { data: events } = useEvents();
  const { data: savedName } = useQuery({ queryKey: ["name", fan], queryFn: () => fetchName(fan!), enabled: !!fan && !mine });

  if (!fan) return <Shell><h1 className="display text-6xl">No such fan.</h1></Shell>;

  const eventById = new Map((events ?? []).map((e) => [e.id, e]));
  // A host is known here by their most recent event.
  const hostLabel = (host: string) => (events ?? []).find((e) => e.host.toLowerCase() === host.toLowerCase())?.meta.name ?? short(host);
  const shows = record?.standings.reduce((n, s) => n + s.shows, 0) ?? 0;
  const best = record?.standings.reduce((min, s) => Math.min(min, s.number), Infinity) ?? Infinity;

  return (
    <Shell>
      <p className="label text-mute">[ Record ] {short(fan)}</p>
      <Reveal as="h1" lines immediate className="display mt-6 text-[clamp(3.5rem,10vw,9rem)]">
        {mine ? (name ? `${name}'s record` : "Your record") : savedName ? `${savedName}'s record` : "On the record"}
      </Reveal>
      <p className="lede mt-6 max-w-2xl text-ink-2">
        Every show checked in at the door, written to Monad. It can&apos;t be bought, faked or transferred.
      </p>

      {isLoading ? (
        <p className="label mt-16 text-mute">Reading the record…</p>
      ) : !record || record.standings.length === 0 ? (
        <p className="headline mt-16 text-2xl text-ink-2">
          No shows yet.{" "}
          <Link href="/events" className="link-line">
            Find one to start with →
          </Link>
        </p>
      ) : (
        <>
          <div className="mt-14 grid grid-cols-2 gap-6 md:grid-cols-3">
            <Stat label="Shows attended" value={shows} />
            <Stat label="Hosts supported" value={record.standings.length} />
            <Stat label="Best supporter number" value={`No. ${no(best)}`} />
          </div>

          <section className="mt-20">
            <p className="label">[01] Standing with each host</p>
            <div className="mt-4 border-t border-ink">
              {record.standings.map((s) => (
                <div key={s.host} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-6 border-b rule py-6">
                  <p className="display text-5xl tabular-nums md:text-7xl">{no(s.number)}</p>
                  <div>
                    <p className="headline text-2xl">{hostLabel(s.host)}</p>
                    <p className="label mt-2 text-mute">
                      Host {short(s.host)}
                      {s.firstShowAt ? ` · since ${dateLabel(new Date(s.firstShowAt * 1000))}` : ""}
                    </p>
                  </div>
                  <p className="label">
                    {s.shows} show{s.shows === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-20">
            <p className="label">[02] Through the door</p>
            <div className="mt-4 border-t border-ink">
              {record.attendance.map((a) => {
                const event = eventById.get(a.eventId);
                return (
                  <div key={a.ticketId.toString()} className="grid gap-2 border-b rule py-4 sm:grid-cols-[10rem_1fr_auto] sm:items-baseline sm:gap-6">
                    <p className="label text-mute">{a.timestamp ? dateLabel(new Date(a.timestamp * 1000)) : event ? dateLabel(event.startsAt) : ""}</p>
                    <Link href={`/events/${a.eventId}`} className="headline text-xl link-line justify-self-start">
                      {event?.meta.name ?? `Event ${a.eventId}`}
                    </Link>
                    {a.txHash ? (
                      <a className="label text-mute" href={`${explorer}/tx/${a.txHash}`} target="_blank" rel="noreferrer">
                        Proof ↗
                      </a>
                    ) : (
                      <span className="label text-mute">Ticket #{a.ticketId.toString()}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <p className="label mt-10 text-mute">
            {record.source === "indexer" ? "Indexed by Envio HyperIndex" : "Read directly from the contract"}
          </p>
        </>
      )}
    </Shell>
  );
}
