// An F made of rows, the first one marked. `mono` draws it in the current text colour for use over any background.
const ROWS = [36, 12, 26, 12, 12];

export function Logo({ mono = false, className = "" }: { mono?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="Firstrow">
      {!mono && <rect width="64" height="64" rx="14" fill="#151412" />}
      {ROWS.map((width, i) => (
        <rect
          key={i}
          x={mono ? 6 : 14}
          y={(mono ? 6 : 13.5) + i * (mono ? 11 : 8)}
          width={mono ? width * 1.4 : width}
          height={mono ? 7 : 5}
          fill={mono ? "currentColor" : i === 0 ? "#e4492e" : "#eeeae3"}
        />
      ))}
    </svg>
  );
}
