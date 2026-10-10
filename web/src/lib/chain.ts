import { createPublicClient, http, type Address } from "viem";
import { monad, monadTestnet } from "viem/chains";

const networks = {
  monad: {
    chain: monad,
    ausd: "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a",
  },
  monadTestnet: {
    chain: monadTestnet,
    ausd: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
  },
} as const satisfies Record<string, { chain: typeof monad | typeof monadTestnet; ausd: Address }>;

type NetworkName = keyof typeof networks;

const name = (process.env.NEXT_PUBLIC_CHAIN ?? "monadTestnet") as NetworkName;
if (!(name in networks)) throw new Error(`Unknown NEXT_PUBLIC_CHAIN: ${name}`);

export const network = networks[name];
export const chain = network.chain;
export const AUSD_DECIMALS = 6;

export const publicClient = createPublicClient({ chain, transport: http() });
