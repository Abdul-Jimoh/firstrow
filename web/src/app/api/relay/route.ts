import { NextResponse } from "next/server";
import { parseRequest, relay, RelayError } from "@/lib/server/relayer";
import { rateLimit } from "@/lib/server/rate-limit";

export async function POST(req: Request) {
  try {
    const request = parseRequest(await req.json());
    if (!rateLimit(`relay:${request.from.toLowerCase()}`, 30, 60_000)) {
      return NextResponse.json({ error: "Too many requests, try again in a minute" }, { status: 429 });
    }
    const hash = await relay(request);
    return NextResponse.json({ hash });
  } catch (error) {
    if (error instanceof RelayError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "Relay failed" }, { status: 500 });
  }
}
