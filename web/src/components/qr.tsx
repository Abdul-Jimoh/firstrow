"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function QR({ value, className = "", label }: { value: string; className?: string; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#151412", light: "#00000000" } }).then(
      (s) => live && setSvg(s),
    );
    return () => {
      live = false;
    };
  }, [value]);

  return (
    <div
      role="img"
      aria-label={label}
      data-value={value}
      className={`aspect-square [&>svg]:h-full [&>svg]:w-full ${className}`}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
