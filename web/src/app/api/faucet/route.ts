import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { chain, publicClient } from "@/lib/chain";
import { walletClient } from "@/lib/server/relayer";
import { rateLimit } from "@/lib/server/rate-limit";

// Agora's testnet AUSD faucet. Testnet only.
const FAUCET = "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C";
const faucetAbi = [
  { type: "function", name: "requestFunds", stateMutability: "nonpayable", inputs: [{ type: "address" }], outputs: [] },
] as const;

export async function POST(req: Request) {
  if (chain.testnet !== true) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const { address } = (await req.json()) as { address?: string };
  if (!address || !isAddress(address)) return NextResponse.json({ error: "Bad address" }, { status: 400 });
  if (!rateLimit(`faucet:${address.toLowerCase()}`, 1, 60 * 60_000)) {
    return NextResponse.json({ error: "Already topped up, try again later" }, { status: 429 });
  }
  const wallet = walletClient();
  const hash = await wallet.writeContract({ address: FAUCET, abi: faucetAbi, functionName: "requestFunds", args: [address] });
  await publicClient.waitForTransactionReceipt({ hash });
  return NextResponse.json({ hash });
}
