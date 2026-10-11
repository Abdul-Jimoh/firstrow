"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { errorMessage, useAccount } from "./account";
import { EASE, prefersReducedMotion, useLenis } from "./motion";

export function SignInSheet() {
  const { sheetOpen, closeSheet, signUp, signIn } = useAccount();
  const [mode, setMode] = useState<"create" | "existing">("create");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const lenis = useLenis();

  useEffect(() => {
    if (sheetOpen) lenis?.current?.stop();
    else lenis?.current?.start();
  }, [sheetOpen, lenis]);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && closeSheet();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, busy, closeSheet]);

  useGSAP(
    () => {
      if (!sheetOpen || prefersReducedMotion()) return;
      gsap.from("[data-scrim]", { autoAlpha: 0, duration: 0.4 });
      gsap.from("[data-panel]", { yPercent: 100, duration: 0.9, ease: EASE });
      gsap.from("[data-stagger]", { y: 24, autoAlpha: 0, duration: 0.8, ease: EASE, stagger: 0.06, delay: 0.15 });
    },
    { scope: root, dependencies: [sheetOpen] },
  );

  if (!sheetOpen) return null;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    run(() => signUp(name.trim()));
  }

  return (
    <div ref={root} className="fixed inset-0 z-50 flex items-end justify-center md:items-center" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <button data-scrim aria-label="Close" className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={() => !busy && closeSheet()} />
      <div data-panel className="relative w-full max-w-lg bg-paper px-6 pt-6 pb-8 md:rounded-none md:p-10">
        <div className="flex items-center justify-between" data-stagger>
          <span className="label text-mute">[ Passkey ]</span>
          <button className="label link-line" onClick={() => !busy && closeSheet()}>
            Close
          </button>
        </div>

        <h2 id="sheet-title" className="display mt-8 text-[clamp(2.75rem,9vw,4rem)]" data-stagger>
          Your face is your ticket.
        </h2>
        <p className="lede mt-4 max-w-sm text-ink-2" data-stagger>
          No password, no seed phrase, no app. Firstrow uses the passkey already on your phone or laptop.
        </p>

        {mode === "create" ? (
          <form onSubmit={onCreate} className="mt-8" data-stagger>
            <label className="label text-mute" htmlFor="name">
              Name on your tickets
            </label>
            <input
              id="name"
              autoFocus
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Ada Obi"
              className="mt-2 w-full border-b border-ink bg-transparent pb-2 text-2xl outline-none placeholder:text-stone"
            />
            <button type="submit" disabled={busy || !name.trim()} className="mt-8 flex w-full items-center justify-between bg-ink px-5 py-4 text-paper transition-opacity disabled:opacity-40">
              <span className="text-lg">{busy ? "Waiting for your passkey…" : "Create my pass"}</span>
              <span aria-hidden>→</span>
            </button>
            <button type="button" onClick={() => setMode("existing")} className="label mt-5 text-ink-2 link-line">
              I already have one
            </button>
          </form>
        ) : (
          <div className="mt-8" data-stagger>
            <button onClick={() => run(signIn)} disabled={busy} className="flex w-full items-center justify-between bg-ink px-5 py-4 text-paper disabled:opacity-40">
              <span className="text-lg">{busy ? "Waiting for your passkey…" : "Sign in with passkey"}</span>
              <span aria-hidden>→</span>
            </button>
            <button type="button" onClick={() => setMode("create")} className="label mt-5 text-ink-2 link-line">
              New here? Create a pass
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-5 border-l-2 border-signal pl-3 text-sm text-ink-2">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
