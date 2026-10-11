"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import QrScanner from "qr-scanner";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { isHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { firstrowAbi } from "@/lib/abi";
import { chain, network, publicClient } from "@/lib/chain";
import { decodeEntry, doorMessage } from "@/lib/entry";
import { useEvent } from "@/lib/hooks";
import { fetchName } from "@/lib/profile";
import { send } from "@/lib/signing";

type Result =
  | { kind: "ok"; admitted: number; name: string | null; tiers: string[]; supporterNumber: number; firstTime: boolean }
  | { kind: "error"; message: string };

const storageKey = (eventId: string) => `firstrow.door.${chain.id}.${eventId}`;

// The pairing link carries the key in its #fragment. Move it into this phone's storage and out of the URL.
function useDoorKey(eventId: string): Hex | null | undefined {
  return useSyncExternalStore(
    () => () => {},
    () => {
      const match = window.location.hash.match(/k=(0x[0-9a-fA-F]{64})/);
      if (match) {
        localStorage.setItem(storageKey(eventId), match[1]);
        history.replaceState(null, "", window.location.pathname);
      }
      const stored = localStorage.getItem(storageKey(eventId));
      return stored && isHex(stored) ? stored : null;
    },
    () => undefined,
  );
}

export default function DoorPage() {
  const params = useParams<{ id: string }>();
  const eventId = /^\d+$/.test(params.id) ? BigInt(params.id) : null;
  const key = useDoorKey(params.id);
  const door = key ? privateKeyToAccount(key) : null;
  const { data: event } = useEvent(eventId);

  const { data: paired } = useQuery({
    queryKey: ["isDoor", params.id, door?.address],
    enabled: !!door && eventId !== null,
    queryFn: () =>
      publicClient.readContract({ address: network.firstrow, abi: firstrowAbi, functionName: "isDoor", args: [eventId!, door!.address] }),
  });

  const video = useRef<HTMLVideoElement>(null);
  const scanner = useRef<QrScanner | null>(null);
  const busy = useRef(false);
  const lastCode = useRef<{ value: string; at: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [checking, setChecking] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const handle = useCallback(
    async (raw: string) => {
      if (busy.current || !door || !event) return;
      const now = Date.now();
      if (lastCode.current?.value === raw && now - lastCode.current.at < 4000) return;
      lastCode.current = { value: raw, at: now };

      const entry = decodeEntry(raw);
      if (!entry) return setResult({ kind: "error", message: "Not a Firstrow code." });
      if (entry.eventId !== event.id) return setResult({ kind: "error", message: doorMessage("WrongEvent") });

      busy.current = true;
      setChecking(true);
      setResult(null);
      try {
        await send(door, "checkIn", [entry.eventId, entry.ticketIds, entry.deadline, entry.signature]);
        const tickets = await publicClient.multicall({
          allowFailure: false,
          contracts: entry.ticketIds.map((id) => ({ address: network.firstrow, abi: firstrowAbi, functionName: "getTicket", args: [id] }) as const),
        });
        const fan = tickets[0].owner;
        const [supporter, name] = await Promise.all([
          publicClient.readContract({ address: network.firstrow, abi: firstrowAbi, functionName: "supporter", args: [event.host, fan] }),
          fetchName(fan),
        ]);
        setResult({
          kind: "ok",
          admitted: entry.ticketIds.length,
          name,
          tiers: tickets.map((t) => event.tiers[t.tier]?.name ?? ""),
          supporterNumber: supporter.number,
          firstTime: supporter.shows === 1,
        });
      } catch (e) {
        setResult({ kind: "error", message: doorMessage(e instanceof Error ? e.message : "Check-in failed") });
      } finally {
        setChecking(false);
        setTimeout(() => {
          busy.current = false;
        }, 1200);
      }
    },
    [door, event],
  );

  // The camera starts once. Scans go through a ref to the latest handler, so fresh event data (it refetches
  // every few seconds for the counter) never restarts the camera.
  const latestHandle = useRef(handle);
  useEffect(() => {
    latestHandle.current = handle;
  }, [handle]);

  useEffect(() => {
    if (!video.current || !paired) return;
    const s = new QrScanner(video.current, (r) => latestHandle.current(r.data), {
      preferredCamera: "environment",
      highlightScanRegion: false,
      maxScansPerSecond: 8,
      returnDetailedScanResult: true,
      // Decode the whole frame, so a code anywhere in view is picked up without lining it up.
      calculateScanRegion: (v) => {
        const scale = Math.min(1, 960 / Math.max(v.videoWidth, v.videoHeight));
        return {
          x: 0,
          y: 0,
          width: v.videoWidth,
          height: v.videoHeight,
          downScaledWidth: Math.round(v.videoWidth * scale),
          downScaledHeight: Math.round(v.videoHeight * scale),
        };
      },
    });
    scanner.current = s;
    s.start().catch(() => setCameraError("Allow camera access to scan tickets."));
    return () => {
      s.destroy();
      scanner.current = null;
    };
  }, [paired]);

  useEffect(() => {
    if (!result) return;
    const clear = setTimeout(() => setResult(null), result.kind === "ok" ? 3500 : 5000);
    return () => clearTimeout(clear);
  }, [result]);

  const tone = result?.kind === "ok" ? "bg-paper text-ink" : result?.kind === "error" ? "bg-signal text-paper" : "bg-ink text-paper";

  if (key === undefined) return <main className="min-h-dvh bg-ink" />;

  if (!door || paired === false) {
    return (
      <main className="flex min-h-dvh flex-col justify-between bg-ink p-6 text-paper">
        <p className="label">Firstrow · Door</p>
        <div>
          <h1 className="display text-6xl">Not paired.</h1>
          <p className="mt-4 max-w-sm text-paper/70">On the host dashboard, tap “Pair a door phone” and scan the code with this phone&apos;s camera.</p>
        </div>
        <span />
      </main>
    );
  }

  return (
    <main className={`flex min-h-dvh flex-col transition-colors duration-300 ${tone}`}>
      <header className="flex items-start justify-between p-5">
        <div>
          <p className="label opacity-70">Firstrow · Door</p>
          <p className="headline mt-1 text-xl">{event?.meta.name ?? "…"}</p>
        </div>
        <p className="label text-right tabular-nums">
          <span className="display block text-4xl">{event?.checkedIn ?? 0}</span>
          <span className="opacity-70">in / {event?.sold ?? 0} sold</span>
        </p>
      </header>

      <div className="relative mx-5 flex-1 overflow-hidden bg-black">
        <video ref={video} className="absolute inset-0 h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-[18%] border-2 border-paper/70" />
        {(checking || result) && (
          <div className={`absolute inset-0 flex flex-col justify-end p-6 ${checking ? "bg-ink/80 text-paper" : tone}`}>
            {checking ? (
              <p className="display text-5xl">Checking…</p>
            ) : result?.kind === "ok" ? (
              <>
                <p className="display text-[clamp(4rem,20vw,8rem)]">
                  Admit {result.admitted}
                </p>
                <p className="label mt-3">
                  {result.name ? `${result.name} · ` : ""}
                  {result.tiers.join(" · ")}
                </p>
                <p className="headline mt-6 text-2xl">
                  {result.firstTime ? "First show with you. " : ""}Supporter No. {String(result.supporterNumber).padStart(3, "0")}
                </p>
              </>
            ) : (
              <>
                <p className="display text-6xl">Stop.</p>
                <p className="headline mt-4 text-2xl">{result?.kind === "error" && result.message}</p>
              </>
            )}
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between p-5">
        <p className="label opacity-70">{cameraError ?? "Point at the guest's entry code"}</p>
        <p className="label opacity-70">{door.address.slice(0, 8)}</p>
      </footer>
    </main>
  );
}
