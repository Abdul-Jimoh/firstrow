import { list, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { isAddress, isHex, verifyMessage } from "viem";
import { profileMessage } from "@/lib/profile";
import { rateLimit } from "@/lib/server/rate-limit";

const path = (address: string) => `profiles/${address.toLowerCase()}.json`;
const configured = () => !!process.env.BLOB_READ_WRITE_TOKEN;

async function read(address: string): Promise<string | null> {
  const { blobs } = await list({ prefix: path(address), limit: 1 });
  if (!blobs[0]) return null;
  const res = await fetch(blobs[0].url, { cache: "no-store" });
  if (!res.ok) return null;
  const name = ((await res.json()) as { name?: unknown }).name;
  return typeof name === "string" ? name : null;
}

// Display names for up to 20 accounts: /api/profile?addresses=0x..,0x..
export async function GET(req: Request) {
  const addresses = (new URL(req.url).searchParams.get("addresses") ?? "").split(",").filter((a) => isAddress(a)).slice(0, 20);
  if (!configured() || addresses.length === 0) return NextResponse.json({ names: {} });
  const names = await Promise.all(addresses.map((a) => read(a).catch(() => null)));
  return NextResponse.json({ names: Object.fromEntries(addresses.map((a, i) => [a.toLowerCase(), names[i]]).filter(([, n]) => n)) });
}

// Sets an account's display name. The account signs the name, so only its owner can change it.
export async function POST(req: Request) {
  if (!configured()) return NextResponse.json({ error: "Profiles aren't set up on this deployment." }, { status: 503 });
  const { address, name, signature } = (await req.json()) as { address?: string; name?: string; signature?: string };
  const clean = typeof name === "string" ? name.trim().slice(0, 40) : "";
  if (!address || !isAddress(address) || !clean || !isHex(signature)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  if (!rateLimit(`profile:${address.toLowerCase()}`, 10, 60 * 60_000)) return NextResponse.json({ error: "Too many changes" }, { status: 429 });

  const valid = await verifyMessage({ address, message: profileMessage(clean), signature });
  if (!valid) return NextResponse.json({ error: "Signature doesn't match the account" }, { status: 401 });

  await put(path(address), JSON.stringify({ name: clean }), {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60,
  });
  return NextResponse.json({ name: clean });
}
