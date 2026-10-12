import type { Address } from "viem";
import { firstrowAbi } from "./abi";
import { network, publicClient } from "./chain";
import { fetchEvents, fetchTicketsOf, TicketStatus } from "./events";

// Envio HyperIndex GraphQL endpoint. When it's unset or unreachable, pages fall back to chain reads where they can.
const URL = process.env.NEXT_PUBLIC_INDEXER_URL;

export type Standing = { host: Address; number: number; shows: number; firstShowAt: number | null };
export type Attendance = { eventId: bigint; ticketId: bigint; host: Address; timestamp: number | null; txHash: string | null };
export type FanRecord = { standings: Standing[]; attendance: Attendance[]; source: "indexer" | "chain" };
export type Totals = { events: number; ticketsSold: number; checkIns: number; supporters: number };

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  if (!URL) throw new Error("No indexer configured");
  const res = await fetch(URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(body.errors?.[0]?.message ?? "Indexer query failed");
  return body.data as T;
}

export async function fetchFanRecord(fan: Address): Promise<FanRecord> {
  try {
    const data = await gql<{
      Supporter: { host: Address; number: number; shows: number; firstShowAt: number }[];
      CheckIn: { eventId: string; ticketId: string; host: Address; timestamp: number; txHash: string }[];
    }>(
      `query Fan($fan: String!) {
        Supporter(where: { fan: { _eq: $fan } }, order_by: { firstShowAt: asc }) { host number shows firstShowAt }
        CheckIn(where: { fan: { _eq: $fan } }, order_by: { timestamp: desc }, limit: 200) { eventId ticketId host timestamp txHash }
      }`,
      { fan: fan.toLowerCase() },
    );
    return {
      source: "indexer",
      standings: data.Supporter,
      attendance: data.CheckIn.map((c) => ({ ...c, eventId: BigInt(c.eventId), ticketId: BigInt(c.ticketId) })),
    };
  } catch {
    return fanRecordFromChain(fan);
  }
}

// Without the indexer: the fan's checked-in tickets give the events, and the contract gives the standing per host.
async function fanRecordFromChain(fan: Address): Promise<FanRecord> {
  const [tickets, events] = await Promise.all([fetchTicketsOf(fan), fetchEvents(200)]);
  const hostOf = new Map(events.map((e) => [e.id, e.host]));
  const attended = tickets.filter((t) => t.status === TicketStatus.CheckedIn && hostOf.has(t.eventId));
  const hosts = [...new Set(attended.map((t) => hostOf.get(t.eventId)!))];
  const standings = hosts.length
    ? await publicClient.multicall({
        allowFailure: false,
        contracts: hosts.map((host) => ({ address: network.firstrow, abi: firstrowAbi, functionName: "supporter", args: [host, fan] }) as const),
      })
    : [];
  return {
    source: "chain",
    standings: hosts.map((host, i) => ({ host, number: standings[i].number, shows: standings[i].shows, firstShowAt: null })),
    attendance: attended
      .map((t) => ({ eventId: t.eventId, ticketId: t.id, host: hostOf.get(t.eventId)!, timestamp: null, txHash: null }))
      .reverse(),
  };
}

export async function fetchTopSupporters(host: Address, limit = 10): Promise<(Standing & { fan: Address })[] | null> {
  try {
    const data = await gql<{ Supporter: { fan: Address; host: Address; number: number; shows: number; firstShowAt: number }[] }>(
      `query Top($host: String!, $limit: Int!) {
        Supporter(where: { host: { _eq: $host } }, order_by: [{ shows: desc }, { number: asc }], limit: $limit) { fan host number shows firstShowAt }
      }`,
      { host: host.toLowerCase(), limit },
    );
    return data.Supporter;
  } catch {
    return null;
  }
}

export type HostSummary = { events: number; ticketsSold: number; checkIns: number; supporters: number };

// What an account has done as a host. Null when it hasn't hosted, or the indexer is unreachable.
export async function fetchHostSummary(host: Address): Promise<HostSummary | null> {
  try {
    const data = await gql<{ Host: HostSummary[] }>(
      `query Host($id: String!) { Host(where: { id: { _eq: $id } }, limit: 1) { events ticketsSold checkIns supporters } }`,
      { id: host.toLowerCase() },
    );
    return data.Host[0] ?? null;
  } catch {
    return null;
  }
}

export async function fetchTotals(): Promise<Totals | null> {
  try {
    const data = await gql<{ Totals: Totals[] }>(`query { Totals(limit: 1) { events ticketsSold checkIns supporters } }`, {});
    return data.Totals[0] ?? null;
  } catch {
    return null;
  }
}
