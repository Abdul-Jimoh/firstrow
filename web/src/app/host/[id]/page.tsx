"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { errorMessage, useAccount } from "@/components/account";
import { Reveal } from "@/components/motion";
import { QR } from "@/components/qr";
import { Shell } from "@/components/shell";
import { Button, Notice, Stat } from "@/components/ui";
import { dateLabel, formatAusd, phaseOf, timeLabel } from "@/lib/events";
import { useEvent, useHostBalance } from "@/lib/hooks";
import { send } from "@/lib/signing";

export default function ManageEventPage() {
  const params = useParams<{ id: string }>();
  const id = /^\d+$/.test(params.id) ? BigInt(params.id) : null;
  const { data: event, isLoading } = useEvent(id);
  const { data: balance } = useHostBalance(id);
  const { address, unlock } = useAccount();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [doorLink, setDoorLink] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

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

  // The door phone's key is made here and travels only in the link's #fragment, which never reaches a server.
  // It can do one thing: submit check-ins that ticket holders have signed, for this event.
  const pairDoor = () =>
    run("door", async () => {
      const key = generatePrivateKey();
      const door = privateKeyToAccount(key);
      await send(await unlock(), "setDoor", [event.id, door.address, true]);
      setDoorLink(`${window.location.origin}/door/${event.id}#k=${key}`);
    });

  return (
    <Shell>
      <p className="label text-mute">
        <Link href="/host" className="link-line">
          Your events
        </Link>{" "}
        / {phase}
      </p>
      <Reveal as="h1" lines immediate className="display mt-6 text-[clamp(3rem,8vw,7rem)]">
        {event.meta.name}
      </Reveal>
      <p className="label mt-4 text-ink-2">
        {dateLabel(event.startsAt)} · {timeLabel(event.startsAt)}–{timeLabel(event.endsAt)} · {event.meta.venue}
      </p>

      <div className="mt-14 grid grid-cols-2 gap-6 md:grid-cols-4">
        <Stat label="Sold" value={`${event.sold}/${supply}`} />
        <Stat label="Checked in" value={event.checkedIn} />
        <Stat label="In escrow" value={formatAusd(event.validValue, { free: false })} />
        <Stat label="Yours to withdraw" value={formatAusd(balance ?? 0n, { free: false })} />
      </div>

      <div className="mt-16 grid gap-16 lg:grid-cols-2">
        <section>
          <p className="label">[01] Door</p>
          <h2 className="headline mt-4 text-4xl">Pair a phone for the door.</h2>
          <p className="mt-3 max-w-md text-ink-2">
            Each phone gets its own key. It can only submit check-ins that guests sign themselves, so a lost phone can&apos;t move
            any money.
          </p>
          {doorLink ? (
            <div className="mt-8 grid items-start gap-6 sm:grid-cols-[12rem_1fr]">
              <QR value={doorLink} label="Door phone pairing code" className="w-48 bg-paper-2 p-3" />
              <div className="space-y-4">
                <Notice tone="ok">Scan this with the door phone&apos;s camera. It opens the scanner, already paired.</Notice>
                <button className="label link-line" onClick={() => navigator.clipboard.writeText(doorLink)}>
                  Copy link instead
                </button>
                <button className="label block text-mute link-line" onClick={() => setDoorLink(null)}>
                  Done
                </button>
              </div>
            </div>
          ) : (
            <Button className="mt-8 w-full max-w-md" busy={busy === "door"} disabled={phase === "ended" || phase === "cancelled"} onClick={pairDoor}>
              <span className="text-lg">Pair a door phone</span>
            </Button>
          )}
        </section>

        <section>
          <p className="label">[02] Money</p>
          <h2 className="headline mt-4 text-4xl">Paid as people walk in.</h2>
          <p className="mt-3 max-w-md text-ink-2">
            Each ticket&apos;s price becomes yours when its holder checks in, plus your cut of resales. Tickets nobody uses become
            yours 7 days after the event if the holder doesn&apos;t claim a refund.
          </p>
          <Button
            className="mt-8 w-full max-w-md"
            busy={busy === "withdraw"}
            disabled={!balance}
            onClick={() => run("withdraw", async () => send(await unlock(), "withdraw", [event.id, address]))}
          >
            <span className="text-lg">Withdraw {formatAusd(balance ?? 0n, { free: false })}</span>
          </Button>

          {phase !== "ended" && phase !== "cancelled" && (
            <div className="mt-12 border-t rule pt-6">
              {confirmCancel ? (
                <div className="space-y-4">
                  <Notice tone="error">Every guest will be able to refund themselves. This can&apos;t be undone.</Notice>
                  <div className="flex gap-4">
                    <button
                      className="label bg-signal px-4 py-3 text-paper"
                      disabled={!!busy}
                      onClick={() => run("cancel", async () => send(await unlock(), "cancelEvent", [event.id]))}
                    >
                      {busy === "cancel" ? "Cancelling…" : "Yes, cancel the event"}
                    </button>
                    <button className="label px-4 py-3" onClick={() => setConfirmCancel(false)}>
                      Keep it
                    </button>
                  </div>
                </div>
              ) : (
                <button className="label text-mute link-line" onClick={() => setConfirmCancel(true)}>
                  Cancel event
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {error && (
        <div className="mt-8">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <div className="mt-16 border-t rule pt-6">
        <Link href={`/events/${event.id}`} className="label link-line">
          View public page →
        </Link>
      </div>
    </Shell>
  );
}
