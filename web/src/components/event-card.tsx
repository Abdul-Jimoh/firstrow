import Link from "next/link";
import { dateLabel, formatAusd, phaseOf, soldOut, type EventView } from "@/lib/events";
import { Poster } from "./poster";
import { Pill, type Tone } from "./ui";

export function EventCard({ event, index }: { event: EventView; index: number }) {
  const from = event.tiers.reduce((min, t) => (t.price < min ? t.price : min), event.tiers[0]?.price ?? 0n);
  const phase = phaseOf(event);
  const tag: { label: string; tone: Tone } | null =
    phase === "cancelled"
      ? { label: "Cancelled", tone: "stop" }
      : phase === "ended"
        ? { label: "Ended", tone: "done" }
        : soldOut(event)
          ? { label: "Sold out", tone: "stop" }
          : phase === "presale"
            ? { label: "Presale", tone: "warn" }
            : phase === "live"
              ? { label: "Happening now", tone: "go" }
              : null;

  return (
    <Link href={`/events/${event.id}`} className="group block">
      <div className="relative overflow-hidden">
        <div className="transition-transform duration-700 ease-[var(--ease-out-expo)] group-hover:scale-[1.03]">
          {event.meta.poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={event.meta.poster} alt="" className="aspect-[3/4] w-full bg-paper-2 object-cover" />
          ) : (
            <Poster seed={`${event.id}:${event.meta.name}`} />
          )}
        </div>
        {tag && (
          <span className="absolute top-3 left-3">
            <Pill tone={tag.tone}>{tag.label}</Pill>
          </span>
        )}
      </div>
      <div className="mt-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="headline truncate text-xl group-hover:underline">{event.meta.name}</p>
          <p className="label mt-1.5 text-ink-2">
            <span className="text-mute">[{String(index + 1).padStart(2, "0")}]</span> {dateLabel(event.startsAt)} · {event.meta.city || event.meta.venue}
          </p>
        </div>
        <p className="headline shrink-0 text-xl tabular-nums">{formatAusd(from)}</p>
      </div>
    </Link>
  );
}
