"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useClientI18n } from "@/lib/client-i18n";

export function FullscreenToggle(props: { className?: string }) {
  const { t } = useClientI18n();
  const pathname = usePathname();

  const enabled = useMemo(() => {
    if (!pathname) return false;
    if (!pathname.startsWith("/t/")) return false;
    if (pathname.includes("/print")) return false;
    return true;
  }, [pathname]);

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [enabled]);

  if (!enabled) return null;

  return (
    <button
      type="button"
      className={["hidden h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-50 lg:inline-flex", props.className ?? ""].join(" ")}
      aria-label={isFullscreen ? t("common.button.exitFullscreen") : t("common.button.fullscreen")}
      onClick={async () => {
        try {
          if (!document.fullscreenEnabled) return;
          if (document.fullscreenElement) {
            await document.exitFullscreen();
            return;
          }
          await document.documentElement.requestFullscreen();
        } catch {
          return;
        }
      }}
    >
      <span aria-hidden="true">{isFullscreen ? <IconExit /> : <IconEnter />}</span>
    </button>
  );
}

function IconEnter() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 3H5a2 2 0 0 0-2 2v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 3h3a2 2 0 0 1 2 2v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 21H5a2 2 0 0 1-2-2v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconExit() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 3H5a2 2 0 0 0-2 2v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 3h4a2 2 0 0 1 2 2v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 21H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 21h4a2 2 0 0 0 2-2v-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 9l-3-3M6 6h3v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 9l3-3M18 6h-3v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 15l-3 3M6 18h3v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 15l3 3M18 18h-3v-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

