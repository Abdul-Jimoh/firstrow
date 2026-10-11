// Uploads the sample posters through the site's own upload route and attaches them to the sample events.
// Usage: node --env-file=.env.local scripts/posters.mjs
import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

const SITE = process.env.SITE_URL ?? "https://www.firstrow.site";
const FIRSTROW = "0xa0701766CEf8F7F42D919347A0227f4aD3ef6F58";
const abi = parseAbi([
  "struct Event { address host; uint64 startsAt; uint64 endsAt; uint64 saleStartsAt; uint64 presaleStartsAt; uint16 presaleMinShows; uint16 resaleCapBps; uint16 royaltyBps; uint8 tierCount; bool cancelled; uint32 sold; uint32 checkedIn; uint128 validValue; uint128 checkedInValue; uint128 royalties; uint128 paidOut; string metadataURI; }",
  "struct Tier { uint128 price; uint32 supply; uint32 sold; }",
  "function getEvent(uint256 id) view returns (Event e, Tier[] tiers)",
  "function updateMetadata(uint256 id, string metadataURI)",
]);

const samples = [
  { id: 1n, file: "lagos-late-night-jazz", patch: { venue: "The Riverside Club" } },
  { id: 2n, file: "monad-builders-night" },
  { id: 3n, file: "afrobeats-on-the-roof" },
  { id: 4n, file: "open-mic-at-the-jazzhole" },
  { id: 5n, file: "friday-film-club" },
];

const account = privateKeyToAccount(process.env.RELAYER_PRIVATE_KEY);
const wallet = createWalletClient({ account, chain: monadTestnet, transport: http() });
const client = createPublicClient({ chain: monadTestnet, transport: http() });
const PREFIX = "data:application/json;base64,";

for (const s of samples) {
  const [event] = await client.readContract({ address: FIRSTROW, abi, functionName: "getEvent", args: [s.id] });
  const meta = JSON.parse(Buffer.from(event.metadataURI.slice(PREFIX.length), "base64").toString());

  const body = new FormData();
  const bytes = readFileSync(new URL(`../../brand/posters/${s.file}.jpg`, import.meta.url));
  body.append("file", new File([bytes], `${s.file}.jpg`, { type: "image/jpeg" }));
  const res = await fetch(`${SITE}/api/poster`, { method: "POST", body });
  if (!res.ok) throw new Error(`${s.file}: ${JSON.stringify(await res.json())}`);
  const { url } = await res.json();

  const next = { ...meta, ...s.patch, poster: url };
  const args = [s.id, PREFIX + Buffer.from(JSON.stringify(next)).toString("base64")];
  const gas = await client.estimateContractGas({ address: FIRSTROW, abi, functionName: "updateMetadata", args, account });
  const hash = await wallet.writeContract({ address: FIRSTROW, abi, functionName: "updateMetadata", args, gas: (gas * 12n) / 10n });
  await client.waitForTransactionReceipt({ hash });
  console.log(`✓ ${next.name} → ${url.split("/").pop()}`);
}
