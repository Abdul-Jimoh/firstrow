"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  children,
  variant = "ink",
  busy,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "ink" | "line" | "paper"; busy?: boolean }) {
  const styles = {
    ink: "bg-ink text-paper",
    paper: "bg-paper text-ink",
    line: "border border-current",
  }[variant];
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`flex items-center justify-between gap-6 px-5 py-4 text-left transition-opacity disabled:opacity-40 ${styles} ${className}`}
    >
      {children}
      <span aria-hidden className={busy ? "animate-pulse" : ""}>
        {busy ? "···" : "→"}
      </span>
    </button>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children: ReactNode }) {
  const border = { info: "border-ink/30", error: "border-signal", ok: "border-ink" }[tone];
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`border-l-2 pl-3 text-sm text-ink-2 ${border}`}>
      {children}
    </p>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label text-mute">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <span className="mt-1.5 block text-xs text-mute">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full border-b border-ink/40 bg-transparent pb-2 text-lg outline-none transition-colors focus:border-ink placeholder:text-stone";

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="border-t border-ink pt-3">
      <p className="label text-mute">{label}</p>
      <p className="headline mt-2 text-3xl tabular-nums">{value}</p>
    </div>
  );
}
