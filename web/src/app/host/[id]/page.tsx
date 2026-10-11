"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { errorMessage, useAccount } from "@/components/account";
import { EditDetails } from "@/components/edit-details";
import { Reveal } from "@/components/motion";
import { QR } from "@/components/qr";
import { Shell } from "@/components/shell";
import { Button, Notice, Panel, Pill, SmallButton, SmallLink, Stat, type Tone } from "@/components/ui";
import { dateLabel, encodeMeta, formatAusd, phaseOf, timeLabel } from "@/lib/events";
import { useEvent, useHostBalance } from "@/lib/hooks";
import { fetchTopSupporters } from "@/lib/indexer";
import { preparePoster, uploadPoster } from "@/lib/poster";
import { fetchNames } from "@/lib/profile";
import { send } from "@/lib/signing";

export default function ManageEventPage() {
  const params = useParams<{ id: string }>();
  const id = /^\d+$/.test(params.id) ? BigInt(params.id) : null;
  const { data: event, isLoading } = useEvent(id);
  const { data: balance } = useHostBalance(id);
  const { address, unlock } = useAccount();
  const queryClient = useQueryClient();
  const { data: supporters } = useQuery({
    queryKey: ["topSupporters", event?.host],
    queryFn: () => fetchTopSupporters(event!.host),
    enabled: !!event,
    refetchInterval: 10_000,
  });
  const fans = (supporters ?? []).map((s) => s.fan);
  const { data: names } = useQuery({ queryKey: ["names", fans.join(",")], queryFn: () => fetchNames(fans), enabled: fans.length > 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doorLink, setDoorLink] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  if (isLoading) return <Shell><p className="label text-mute">Reading the chain…</p></Shell>;
  if (!event) return <Shell><h1 className="display text-6xl">No such event.</h1></Shell>;
  if (event.host.toLowerCase() !== address?.toLowerCase()) {
    return (
      <Shell>
        <h1 className="display text-6xl">Hosts only.</h1>
        <p className="mt-6 text-ink-2">Sign in with the passkey that created this event.</p>
      </Shell>
    );
  }

  const phase = phaseOf(event);
  const supply = event.tiers.reduce((n, t) => n + t.supply, 0);

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

  const changePoster = (file: File | undefined) =>
    file &&
    run("poster", async () => {
      const url = await uploadPoster(await preparePoster(file));
      await send(await unlock(), "updateMetadata", [event.id, encodeMeta({ ...event.meta, poster: url })]);
    });

  // The door phone's key is made here and travels only in the link's #fragment, which never reaches a server.
  // It can do one thing: submit check-ins that ticket holders have signed, for this event.
  const pairDoor = () =>
    run("door", async () => {
      const key = generatePrivateKey();
      const door = privateKeyToAccount(key);
      await send(await unlock(), "setDoor", [event.id, door.address, true]);
      setDoorLink(`${window.location.origin}/door/${event.id}#k=${key}`);
    });

  const live = phase !== "ended" && phase !== "cancelled";
  const status: { label: string; tone: Tone } =
    phase === "cancelled"
      ? { label: "Cancelled", tone: "stop" }
      : phase === "ended"
        ? { label: "Ended", tone: "done" }
        : phase === "live"
          ? { label: "Happening now", tone: "go" }
          : phase === "on-sale"
            ? { label: "On sale", tone: "go" }
            : phase === "presale"
              ? { label: "Presale open", tone: "warn" }
              : { label: "Not on sale yet", tone: "done" };
  const publicLink = typeof window === "undefined" ? "" : `${window.location.origin}/events/${event.id}`;

  return (
    <Shell>
      <div className="flex flex-wrap items-center gap-4">
        <Link href="/host" className="label text-ink-2 link-line">
          ← Hosting
        </Link>
        <Pill tone={status.tone}>{status.label}</Pill>
      </div>
      <Reveal as="h1" lines immediate className="display mt-5 text-[clamp(3rem,8vw,7rem)]">
        {event.meta.name}
      </Reveal>
      <p className="label mt-4 text-ink-2">
        {dateLabel(event.startsAt)} · {timeLabel(event.startsAt)}–{timeLabel(event.endsAt)} · {event.meta.venue}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <SmallButton variant="ink" onClick={() => navigator.clipboard.writeText(publicLink).then(() => setCopied(true))}>
          {copied ? "Link copied ✓" : "Copy link to share"}
        </SmallButton>
        <SmallLink href={`/events/${event.id}`}>View public page</SmallLink>
        {phase !== "ended" && !editing && <SmallButton onClick={() => setEditing(true)}>Edit details</SmallButton>}
        {phase !== "ended" && (
          <label className={`label inline-flex cursor-pointer items-center border border-ink px-4 py-2.5 transition-colors hover:bg-ink hover:text-paper ${busy === "poster" ? "opacity-40" : ""}`}>
            {busy === "poster" ? "Uploading poster…" : event.meta.poster ? "Change poster" : "Upload a poster"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={!!busy} onChange={(e) => changePoster(e.target.files?.[0])} />
          </label>
        )}
      </div>

      {error && (
        <div className="mt-6">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {editing && (
        <EditDetails
          event={event}
          busy={busy === "details"}
          onCancel={() => setEditing(false)}
          onSave={(meta) =>
            run("details", async () => {
              await send(await unlock(), "updateMetadata", [event.id, encodeMeta(meta)]);
              setEditing(false);
            })
          }
        />
      )}

      <div className="mt-12 grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat label="Sold" value={`${event.sold}/${supply}`} />
        <Stat label="Checked in" value={event.checkedIn} />
        <Stat label="In escrow" value={formatAusd(event.validValue, { free: false })} />
        <Stat label="Yours to withdraw" value={formatAusd(balance ?? 0n, { free: false })} tone={balance ? "go" : undefined} />
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-2">
        <Panel>
          <p className="label text-ink-2">At the door</p>
          <h2 className="headline mt-2 text-3xl">Pair a phone to scan tickets.</h2>
          <p className="mt-3 text-ink-2">
            Any phone with a camera works. Each one gets its own key that can only submit check-ins guests sign themselves, so a
            lost phone can&apos;t move any money.
          </p>
          {doorLink ? (
            <div className="mt-6 grid items-start gap-6 sm:grid-cols-[11rem_1fr]">
              <QR value={doorLink} label="Door phone pairing code" className="w-44 bg-white p-3" />
              <div className="space-y-3">
                <Notice tone="ok">Scan this with the door phone&apos;s camera. It opens the scanner, already paired.</Notice>
                <div className="flex flex-wrap gap-2">
                  <SmallButton onClick={() => navigator.clipboard.writeText(doorLink)}>Copy link instead</SmallButton>
                  <SmallButton variant="ink" onClick={() => setDoorLink(null)}>
                    Done
                  </SmallButton>
                </div>
              </div>
            </div>
          ) : (
            <Button className="mt-6 w-full" busy={busy === "door"} disabled={!live} onClick={pairDoor}>
              <span className="text-lg">Pair a door phone</span>
            </Button>
          )}
        </Panel>

        <Panel>
          <p className="label text-ink-2">Your money</p>
          <h2 className="headline mt-2 text-3xl">Paid as people walk in.</h2>
          <p className="mt-3 text-ink-2">
            Each ticket&apos;s price becomes yours when its holder checks in, plus your cut of resales. Unused tickets become yours 7
            days after the event if the holder doesn&apos;t claim a refund.
          </p>
          <Button
            className="mt-6 w-full"
            variant={balance ? "primary" : "ink"}
            busy={busy === "withdraw"}
            disabled={!balance}
            onClick={() => run("withdraw", async () => send(await unlock(), "withdraw", [event.id, address]))}
          >
            <span className="text-lg">{balance ? `Withdraw ${formatAusd(balance, { free: false })}` : "Nothing to withdraw yet"}</span>
          </Button>
        </Panel>
      </div>

      {supporters && supporters.length > 0 && (
        <section className="mt-16">
          <p className="label text-ink-2">Your supporters</p>
          <h2 className="headline mt-2 text-3xl">The people who keep showing up.</h2>
          <div className="mt-6 border-t-2 border-ink">
            {supporters.map((s) => (
              <Link key={s.fan} href={`/fans/${s.fan}`} className="grid grid-cols-[5rem_1fr_auto] items-baseline gap-4 border-b rule py-4 hover:bg-paper-2">
                <span className="headline text-2xl tabular-nums">{String(s.number).padStart(3, "0")}</span>
                <span className={names?.[s.fan.toLowerCase()] ? "headline text-xl" : "label"}>
                  {names?.[s.fan.toLowerCase()] ?? `${s.fan.slice(0, 6)}…${s.fan.slice(-4)}`}
                </span>
                <span className="label text-ink-2">
                  {s.shows} show{s.shows === 1 ? "" : "s"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {live && (
        <section className="mt-16 border-t rule pt-6">
          {confirmCancel ? (
            <div className="max-w-xl space-y-4">
              <Notice tone="error">Cancelling lets every guest refund themselves, and it can&apos;t be undone.</Notice>
              <div className="flex flex-wrap gap-2">
                <SmallButton variant="danger" busy={busy === "cancel"} onClick={() => run("cancel", async () => send(await unlock(), "cancelEvent", [event.id]))}>
                  Yes, cancel the event
                </SmallButton>
                <SmallButton onClick={() => setConfirmCancel(false)}>Keep it</SmallButton>
              </div>
            </div>
          ) : (
            <SmallButton variant="danger" onClick={() => setConfirmCancel(true)}>
              Cancel event
            </SmallButton>
          )}
        </section>
      )}
    </Shell>
  );
}
