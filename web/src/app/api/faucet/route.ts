import { NextResponse } from "next/server";
import { erc20Abi, isAddress } from "viem";
import { chain, network, publicClient } from "@/lib/chain";
import { walletClient } from "@/lib/server/relayer";
import { rateLimit } from "@/lib/server/rate-limit";

// Agora's testnet AUSD faucet pays 10,000 per call with a cooldown, so the relayer keeps a pool from it and
// hands out small top-ups. Testnet only.
const FAUCET = "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C";
const TOP_UP = 100_000_000n;
const faucetAbi = [
  { type: "function", name: "requestFunds", stateMutability: "nonpayable", inputs: [{ type: "address" }], outputs: [] },
] as const;

export async function POST(req: Request) {
  if (chain.testnet !== true) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const { address } = (await req.json()) as { address?: string };
  if (!address || !isAddress(address)) return NextResponse.json({ error: "Bad address" }, { status: 400 });
  if (!rateLimit(`faucet:${address.toLowerCase()}`, 3, 60 * 60_000)) {
    return NextResponse.json({ error: "That's enough test dollars for now. Try again in an hour." }, { status: 429 });
  }

  const wallet = walletClient();
  const pool = await publicClient.readContract({ address: network.ausd, abi: erc20Abi, functionName: "balanceOf", args: [wallet.account.address] });
  if (pool < TOP_UP) {
    try {
      const refill = await wallet.writeContract({ address: FAUCET, abi: faucetAbi, functionName: "requestFunds", args: [wallet.account.address] });
      await publicClient.waitForTransactionReceipt({ hash: refill });
    } catch {
      return NextResponse.json({ error: "The test faucet is cooling down. Try again in a few minutes." }, { status: 503 });
    }
  }

  const hash = await wallet.writeContract({ address: network.ausd, abi: erc20Abi, functionName: "transfer", args: [address, TOP_UP] });
  await publicClient.waitForTransactionReceipt({ hash });
  return NextResponse.json({ hash });
}
