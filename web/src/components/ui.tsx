"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";

// Colour carries meaning across the app: `signal` is the one main action on a screen, `go` is good or live,
// `warn` needs attention, `stop` is blocked or destructive. Everything else stays ink on paper.

type Variant = "primary" | "ink" | "line" | "paper" | "danger";

const variants: Record<Variant, string> = {
  primary: "bg-signal text-ink hover:brightness-95",
  ink: "bg-ink text-paper hover:bg-ink-2",
  line: "border border-ink text-ink hover:bg-ink hover:text-paper",
  // For use on ink backgrounds.
  paper: "border border-paper text-paper hover:bg-paper hover:text-ink",
  danger: "border border-stop text-stop hover:bg-stop hover:text-paper",
};

const base = "transition-[background-color,color,filter,opacity] duration-200 disabled:pointer-events-none disabled:opacity-40";

// The large call to action: full sentence label, arrow on the right.
export function Button({
  children,
  variant = "primary",
  busy,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`flex items-center justify-between gap-6 px-5 py-4 text-left font-medium ${base} ${variants[variant]} ${className}`}
    >
      {children}
      <span aria-hidden className={busy ? "animate-pulse" : ""}>
        {busy ? "···" : "→"}
      </span>
    </button>
  );
}

const small = "label inline-flex items-center justify-center gap-2 px-4 py-2.5 whitespace-nowrap";

// A compact button for secondary actions that still has to look pressable.
export function SmallButton({
  children,
  variant = "line",
  busy,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button {...props} disabled={props.disabled || busy} className={`${small} ${base} ${variants[variant]} ${className}`}>
      {busy ? "···" : children}
    </button>
  );
}

export function SmallLink({ children, variant = "line", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return (
    <Link {...props} className={`${small} ${base} ${variants[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export type Tone = "go" | "warn" | "stop" | "done" | "ink";

const pillTones: Record<Tone, string> = {
  go: "bg-go-soft text-go",
  warn: "bg-warn-soft text-warn",
  stop: "bg-stop-soft text-stop",
  done: "bg-stone/50 text-ink-2",
  ink: "bg-ink text-paper",
};

export function Pill({ tone, children, dot = true }: { tone: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={`label inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium whitespace-nowrap ${pillTones[tone]}`}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const noticeTones = {
  info: "border-ink/30 bg-paper-2 text-ink-2",
  ok: "border-go bg-go-soft text-go",
  warn: "border-warn bg-warn-soft text-warn",
  error: "border-stop bg-stop-soft text-stop",
};

export function Notice({ tone = "info", children }: { tone?: keyof typeof noticeTones; children: ReactNode }) {
  return (
    <p role={tone === "error" ? "alert" : "status"} className={`border-l-4 px-4 py-3 text-sm ${noticeTones[tone]}`}>
      {children}
    </p>
  );
}

// A tinted block that groups related controls.
export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`bg-paper-2 p-5 sm:p-6 ${className}`}>
      {title && <h2 className="headline text-2xl">{title}</h2>}
      {children}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label text-ink-2">{label}</span>
      <div className="mt-2">{children}</div>
      {hint && <span className="mt-1.5 block text-xs text-mute">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full border-b border-ink/40 bg-transparent pb-2 text-lg outline-none transition-colors focus:border-ink placeholder:text-stone";

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "go" }) {
  return (
    <div className={`border-t-2 pt-3 ${tone === "go" ? "border-go" : "border-ink"}`}>
      <p className="label text-ink-2">{label}</p>
      <p className={`headline mt-2 text-3xl tabular-nums ${tone === "go" ? "text-go" : ""}`}>{value}</p>
    </div>
  );
}
