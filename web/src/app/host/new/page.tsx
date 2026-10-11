"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { errorMessage, useAccount } from "@/components/account";
import { Reveal } from "@/components/motion";
import { Poster } from "@/components/poster";
import { Shell } from "@/components/shell";
import { Button, Field, inputClass, Notice } from "@/components/ui";
import { createEvent } from "@/lib/actions";
import { parseAusd } from "@/lib/events";
import { preparePoster, uploadPoster } from "@/lib/poster";

type TierInput = { name: string; price: string; supply: string };

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (date: string, time: string) => new Date(`${date}T${time}`);

export default function NewEventPage() {
  const router = useRouter();
  const { address, unlock, openSheet } = useAccount();

  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(() => localDate(new Date(Date.now() + 7 * 864e5)));
  const [start, setStart] = useState("20:00");
  const [end, setEnd] = useState("23:30");
  const [tiers, setTiers] = useState<TierInput[]>([{ name: "General admission", price: "10", supply: "100" }]);
  const [cap, setCap] = useState(0);
  const [royalty, setRoyalty] = useState(500);
  const [presale, setPresale] = useState(false);
  const [publicSale, setPublicSale] = useState(() => localDate(new Date(Date.now() + 2 * 864e5)));
  const [poster, setPoster] = useState<{ blob: Blob; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => void (poster && URL.revokeObjectURL(poster.preview)), [poster]);

  async function pickPoster(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const blob = await preparePoster(file);
      setPoster({ blob, preview: URL.createObjectURL(blob) });
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const updateTier = (i: number, patch: Partial<TierInput>) => setTiers((ts) => ts.map((t, j) => (i === j ? { ...t, ...patch } : t)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const startsAt = at(date, start);
      const endsAt = at(date, end);
      if (endsAt <= startsAt) endsAt.setDate(endsAt.getDate() + 1);
      if (startsAt <= new Date()) throw new Error("The event has to start in the future.");
      const now = new Date();
      const saleStartsAt = presale ? at(publicSale, "12:00") : now;
      if (presale && (saleStartsAt <= now || saleStartsAt >= endsAt)) throw new Error("Public sale has to open after now and before the event ends.");
      const parsed = tiers.map((t) => {
        const supply = Number(t.supply);
        if (!t.name.trim() || !Number.isInteger(supply) || supply < 1) throw new Error("Every tier needs a name and at least one ticket.");
        return { price: parseAusd(t.price || "0"), supply };
      });

      setBusy(true);
      const account = await unlock();
      const posterUrl = poster ? await uploadPoster(poster.blob) : undefined;
      const id = await createEvent(account, {
        meta: {
          name: name.trim(),
          venue: venue.trim(),
          city: city.trim(),
          description: description.trim(),
          tiers: tiers.map((t) => t.name.trim()),
          poster: posterUrl,
        },
        startsAt,
        endsAt,
        saleStartsAt,
        presaleStartsAt: now,
        presaleMinShows: presale ? 1 : 0,
        resaleCapBps: cap,
        royaltyBps: royalty,
        tiers: parsed,
      });
      router.push(`/host/${id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Shell>
      <Reveal as="h1" lines immediate className="display text-[clamp(3.5rem,10vw,9rem)]">
        Host something.
      </Reveal>

      <form onSubmit={submit} className="mt-16 grid gap-16 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)]">
        <div className="space-y-14">
          <section className="space-y-8">
            <p className="label">[01] The event</p>
            <Field label="Name">
              <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Lagos Late Night Jazz" className={`${inputClass} headline text-3xl`} />
            </Field>
            <div className="grid gap-8 sm:grid-cols-2">
              <Field label="Venue">
                <input maxLength={80} value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Freedom Park" className={inputClass} />
              </Field>
              <Field label="City">
                <input maxLength={40} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lagos" className={inputClass} />
              </Field>
            </div>
            <Field label="What's it about">
              <textarea rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} resize-none`} />
            </Field>
          </section>

          <section className="space-y-8">
            <p className="label">[02] When</p>
            <div className="grid gap-8 sm:grid-cols-3">
              <Field label="Date">
                <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Doors open">
                <input type="time" required value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Ends" hint="Earlier than doors means it runs past midnight.">
                <input type="time" required value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
              </Field>
            </div>
          </section>

          <section className="space-y-6">
            <p className="label">[03] Tickets</p>
            {tiers.map((t, i) => (
              <div key={i} className="grid grid-cols-[1fr_6rem_5rem_auto] items-end gap-4">
                <Field label={i === 0 ? "Tier" : ""}>
                  <input value={t.name} maxLength={32} onChange={(e) => updateTier(i, { name: e.target.value })} className={inputClass} />
                </Field>
                <Field label={i === 0 ? "Price $" : ""}>
                  <input inputMode="decimal" value={t.price} onChange={(e) => updateTier(i, { price: e.target.value })} className={inputClass} />
                </Field>
                <Field label={i === 0 ? "How many" : ""}>
                  <input inputMode="numeric" value={t.supply} onChange={(e) => updateTier(i, { supply: e.target.value })} className={inputClass} />
                </Field>
                <button type="button" aria-label="Remove tier" disabled={tiers.length === 1} onClick={() => setTiers((ts) => ts.filter((_, j) => j !== i))} className="label pb-3 text-mute disabled:opacity-30">
                  ✕
                </button>
              </div>
            ))}
            {tiers.length < 10 && (
              <button type="button" onClick={() => setTiers((ts) => [...ts, { name: "", price: "", supply: "50" }])} className="label link-line">
                + Add a tier
              </button>
            )}
          </section>

          <section className="space-y-8">
            <p className="label">[04] Rules</p>
            <div className="grid gap-8 sm:grid-cols-2">
              <Field label="Resale price cap" hint="Fans can only resell through Firstrow, up to this.">
                <select value={cap} onChange={(e) => setCap(Number(e.target.value))} className={inputClass}>
                  <option value={0}>Face value</option>
                  <option value={1000}>Face value +10%</option>
                  <option value={2500}>Face value +25%</option>
                </select>
              </Field>
              <Field label="Your cut of each resale">
                <select value={royalty} onChange={(e) => setRoyalty(Number(e.target.value))} className={inputClass}>
                  <option value={0}>None</option>
                  <option value={500}>5%</option>
                  <option value={1000}>10%</option>
                </select>
              </Field>
            </div>
            <label className="flex cursor-pointer items-start gap-4">
              <input type="checkbox" checked={presale} onChange={(e) => setPresale(e.target.checked)} className="mt-1 size-5 accent-ink" />
              <span>
                <span className="headline text-xl">Presale for people who&apos;ve shown up before</span>
                <span className="mt-1 block text-sm text-ink-2">Anyone who has checked in at one of your events can buy now. Everyone else waits for the public sale.</span>
              </span>
            </label>
            {presale && (
              <Field label="Public sale opens (noon)">
                <input type="date" value={publicSale} onChange={(e) => setPublicSale(e.target.value)} className={inputClass} />
              </Field>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-36 lg:self-start">
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster.preview} alt="Your poster" className="aspect-[3/4] w-full object-cover" />
          ) : (
            <Poster seed={`preview:${name}`} title={name || "Your event"} />
          )}
          <div className="mt-3 flex items-center justify-between">
            <label className="label link-line cursor-pointer">
              {poster ? "Change poster" : "+ Upload your own poster"}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pickPoster(e.target.files?.[0])} />
            </label>
            {poster ? (
              <button type="button" className="label text-mute link-line" onClick={() => setPoster(null)}>
                Use the generated one
              </button>
            ) : (
              <span className="label text-mute">Portrait works best</span>
            )}
          </div>
          <div className="mt-6 space-y-4">
            {!address ? (
              <Button type="button" className="w-full" onClick={openSheet}>
                <span className="text-lg">Sign in to publish</span>
              </Button>
            ) : (
              <Button type="submit" className="w-full" busy={busy}>
                <span className="text-lg">{busy ? "Publishing to Monad…" : "Publish event"}</span>
              </Button>
            )}
            <p className="label text-mute">Free to publish. Ticket money is held until each guest checks in.</p>
            {error && <Notice tone="error">{error}</Notice>}
          </div>
        </aside>
      </form>
    </Shell>
  );
}
