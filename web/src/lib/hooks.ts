"use client";

import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { firstrowAbi } from "./abi";
import { network, publicClient } from "./chain";
import { fetchAusdBalance, fetchEvent, fetchEvents, fetchSupporter, fetchTicketsOf } from "./events";

export const useEvents = () => useQuery({ queryKey: ["events"], queryFn: () => fetchEvents() });

export const useEvent = (id: bigint | null) =>
  useQuery({ queryKey: ["event", id?.toString()], queryFn: () => fetchEvent(id!), enabled: id !== null, refetchInterval: 4_000 });

export const useTickets = (owner: Address | null) =>
  useQuery({ queryKey: ["tickets", owner], queryFn: () => fetchTicketsOf(owner!), enabled: !!owner, refetchInterval: 4_000 });

export const useAusd = (owner: Address | null) =>
  useQuery({ queryKey: ["ausd", owner], queryFn: () => fetchAusdBalance(owner!), enabled: !!owner, refetchInterval: 6_000 });

export const useSupporter = (host: Address | undefined, fan: Address | null) =>
  useQuery({ queryKey: ["supporter", host, fan], queryFn: () => fetchSupporter(host!, fan!), enabled: !!host && !!fan });

export const useHostBalance = (eventId: bigint | null) =>
  useQuery({
    queryKey: ["hostBalance", eventId?.toString()],
    queryFn: () =>
      publicClient.readContract({ address: network.firstrow, abi: firstrowAbi, functionName: "hostBalance", args: [eventId!] }),
    enabled: eventId !== null,
    refetchInterval: 4_000,
  });

export const useListings = (eventId: bigint | null) =>
  useQuery({
    queryKey: ["listings", eventId?.toString()],
    enabled: eventId !== null,
    refetchInterval: 6_000,
    queryFn: async () => {
      const ids = await publicClient.readContract({
        address: network.firstrow,
        abi: firstrowAbi,
        functionName: "listingsOf",
        args: [eventId!, 0n, 200n],
      });
      if (ids.length === 0) return [];
      const results = await publicClient.multicall({
        allowFailure: false,
        contracts: ids.flatMap((id) => [
          { address: network.firstrow, abi: firstrowAbi, functionName: "listingPrice", args: [id] } as const,
          { address: network.firstrow, abi: firstrowAbi, functionName: "getTicket", args: [id] } as const,
        ]),
      });
      return ids.map((id, i) => {
        const price = results[i * 2] as bigint;
        const ticket = results[i * 2 + 1] as { tier: number; owner: Address };
        return { id, price, tier: ticket.tier, seller: ticket.owner };
      });
    },
  });
