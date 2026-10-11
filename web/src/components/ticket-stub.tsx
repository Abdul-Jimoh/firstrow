import type { ReactNode } from "react";

const TINTS = ["#d9cfe8", "#c9d2ae", "#eed9a0", "#ebbfa8", "#c6d9d6"];

// Every event gets one of a few paper colours, so a stack of tickets reads as different nights out.
export const ticketTint = (eventId: bigint) => TINTS[Number(eventId % BigInt(TINTS.length))];

type Props = {
  title: string;
  date: string;
  venue: string;
  holder: string;
  tier: string;
  number: string;
  status?: ReactNode;
  tint?: string;
  // Faded for tickets that can no longer be used.
  spent?: boolean;
  className?: string;
};

// A paper ticket: main body, perforation, stub.
export function TicketStub({ title, date, venue, holder, tier, number, status, tint = "#e5e0d7", spent, className = "" }: Props) {
  return (
    <div
      className={`relative flex min-w-0 text-ink shadow-[0_30px_60px_-30px_rgba(21,20,18,0.45)] ${spent ? "opacity-60 saturate-50" : ""} ${className}`}
      style={{ backgroundColor: tint }}
    >
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-8 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <span className="label">Firstrow</span>
          {status}
        </div>
        <div>
          <p className="headline line-clamp-2 text-[clamp(1.6rem,4vw,2.25rem)]">{title}</p>
          <p className="label mt-3 text-ink-2">
            {date} — {venue}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="min-w-0">
            <p className="label text-ink-2">Holder</p>
            <p className="mt-1 truncate font-medium">{holder}</p>
          </div>
          <div className="min-w-0">
            <p className="label text-ink-2">Tier</p>
            <p className="mt-1 truncate font-medium">{tier}</p>
          </div>
        </div>
      </div>
      <div className="relative w-px border-l border-dashed border-ink/40">
        <span className="absolute -top-3 -left-3 size-6 rounded-full bg-paper" />
        <span className="absolute -bottom-3 -left-3 size-6 rounded-full bg-paper" />
      </div>
      <div className="flex w-20 flex-col items-center justify-between bg-ink/5 py-6 sm:w-24">
        <span className="label [writing-mode:vertical-rl] rotate-180">Admit one</span>
        <span className="display text-2xl tabular-nums sm:text-3xl">{number}</span>
      </div>
    </div>
  );
}
