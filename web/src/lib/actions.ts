import { parseEventLogs, type Address, type LocalAccount } from "viem";
import { firstrowAbi } from "./abi";
import { publicClient } from "./chain";
import type { EventMeta, EventView } from "./events";
import { encodeMeta } from "./events";
import { deriveDoorKey, knownDoorKey } from "./passkey";
import { emptyAuthorization, send, signPayment } from "./signing";

// Door key addresses are public, so a cached one avoids a second passkey prompt.
async function doorKeyAddress(eventId: bigint): Promise<Address> {
  const known = knownDoorKey(eventId);
  if (known) return known;
  const door = await deriveDoorKey(eventId);
  door.end();
  return door.address;
}

export async function buyTickets(account: LocalAccount, event: EventView, tier: number, quantity: number) {
  const doorKey = await doorKeyAddress(event.id);
  const total = event.tiers[tier].price * BigInt(quantity);
  const auth = total > 0n ? await signPayment(account, total) : emptyAuthorization;
  return send(account, "buy", [event.id, BigInt(tier), BigInt(quantity), doorKey, auth]);
}

export async function buyResale(account: LocalAccount, eventId: bigint, ticketId: bigint, price: bigint) {
  const doorKey = await doorKeyAddress(eventId);
  const auth = price > 0n ? await signPayment(account, price) : emptyAuthorization;
  return send(account, "buyResale", [ticketId, doorKey, auth]);
}

export type NewEvent = {
  meta: EventMeta;
  startsAt: Date;
  endsAt: Date;
  saleStartsAt: Date;
  presaleStartsAt: Date;
  presaleMinShows: number;
  resaleCapBps: number;
  royaltyBps: number;
  tiers: { price: bigint; supply: number }[];
};

const seconds = (d: Date) => BigInt(Math.floor(d.getTime() / 1000));

export async function createEvent(account: LocalAccount, e: NewEvent): Promise<bigint> {
  const { hash } = await send(account, "createEvent", [
    {
      metadataURI: encodeMeta(e.meta),
      startsAt: seconds(e.startsAt),
      endsAt: seconds(e.endsAt),
      saleStartsAt: seconds(e.saleStartsAt),
      presaleStartsAt: seconds(e.presaleStartsAt),
      presaleMinShows: e.presaleMinShows,
      resaleCapBps: e.resaleCapBps,
      royaltyBps: e.royaltyBps,
    },
    e.tiers.map((t) => ({ price: t.price, supply: t.supply })),
  ]);
  const receipt = await publicClient.getTransactionReceipt({ hash });
  const created = parseEventLogs({ abi: firstrowAbi, logs: receipt.logs, eventName: "EventCreated" })[0];
  return created.args.eventId;
}
