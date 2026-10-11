import Link from "next/link";
import { dateLabel, formatAusd, phaseOf, soldOut, type EventView } from "@/lib/events";
import { Poster } from "./poster";

export function EventCard({ event, index }: { event: EventView; index: number }) {
  const from = event.tiers.reduce((min, t) => (t.price < min ? t.price : min), event.tiers[0]?.price ?? 0n);
  const phase = phaseOf(event);
  const tag =
    phase === "cancelled" ? "Cancelled" : phase === "ended" ? "Ended" : soldOut(event) ? "Sold out" : phase === "presale" ? "Presale" : null;

  return (
    <Link href={`/events/${event.id}`} className="group block">
      <div className="relative overflow-hidden">
        <div className="transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.03]">
          {event.meta.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.meta.poster} alt="" className="aspect-[3/4] w-full bg-paper-2 object-contain" />
          ) : (
            <Poster seed={`${event.id}:${event.meta.name}`} />
          )}
        </div>
        {tag && <span className="label absolute top-3 left-3 bg-ink px-2 py-1 text-paper">{tag}</span>}
      </div>
      <div className="mt-3 grid grid-cols-[2.5rem_1fr] gap-x-2">
        <span className="label text-mute">[{String(index + 1).padStart(2, "0")}]</span>
        <div>
          <p className="label">{event.meta.name}</p>
          <p className="label mt-1 text-ink-2">
            {dateLabel(event.startsAt)} · {event.meta.city || event.meta.venue} · {formatAusd(from)}
          </p>
        </div>
      </div>
    </Link>
  );
}
