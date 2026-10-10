"use client";

import { useEffect } from "react";
import { parseEventLogs, type Hex } from "viem";
import { firstrowAbi } from "@/lib/abi";
import { network, publicClient } from "@/lib/chain";
import { currentAccount, deriveDoorKey, signIn, signUp } from "@/lib/passkey";
import { emptyAuthorization, send, signCheckIn, signPayment } from "@/lib/signing";

// Development harness for the passkey and relay layer. Driven by scripts/e2e.mjs.
async function logsOf(hash: Hex) {
  const receipt = await publicClient.getTransactionReceipt({ hash });
  return parseEventLogs({ abi: firstrowAbi, logs: receipt.logs });
}

const lab = {
  async signUp(name: string) {
    const { account } = await signUp(name);
    return account.address;
  },
  async signIn() {
    const { account } = await signIn();
    return account.address;
  },
  async faucet() {
    const account = currentAccount();
    if (!account) throw new Error("Not signed in");
    const res = await fetch("/api/faucet", { method: "POST", body: JSON.stringify({ address: account.address }) });
    return res.json();
  },
  async createEvent(price: string) {
    const account = currentAccount();
    if (!account) throw new Error("Not signed in");
    const now = BigInt(Math.floor(Date.now() / 1000));
    const { hash } = await send(account, "createEvent", [
      {
        metadataURI: "ipfs://lab",
        startsAt: now + 60n,
        endsAt: now + 3600n,
        saleStartsAt: now,
        presaleStartsAt: now,
        presaleMinShows: 0,
        resaleCapBps: 0,
        royaltyBps: 500,
      },
      [{ price: BigInt(price), supply: 10 }],
    ]);
    const created = (await logsOf(hash)).find((l) => l.eventName === "EventCreated");
    return { hash, eventId: created?.args.eventId?.toString() };
  },
  async buy(eventId: string, price: string) {
    const account = currentAccount();
    if (!account) throw new Error("Not signed in");
    const id = BigInt(eventId);
    const door = await deriveDoorKey(id);
    door.end();
    const auth = BigInt(price) > 0n ? await signPayment(account, BigInt(price)) : emptyAuthorization;
    const { hash } = await send(account, "buy", [id, 0n, 1n, door.address, auth]);
    const bought = (await logsOf(hash)).find((l) => l.eventName === "TicketsPurchased");
    return { hash, ticketId: bought?.args.firstTicketId?.toString(), doorKey: door.address };
  },
  async checkIn(eventId: string, ticketId: string) {
    const account = currentAccount();
    if (!account) throw new Error("Not signed in");
    const id = BigInt(eventId);
    const ids = [BigInt(ticketId)];
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
    const door = await deriveDoorKey(id);
    const signature = await signCheckIn(door.account, id, ids, deadline);
    door.end();
    // The host submits it here; at a real event a paired door phone does.
    const { hash } = await send(account, "checkIn", [id, ids, deadline, signature]);
    const ticket = await publicClient.readContract({
      address: network.firstrow,
      abi: firstrowAbi,
      functionName: "getTicket",
      args: [BigInt(ticketId)],
    });
    return { hash, status: ticket.status };
  },
  async ausdBalance(address: Hex) {
    const balance = await publicClient.readContract({
      address: network.ausd,
      abi: [
        { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
      ],
      functionName: "balanceOf",
      args: [address],
    });
    return balance.toString();
  },
};

declare global {
  interface Window {
    lab?: typeof lab;
  }
}

export default function Lab() {
  useEffect(() => {
    window.lab = lab;
  }, []);
  return <main className="p-8 font-mono text-sm">lab</main>;
}
