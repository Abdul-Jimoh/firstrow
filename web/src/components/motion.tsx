"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import Lenis from "lenis";
import { createContext, useContext, useEffect, useRef, type ReactNode, type RefObject } from "react";

gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);

export const EASE = "expo.out";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const LenisContext = createContext<RefObject<Lenis | null> | null>(null);
export const useLenis = () => useContext(LenisContext);

export function SmoothScroll({ children }: { children: ReactNode }) {
  const lenis = useRef<Lenis | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const instance = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9 });
    instance.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => instance.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    lenis.current = instance;
    return () => {
      gsap.ticker.remove(tick);
      instance.destroy();
      lenis.current = null;
    };
  }, []);

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>;
}

type RevealProps = {
  children: ReactNode;
  className?: string;
  as?: "div" | "h1" | "h2" | "h3" | "p" | "span";
  delay?: number;
  // Split into lines that rise from a mask, for headlines.
  lines?: boolean;
  // Animate on mount instead of when scrolled into view.
  immediate?: boolean;
};

export function Reveal({ children, className, as: Tag = "div", delay = 0, lines, immediate }: RevealProps) {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el || prefersReducedMotion()) return;
      const trigger = immediate ? undefined : { trigger: el, start: "top 88%", once: true };

      if (lines) {
        SplitText.create(el, {
          type: "lines",
          mask: "lines",
          autoSplit: true,
          onSplit: (split) => {
            // Room for descenders and overhangs, which the line masks would otherwise clip.
            gsap.set(split.masks, { paddingBottom: "0.16em", marginBottom: "-0.16em", paddingInline: "0.08em", marginInline: "-0.08em" });
            return gsap.from(split.lines, {
              yPercent: 110,
              duration: 1.2,
              ease: EASE,
              stagger: 0.08,
              delay,
              scrollTrigger: trigger,
            });
          },
        });
        return;
      }

      gsap.from(el, { y: 32, autoAlpha: 0, duration: 1.1, ease: EASE, delay, scrollTrigger: trigger });
    },
    { scope: ref },
  );

  return (
    // @ts-expect-error polymorphic ref
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
