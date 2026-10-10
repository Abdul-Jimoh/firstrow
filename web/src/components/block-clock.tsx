"use client";

import { useEffect, useState } from "react";
import { publicClient } from "@/lib/chain";

// Monad's block height, ticking live. A quiet reminder that every check-in lands in under a second.
export function BlockClock({ className = "" }: { className?: string }) {
  const [block, setBlock] = useState<bigint | null>(null);

  useEffect(
    () =>
      publicClient.watchBlockNumber({
        emitOnBegin: true,
        pollingInterval: 1_000,
        onBlockNumber: setBlock,
      }),
    [],
  );

  return (
    <span className={`label tabular-nums ${className}`}>
      Monad → {block === null ? "…" : `#${block.toLocaleString("en-US")}`}
    </span>
  );
}
