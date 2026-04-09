"use client";

import { useEffect, useRef } from "react";

export function Modal(props: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const open = props.open;
  const onClose = props.onClose;
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      onPointerDown={(e) => {
        const panel = panelRef.current;
        const target = e.target as Node | null;
        if (!panel || !target) return;
        if (!panel.contains(target)) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative mx-auto flex min-h-dvh max-w-3xl items-center px-4 py-10">
        <div
          ref={panelRef}
          className="max-h-[calc(100dvh-5rem)] w-full overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="max-h-[calc(100dvh-5rem)] overflow-auto">{props.children}</div>
        </div>
      </div>
    </div>
  );
}
