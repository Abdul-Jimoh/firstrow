"use client";

import Link from "next/link";
import { useAccount } from "@/components/account";
import { Reveal } from "@/components/motion";
import { Shell } from "@/components/shell";
import { Button, Pill, SmallLink, type Tone } from "@/components/ui";
import { dateLabel, formatAusd, phaseOf } from "@/lib/events";
import { useEvents } from "@/lib/hooks";

const tones: Record<string, Tone> = { cancelled: "stop", ended: "done", upcoming: "done", presale: "warn", "on-sale": "go", live: "go" };

export default function HostPage() {
  const { address, ready, openSheet } = useAccount();
  const { data, isLoading } = useEvents();
  const mine = (data ?? []).filter((e) => e.host.toLowerCase() === address?.toLowerCase());

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-8">
        <Reveal as="h1" lines immediate className="display text-[clamp(3.5rem,10vw,9rem)]">
          Hosting
        </Reveal>
        <SmallLink href="/host/new" variant="primary" className="mb-3">
          + New event
        </SmallLink>
      </div>

      <div className="mt-16">
        {!ready ? null : !address ? (
          <div className="max-w-md space-y-6">
            <p className="lede text-ink-2">Events you run live here. Sign in with your passkey to create one.</p>
            <Button onClick={openSheet} className="w-full">
              <span className="text-lg">Sign in</span>
            </Button>
          </div>
        ) : isLoading ? (
          <p className="label text-mute">Reading the chain…</p>
        ) : mine.length === 0 ? (
          <div className="max-w-md space-y-5">
            <p className="headline text-3xl">You haven&apos;t hosted anything yet.</p>
            <p className="text-ink-2">Publishing is free. Ticket money is held until each guest checks in.</p>
            <SmallLink href="/host/new" variant="primary">
              Create your first event →
            </SmallLink>
          </div>
        ) : (
          <div className="border-t border-ink">
            {mine.map((e) => {
              const supply = e.tiers.reduce((n, t) => n + t.supply, 0);
              return (
                <Link key={e.id} href={`/host/${e.id}`} className="group grid gap-2 border-b rule py-6 md:grid-cols-[1fr_8rem_8rem_8rem_2rem] md:items-baseline md:gap-6">
                  <div>
                    <p className="headline text-3xl group-hover:underline">{e.meta.name}</p>
                    <p className="label mt-2 flex flex-wrap items-center gap-3 text-ink-2">
                      {dateLabel(e.startsAt)}
                      <Pill tone={tones[phaseOf(e)]}>{phaseOf(e).replace("-", " ")}</Pill>
                    </p>
                  </div>
                  <p className="label">
                    {e.sold}/{supply} <span className="text-mute">sold</span>
                  </p>
                  <p className="label">
                    {e.checkedIn} <span className="text-mute">in</span>
                  </p>
                  <p className="label">{formatAusd(e.checkedInValue + e.validValue + e.royalties - e.paidOut, { free: false })}</p>
                  <span className="label hidden md:block">→</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </Shell>
  );
}
