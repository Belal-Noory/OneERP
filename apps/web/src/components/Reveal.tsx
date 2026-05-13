"use client";

import { useEffect, useRef, useState } from "react";

export function Reveal(props: { children: React.ReactNode; className?: string; delayMs?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const delayMs = props.delayMs ?? 0;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { root: null, threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={["mkt-reveal", visible ? "is-visible" : "", props.className ?? ""].filter(Boolean).join(" ")}
      style={delayMs ? ({ transitionDelay: `${delayMs}ms` } as React.CSSProperties) : undefined}
    >
      {props.children}
    </div>
  );
}

