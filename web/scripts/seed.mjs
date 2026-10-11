// Publishes a few sample events from the relayer account so the listings aren't empty.
// Usage: node --env-file=.env.local scripts/seed.mjs
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

const FIRSTROW = "0x22af952Da57945201D6c38a4DF908dfB471387D5";
const abi = parseAbi([
  "struct EventParams { string metadataURI; uint64 startsAt; uint64 endsAt; uint64 saleStartsAt; uint64 presaleStartsAt; uint16 presaleMinShows; uint16 resaleCapBps; uint16 royaltyBps; }",
  "struct TierParams { uint128 price; uint32 supply; }",
  "function createEvent(EventParams p, TierParams[] tiers) returns (uint256)",
]);

const account = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY);
const transport = http();
const wallet = createWalletClient({ account, chain: monadTestnet, transport });
const client = createPublicClient({ chain: monadTestnet, transport });

const note = "\n\nA sample listing on Monad testnet. Tickets are paid in test dollars.";
const day = 86_400;
const now = Math.floor(Date.now() / 1000);
const evening = (daysAhead, hour) => {
  const d = new Date((now + daysAhead * day) * 1000);
  d.setHours(hour, 0, 0, 0);
  return Math.floor(d.getTime() / 1000);
};
const usd = (n) => BigInt(Math.round(n * 1e6));

const events = [
  {
    name: "Lagos Late Night Jazz",
    venue: "Freedom Park",
    city: "Lagos",
    description: "Three sets, one room, no phones in the front row. Doors at nine.",
    start: evening(6, 21),
    hours: 4,
    tiers: [["Front row", 25, 40], ["General admission", 10, 200]],
  },
  {
    name: "Monad Builders Night",
    venue: "The Zone Tech Park",
    city: "Lagos",
    description: "Demos, lightning talks and too much jollof. Bring a laptop and something you shipped this month.",
    start: evening(3, 18),
    hours: 3,
    tiers: [["Builder", 0, 150]],
  },
  {
    name: "Afrobeats on the Roof",
    venue: "Rooftop 21",
    city: "Abuja",
    description: "Sunset to midnight. Two DJs, one skyline.",
    start: evening(13, 17),
    hours: 7,
    tiers: [["Early bird", 8, 100], ["Regular", 15, 300], ["Table for four", 120, 12]],
    cap: 1000,
  },
  {
    name: "Open Mic at The Jazzhole",
    venue: "The Jazzhole",
    city: "Lagos",
    description: "Poets, singers and one brave comedian. Returning fans get first pick of seats.",
    start: evening(20, 19),
    hours: 3,
    tiers: [["Seat", 5, 60]],
    presaleDays: 4,
  },
  {
    name: "Friday Film Club: Shorts",
    venue: "Alliance Française",
    city: "Accra",
    description: "Nine short films from West African directors, and a Q&A that always runs long.",
    start: evening(9, 19),
    hours: 3,
    tiers: [["Standard", 6, 120], ["Student", 3, 60]],
  },
];

for (const e of events) {
  const meta = { name: e.name, venue: e.venue, city: e.city, description: e.description + note, tiers: e.tiers.map((t) => t[0]) };
  const uri = `data:application/json;base64,${Buffer.from(JSON.stringify(meta)).toString("base64")}`;
  const saleStartsAt = e.presaleDays ? now + e.presaleDays * day : now;
  const args = [
    {
      metadataURI: uri,
      startsAt: BigInt(e.start),
      endsAt: BigInt(e.start + e.hours * 3600),
      saleStartsAt: BigInt(saleStartsAt),
      presaleStartsAt: BigInt(now),
      presaleMinShows: e.presaleDays ? 1 : 0,
      resaleCapBps: e.cap ?? 0,
      royaltyBps: 500,
    },
    e.tiers.map(([, price, supply]) => ({ price: usd(price), supply })),
  ];
  const gas = await client.estimateContractGas({ address: FIRSTROW, abi, functionName: "createEvent", args, account });
  const hash = await wallet.writeContract({ address: FIRSTROW, abi, functionName: "createEvent", args, gas: (gas * 12n) / 10n });
  await client.waitForTransactionReceipt({ hash });
  console.log(`✓ ${e.name} ${hash}`);
}
