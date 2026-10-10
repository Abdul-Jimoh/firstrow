"use client";

import Link from "next/link";
import { useAccount } from "@/components/account";
import { Reveal } from "@/components/motion";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui";
import { dateLabel, formatAusd, phaseOf } from "@/lib/events";
import { useEvents } from "@/lib/hooks";

export default function HostPage() {
  const { address, ready, openSheet } = useAccount();
  const { data, isLoading } = useEvents();
  const mine = (data ?? []).filter((e) => e.host.toLowerCase() === address?.toLowerCase());

  return (
    <Shell>
      <div className="flex flex-wrap items-end justify-between gap-8">
        <Reveal as="h1" lines immediate className="display text-[clamp(3.5rem,10vw,9rem)]">
          Your <span className="accent">events</span>
        </Reveal>
        <Link href="/host/new" className="label border-b border-ink pb-2">
          + New event
        </Link>
      </div>

      <div className="mt-16">
        {!ready ? null : !address ? (
          <div className="max-w-md space-y-6">
            <p className="text-lg text-ink-2">Sign in with your passkey to create and run events.</p>
            <Button onClick={openSheet} className="w-full">
              <span className="text-lg">Sign in</span>
            </Button>
          </div>
        ) : isLoading ? (
          <p className="label text-mute">Reading the chain…</p>
        ) : mine.length === 0 ? (
          <p className="headline text-2xl text-ink-2">
            No events yet.{" "}
            <Link href="/host/new" className="link-line">
              Create your first →
            </Link>
          </p>
        ) : (
          <div className="border-t border-ink">
            {mine.map((e) => {
              const supply = e.tiers.reduce((n, t) => n + t.supply, 0);
              return (
                <Link key={e.id} href={`/host/${e.id}`} className="group grid gap-2 border-b rule py-6 md:grid-cols-[1fr_8rem_8rem_8rem_2rem] md:items-baseline md:gap-6">
                  <div>
                    <p className="headline text-3xl group-hover:underline">{e.meta.name}</p>
                    <p className="label mt-2 text-mute">
                      {dateLabel(e.startsAt)} · {phaseOf(e)}
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
