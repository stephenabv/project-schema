"use client";

import { useEffect, useRef, useState } from "react";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Counts up smoothly to `value` (the "running earnings" effect). Jumps
 * straight to the value when the user prefers reduced motion.
 */
export function AnimatedNumber({
  value,
  format,
  durationMs = 450,
  className,
}: {
  value: number;
  format: (value: number) => string;
  durationMs?: number;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const from = fromRef.current;
    fromRef.current = value;
    if (from === value) return;

    // With reduced motion the first frame lands directly on the final value.
    const duration = prefersReducedMotion() ? 0 : durationMs;
    let frame = 0;
    const start = performance.now();
    const step = (now: number) => {
      const progress = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return <span className={`tabular-nums ${className ?? ""}`}>{format(display)}</span>;
}
