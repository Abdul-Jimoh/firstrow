import type { Address } from "viem";
import { firstrowAbi } from "./abi";
import { AUSD_DECIMALS, network, publicClient } from "./chain";

export type EventMeta = {
  name: string;
  venue: string;
  city: string;
  description: string;
  tiers: string[];
  poster?: string;
};

export type Tier = { name: string; price: bigint; supply: number; sold: number };

export type EventView = {
  id: bigint;
  host: Address;
  startsAt: Date;
  endsAt: Date;
  saleStartsAt: Date;
  presaleStartsAt: Date;
  presaleMinShows: number;
  resaleCapBps: number;
  royaltyBps: number;
  cancelled: boolean;
  sold: number;
  checkedIn: number;
  validValue: bigint;
  checkedInValue: bigint;
  royalties: bigint;
  paidOut: bigint;
  tiers: Tier[];
  meta: EventMeta;
};

export enum TicketStatus {
  None = 0,
  Valid = 1,
  CheckedIn = 2,
  Refunded = 3,
}

export type TicketView = { id: bigint; eventId: bigint; tier: number; status: TicketStatus; owner: Address };

// Posters are only shown from our own Vercel Blob store, so event metadata can't point the page at arbitrary hosts.
const POSTER_URL = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/posters\//;

const fallbackMeta = (id: bigint): EventMeta => ({
  name: `Event ${id}`,
  venue: "",
  city: "",
  description: "",
  tiers: [],
});

export function encodeMeta(meta: EventMeta): string {
  const bytes = new TextEncoder().encode(JSON.stringify(meta));
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return `data:application/json;base64,${btoa(binary)}`;
}

export function decodeMeta(uri: string, id: bigint): EventMeta {
  try {
    const prefix = "data:application/json;base64,";
    if (!uri.startsWith(prefix)) return fallbackMeta(id);
    const binary = atob(uri.slice(prefix.length));
    const json = new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
    const meta = JSON.parse(json) as Partial<EventMeta>;
    return {
      name: String(meta.name ?? `Event ${id}`).slice(0, 120),
      venue: String(meta.venue ?? "").slice(0, 120),
      city: String(meta.city ?? "").slice(0, 60),
      description: String(meta.description ?? "").slice(0, 2000),
      tiers: Array.isArray(meta.tiers) ? meta.tiers.map((t) => String(t).slice(0, 60)) : [],
      poster: typeof meta.poster === "string" && POSTER_URL.test(meta.poster) ? meta.poster : undefined,
    };
  } catch {
    return fallbackMeta(id);
  }
}

const date = (seconds: bigint) => new Date(Number(seconds) * 1000);

type RawEvent = Awaited<ReturnType<typeof readEvent>>;

function readEvent(id: bigint) {
  return publicClient.readContract({ address: network.firstrow, abi: firstrowAbi, functionName: "getEvent", args: [id] });
}

function toView(id: bigint, [e, tiers]: RawEvent): EventView {
  const meta = decodeMeta(e.metadataURI, id);
  return {
    id,
    host: e.host,
    startsAt: date(e.startsAt),
    endsAt: date(e.endsAt),
    saleStartsAt: date(e.saleStartsAt),
    presaleStartsAt: date(e.presaleStartsAt),
    presaleMinShows: e.presaleMinShows,
    resaleCapBps: e.resaleCapBps,
    royaltyBps: e.royaltyBps,
    cancelled: e.cancelled,
    sold: e.sold,
    checkedIn: e.checkedIn,
    validValue: e.validValue,
    checkedInValue: e.checkedInValue,
    royalties: e.royalties,
    paidOut: e.paidOut,
    tiers: tiers.map((t, i) => ({
      name: meta.tiers[i] || (tiers.length === 1 ? "General admission" : `Tier ${i + 1}`),
      price: t.price,
      supply: t.supply,
      sold: t.sold,
    })),
    meta,
  };
}

export async function fetchEvent(id: bigint): Promise<EventView | null> {
  const raw = await readEvent(id);
  if (raw[0].host === "0x0000000000000000000000000000000000000000") return null;
  return toView(id, raw);
}

// Newest first.
export async function fetchEvents(limit = 60): Promise<EventView[]> {
  const count = await publicClient.readContract({ address: network.firstrow, abi: firstrowAbi, functionName: "eventCount" });
  const ids: bigint[] = [];
  for (let id = count; id > 0n && ids.length < limit; id--) ids.push(id);
  if (ids.length === 0) return [];
  const results = await publicClient.multicall({
    contracts: ids.map((id) => ({ address: network.firstrow, abi: firstrowAbi, functionName: "getEvent", args: [id] }) as const),
    allowFailure: false,
  });
  return results.map((raw, i) => toView(ids[i], raw as RawEvent));
}

export async function fetchTicketsOf(owner: Address): Promise<TicketView[]> {
  const count = await publicClient.readContract({
    address: network.firstrow,
    abi: firstrowAbi,
    functionName: "ticketCountOf",
    args: [owner],
  });
  if (count === 0n) return [];
  const ids = await publicClient.readContract({
    address: network.firstrow,
    abi: firstrowAbi,
    functionName: "ticketsOf",
    args: [owner, 0n, count],
  });
  const tickets = await publicClient.multicall({
    contracts: ids.map((id) => ({ address: network.firstrow, abi: firstrowAbi, functionName: "getTicket", args: [id] }) as const),
    allowFailure: false,
  });
  return tickets.map((t, i) => ({ id: ids[i], eventId: t.eventId, tier: t.tier, status: t.status as TicketStatus, owner: t.owner }));
}

export async function fetchSupporter(host: Address, fan: Address) {
  return publicClient.readContract({ address: network.firstrow, abi: firstrowAbi, functionName: "supporter", args: [host, fan] });
}

const ausdAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

export async function fetchAusdBalance(owner: Address) {
  return publicClient.readContract({ address: network.ausd, abi: ausdAbi, functionName: "balanceOf", args: [owner] });
}

export function formatAusd(amount: bigint, { free = true } = {}) {
  if (amount === 0n && free) return "Free";
  const whole = amount / 10n ** BigInt(AUSD_DECIMALS);
  const cents = (amount % 10n ** BigInt(AUSD_DECIMALS)) / 10n ** BigInt(AUSD_DECIMALS - 2);
  return `$${whole.toLocaleString("en-US")}${cents > 0n ? `.${cents.toString().padStart(2, "0")}` : ""}`;
}

export function parseAusd(input: string): bigint {
  const [whole, frac = ""] = input.trim().replace(/^\$/, "").split(".");
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac)) throw new Error("Enter a price like 12.50");
  return BigInt(whole || "0") * 10n ** BigInt(AUSD_DECIMALS) + BigInt((frac + "000000").slice(0, AUSD_DECIMALS));
}

export type Phase = "cancelled" | "upcoming" | "presale" | "on-sale" | "live" | "ended";

export function phaseOf(e: EventView, now = new Date()): Phase {
  if (e.cancelled) return "cancelled";
  if (now >= e.endsAt) return "ended";
  if (now >= e.startsAt) return "live";
  if (now >= e.saleStartsAt) return "on-sale";
  if (e.presaleMinShows > 0 && now >= e.presaleStartsAt) return "presale";
  return "upcoming";
}

export function soldOut(e: EventView) {
  return e.tiers.every((t) => t.sold >= t.supply);
}

export const dateLabel = (d: Date) =>
  d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export const timeLabel = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
