"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useId, useRef } from "react";
import { prefersReducedMotion } from "./motion";

const WIDTH = 1600;
const HEIGHT = 300;
const ROWS = 24;
const PITCH = HEIGHT / ROWS;
const THICKNESS = PITCH * 0.42;

// The wordmark drawn as rows of seats: each row is a horizontal slice of the word that can slide on its own.
export function RowMark({ word = "FIRSTROW", className = "" }: { word?: string; className?: string }) {
  const id = useId().replace(/:/g, "");
  const root = useRef<SVGSVGElement>(null);

  useGSAP(
    () => {
      const svg = root.current;
      if (!svg || prefersReducedMotion()) return;
      const rows = gsap.utils.toArray<SVGTextElement>("[data-row]", svg);

      gsap.from(rows, {
        x: (i) => (i % 2 ? WIDTH : -WIDTH) * 0.6,
        duration: 1.6,
        ease: "expo.out",
        stagger: { each: 0.025, from: "center" },
        scrollTrigger: { trigger: svg, start: "top 92%", once: true },
      });

      const setters = rows.map((row) => gsap.quickTo(row, "x", { duration: 0.9, ease: "power3.out" }));

      const onMove = (e: PointerEvent) => {
        const box = svg.getBoundingClientRect();
        const y = ((e.clientY - box.top) / box.height) * HEIGHT;
        const x = (e.clientX - box.left) / box.width;
        rows.forEach((_, i) => {
          const distance = Math.abs(i * PITCH + PITCH / 2 - y) / PITCH;
          const pull = Math.max(0, 1 - distance / 4);
          setters[i]((i % 2 ? 1 : -1) * pull * pull * 90 * (0.4 + x));
        });
      };
      const onLeave = () => setters.forEach((set) => set(0));

      svg.addEventListener("pointermove", onMove);
      svg.addEventListener("pointerleave", onLeave);
      return () => {
        svg.removeEventListener("pointermove", onMove);
        svg.removeEventListener("pointerleave", onLeave);
      };
    },
    { scope: root },
  );

  return (
    <svg
      ref={root}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={`block w-full select-none ${className}`}
      role="img"
      aria-label={word}
    >
      <defs>
        {Array.from({ length: ROWS }, (_, i) => (
          <clipPath key={i} id={`${id}-r${i}`}>
            <rect x={-WIDTH} y={i * PITCH + (PITCH - THICKNESS) / 2} width={WIDTH * 3} height={THICKNESS} />
          </clipPath>
        ))}
      </defs>
      {Array.from({ length: ROWS }, (_, i) => (
        <g key={i} clipPath={`url(#${id}-r${i})`}>
          <text
            data-row
            x={0}
            y={HEIGHT * 0.86}
            textLength={WIDTH}
            lengthAdjust="spacingAndGlyphs"
            fill="currentColor"
            style={{ fontFamily: "var(--font-inter-tight)", fontWeight: 800, fontSize: HEIGHT * 1.16, letterSpacing: "-0.04em" }}
          >
            {word}
          </text>
        </g>
      ))}
    </svg>
  );
}
