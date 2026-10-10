import { useMemo } from "react";

const GROUNDS = ["#e6dcc8", "#d9c7a7", "#cfc6dc", "#bfc5a4", "#e3b49b", "#d6d1c7", "#ecd18a", "#c9d3d1"];
const W = 600;
const H = 800;

function seeded(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

type Shape = "sun" | "arch" | "stage" | "stair";

// The span [from, to] of row y that falls inside the shape, or null.
function span(shape: Shape, y: number, rand: () => number, p: { cx: number; cy: number; r: number }): [number, number] | null {
  switch (shape) {
    case "sun": {
      const d = Math.abs(y - p.cy);
      if (d > p.r) return null;
      const half = Math.sqrt(p.r * p.r - d * d);
      return [p.cx - half, p.cx + half];
    }
    case "arch": {
      if (y < p.cy - p.r) return null;
      if (y < p.cy) {
        const d = p.cy - y;
        const half = Math.sqrt(p.r * p.r - d * d);
        return [p.cx - half, p.cx + half];
      }
      return [p.cx - p.r, p.cx + p.r];
    }
    case "stage": {
      if (y < p.cy - p.r * 0.2) return null;
      const t = (y - (p.cy - p.r * 0.2)) / (H - p.cy);
      const half = p.r * (0.5 + t * 1.4);
      return [p.cx - half, p.cx + half];
    }
    case "stair": {
      if (y < p.cy - p.r) return null;
      const step = Math.floor((y - (p.cy - p.r)) / 64);
      return [W - 120 - step * 70 - rand() * 4, W];
    }
  }
}

export function Poster({ seed, title, className = "" }: { seed: string; title?: string; className?: string }) {
  const art = useMemo(() => {
    const rand = seeded(seed);
    const ground = GROUNDS[Math.floor(rand() * GROUNDS.length)];
    const shape = (["sun", "arch", "stage", "stair"] as const)[Math.floor(rand() * 4)];
    const pitch = 12 + Math.floor(rand() * 8);
    const thickness = pitch * (0.35 + rand() * 0.25);
    const p = { cx: 160 + rand() * 280, cy: 300 + rand() * 260, r: 140 + rand() * 120 };
    const glitch = 0.12 + rand() * 0.2;

    const rows: { y: number; x1: number; x2: number }[] = [];
    for (let y = pitch; y < H; y += pitch) {
      const s = span(shape, y, rand, p);
      if (!s) continue;
      const shift = rand() < glitch ? (rand() - 0.5) * 120 : 0;
      rows.push({ y, x1: Math.max(0, s[0] + shift), x2: Math.min(W, s[1] + shift) });
    }
    return { ground, rows, thickness, number: String(Math.floor(rand() * 900) + 100) };
  }, [seed]);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`block h-auto w-full ${className}`} role="img" aria-label={title ? `Poster for ${title}` : "Event poster"}>
      <rect width={W} height={H} fill={art.ground} />
      {art.rows.map((r) => (
        <rect key={r.y} x={r.x1} y={r.y - art.thickness / 2} width={Math.max(0, r.x2 - r.x1)} height={art.thickness} fill="#151412" />
      ))}
      {title && (
        <foreignObject x={36} y={36} width={W - 72} height={300}>
          <p className="display text-[64px] text-ink" style={{ lineHeight: 0.9 }}>
            {title}
          </p>
        </foreignObject>
      )}
      <rect x={24} y={H - 66} width={250} height={42} fill={art.ground} />
      <text x={36} y={H - 38} className="label" fill="#151412" style={{ fontSize: 18 }}>
        FIRSTROW / NO. {art.number}
      </text>
    </svg>
  );
}
