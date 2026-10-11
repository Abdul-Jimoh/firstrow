"use client";

import Link from "next/link";
import { useState } from "react";
import { EventCard } from "@/components/event-card";
import { Reveal } from "@/components/motion";
import { Shell } from "@/components/shell";
import { useEvents } from "@/lib/hooks";

export default function EventsPage() {
  const { data, isLoading } = useEvents();
  const [view, setView] = useState<"upcoming" | "past">("upcoming");
  const now = new Date();
  // A cancelled event nobody bought a ticket for is a withdrawn listing, so it isn't shown at all.
  const events = (data ?? [])
    .filter((e) => !(e.cancelled && e.sold === 0))
    .filter((e) => (view === "upcoming" ? e.endsAt > now && !e.cancelled : e.endsAt <= now || e.cancelled))
    .sort((a, b) => (view === "upcoming" ? a.startsAt.getTime() - b.startsAt.getTime() : b.startsAt.getTime() - a.startsAt.getTime()));

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <Reveal as="h1" lines immediate className="display text-[clamp(3.5rem,10vw,9rem)]">
          What&apos;s on
        </Reveal>
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 pb-3">
          <Link href="/host/new" className="label border-b border-ink pb-1">
            + Host an event
          </Link>
          {(["upcoming", "past"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`label ${view === v ? "" : "text-mute"}`}>
              {view === v ? "■" : "□"} {v}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-16">
        {isLoading ? (
          <p className="label text-mute">Reading the chain…</p>
        ) : events.length === 0 ? (
          <p className="headline text-2xl text-ink-2">{view === "upcoming" ? "Nothing on yet." : "No past events."}</p>
        ) : (
          <div className="grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e, i) => (
              <EventCard key={e.id} event={e} index={i} />
            ))}
          </div>
        )}
      </div>
    </Shell>
  );
}
