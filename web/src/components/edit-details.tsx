"use client";

import { useState, type FormEvent } from "react";
import type { EventMeta, EventView } from "@/lib/events";
import { Button, Field, inputClass } from "./ui";

// Display details only: the schedule, prices and resale rules are fixed once an event is published.
export function EditDetails({
  event,
  busy,
  onSave,
  onCancel,
}: {
  event: EventView;
  busy: boolean;
  onSave: (meta: EventMeta) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(event.meta.name);
  const [venue, setVenue] = useState(event.meta.venue);
  const [city, setCity] = useState(event.meta.city);
  const [description, setDescription] = useState(event.meta.description);
  const [tiers, setTiers] = useState(event.tiers.map((t) => t.name));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || tiers.some((t) => !t.trim())) return;
    onSave({
      ...event.meta,
      name: name.trim(),
      venue: venue.trim(),
      city: city.trim(),
      description: description.trim(),
      tiers: tiers.map((t) => t.trim()),
    });
  }

  return (
    <form onSubmit={submit} className="mt-8 max-w-3xl space-y-8 bg-paper-2 p-6 md:p-8">
      <p className="label text-mute">Dates, prices and resale rules can&apos;t be changed after publishing.</p>
      <Field label="Name">
        <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} headline text-2xl`} />
      </Field>
      <div className="grid gap-8 sm:grid-cols-2">
        <Field label="Venue">
          <input maxLength={80} value={venue} onChange={(e) => setVenue(e.target.value)} className={inputClass} />
        </Field>
        <Field label="City">
          <input maxLength={40} value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Field label="What's it about">
        <textarea rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} resize-none`} />
      </Field>
      <div className="space-y-5">
        {tiers.map((tier, i) => (
          <Field key={i} label={`Tier ${i + 1} name`}>
            <input
              required
              maxLength={60}
              value={tier}
              onChange={(e) => setTiers((ts) => ts.map((t, j) => (i === j ? e.target.value : t)))}
              className={inputClass}
            />
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <Button type="submit" busy={busy}>
          <span className="text-lg">{busy ? "Saving to Monad…" : "Save details"}</span>
        </Button>
        <button type="button" className="label link-line" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}
