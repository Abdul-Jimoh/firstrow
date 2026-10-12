import type { Hex } from "viem";
import { chain } from "./chain";

// What the fan's QR carries: everything the door needs to submit a check-in, signed by the fan's door key.
export type EntryCode = { eventId: bigint; ticketIds: bigint[]; deadline: bigint; signature: Hex };

const PREFIX = "FR1";

export function encodeEntry(e: EntryCode) {
  return [PREFIX, chain.id, e.eventId, e.ticketIds.join(","), e.deadline, e.signature].join("|");
}

export function decodeEntry(raw: string): EntryCode | null {
  const [prefix, chainId, eventId, ids, deadline, signature] = raw.split("|");
  if (prefix !== PREFIX || Number(chainId) !== chain.id) return null;
  if (!/^\d+$/.test(eventId) || !/^\d+(,\d+)*$/.test(ids) || !/^\d+$/.test(deadline) || !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    return null;
  }
  return { eventId: BigInt(eventId), ticketIds: ids.split(",").map(BigInt), deadline: BigInt(deadline), signature: signature as Hex };
}

// Contract errors as door staff should read them.
export function doorMessage(error: string) {
  const messages: Record<string, string> = {
    TicketNotValid: "Already checked in, or refunded.",
    SignatureExpired: "Code expired. Ask them to refresh their ticket.",
    SignatureTooEarly: "Code from the future. Check the phone's clock.",
    InvalidSignature: "This code wasn't made by the ticket's owner.",
    WrongEvent: "Ticket for a different event.",
    MixedOwners: "These tickets have different owners.",
    CheckInClosed: "Check-in isn't open right now.",
    EventIsCancelled: "This event was cancelled.",
    NotDoor: "This phone isn't paired for this event any more.",
  };
  return messages[error] ?? "Couldn't check this ticket in. Try scanning again.";
}
