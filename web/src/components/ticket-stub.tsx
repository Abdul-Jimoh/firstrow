import type { ReactNode } from "react";

type Props = {
  title: string;
  date: string;
  venue: string;
  holder: string;
  tier: string;
  number: string;
  status?: ReactNode;
  className?: string;
};

// A paper ticket: main body, perforation, stub.
export function TicketStub({ title, date, venue, holder, tier, number, status, className = "" }: Props) {
  return (
    <div className={`relative flex bg-paper-2 text-ink shadow-[0_30px_60px_-30px_rgba(21,20,18,0.45)] ${className}`}>
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
        <div className="flex gap-8">
          <div>
            <p className="label text-mute">Holder</p>
            <p className="mt-1 truncate">{holder}</p>
          </div>
          <div>
            <p className="label text-mute">Tier</p>
            <p className="mt-1 truncate">{tier}</p>
          </div>
        </div>
      </div>
      <div className="relative w-px border-l border-dashed border-ink/30">
        <span className="absolute -top-3 -left-3 size-6 rounded-full bg-paper" />
        <span className="absolute -bottom-3 -left-3 size-6 rounded-full bg-paper" />
      </div>
      <div className="flex w-20 flex-col items-center justify-between py-6 sm:w-24">
        <span className="label [writing-mode:vertical-rl] rotate-180">Admit one</span>
        <span className="display text-2xl tabular-nums sm:text-3xl">{number}</span>
      </div>
    </div>
  );
}
