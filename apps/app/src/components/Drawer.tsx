"use client";

import { useEffect, useRef } from "react";

export function Drawer(props: { open: boolean; onClose: () => void; side?: "left" | "right"; widthClassName?: string; children: React.ReactNode }) {
  const open = props.open;
  const onClose = props.onClose;
  const side = props.side ?? "left";
  const widthClassName = props.widthClassName ?? "w-[18rem] max-w-[85vw]";
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = getFocusable(panel);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === panel) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      try {
        previouslyFocusedRef.current?.focus();
      } catch {}
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = getFocusable(panel);
    const target = focusables[0] ?? panel;
    try {
      target.focus();
    } catch {}
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={[
          "absolute top-0 h-dvh overflow-hidden bg-white shadow-card",
          "border-gray-200",
          side === "left" ? "left-0 border-r" : "right-0 border-l",
          widthClassName
        ].join(" ")}
      >
        <div className="h-dvh overflow-auto">{props.children}</div>
      </div>
    </div>
  );
}

function getFocusable(root: HTMLElement): HTMLElement[] {
  const selectors = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])"
  ];
  return Array.from(root.querySelectorAll(selectors.join(","))).filter((el): el is HTMLElement => el instanceof HTMLElement && !el.hasAttribute("disabled"));
}
