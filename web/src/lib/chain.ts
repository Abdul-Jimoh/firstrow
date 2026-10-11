import { createPublicClient, http, type Address } from "viem";
import { monad, monadTestnet } from "viem/chains";

const networks = {
  monad: {
    chain: monad,
    ausd: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
    firstrow: "0x0000000000000000000000000000000000000000",
    forwarder: "0x0000000000000000000000000000000000000000",
    hidden: [],
  },
  monadTestnet: {
    chain: monadTestnet,
    ausd: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
    firstrow: "0xa0701766CEf8F7F42D919347A0227f4aD3ef6F58",
    forwarder: "0x8071155E3c3621FD5fe9Eae19C79D5bA9a2a70Ac",
    // Events made by automated test runs against this deployment. Left out of listings; still reachable by link.
    hidden: [12n, 13n],
  },
} as const satisfies Record<
  string,
  { chain: typeof monad | typeof monadTestnet; ausd: Address; firstrow: Address; forwarder: Address; hidden: readonly bigint[] }
>;

type NetworkName = keyof typeof networks;

const name = (process.env.NEXT_PUBLIC_CHAIN ?? "monadTestnet") as NetworkName;
if (!(name in networks)) throw new Error(`Unknown NEXT_PUBLIC_CHAIN: ${name}`);

export const network = networks[name];
export const chain = network.chain;
export const AUSD_DECIMALS = 6;
export const explorer = chain.blockExplorers?.default.url ?? "https://testnet.monadscan.com";

export const publicClient = createPublicClient({ chain, transport: http() });
