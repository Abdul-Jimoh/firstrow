import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/server/rate-limit";

const MAX_BYTES = 3_000_000;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/webp": "webp", "image/png": "png" };

// Stores an event poster. The browser resizes it first, so anything large here is not from our form.
export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Poster uploads aren't set up on this deployment." }, { status: 503 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!rateLimit(`poster:${ip}`, 10, 60 * 60_000)) {
    return NextResponse.json({ error: "Too many uploads. Try again later." }, { status: 429 });
  }

  const file = (await req.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  const extension = TYPES[file.type];
  if (!extension) return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is too large." }, { status: 400 });

  const blob = await put(`posters/poster.${extension}`, file, { access: "public", addRandomSuffix: true, contentType: file.type });
  return NextResponse.json({ url: blob.url });
}
