import { TicketStatus, type EventView } from "./events";
import type { Tone } from "@/components/ui";

export type TicketState = { label: string; tone: Tone; usable: boolean };

// What a ticket is right now, in the words and colour shown on it.
export function ticketState(status: TicketStatus, event: EventView, now = new Date()): TicketState {
  if (status === TicketStatus.CheckedIn) return { label: "Checked in", tone: "ink", usable: false };
  if (status === TicketStatus.Refunded) return { label: "Refunded", tone: "done", usable: false };
  if (event.cancelled) return { label: "Cancelled · refund available", tone: "stop", usable: false };
  if (event.endsAt < now) {
    const refundable = now.getTime() <= event.endsAt.getTime() + 7 * 864e5;
    return refundable ? { label: "Not used · refund available", tone: "warn", usable: false } : { label: "Not used", tone: "done", usable: false };
  }
  return { label: "Valid", tone: "go", usable: true };
}
