"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { useClientI18n } from "@/lib/client-i18n";

type NavItem =
  | { key: "dashboard" | "exchange" | "hawala" | "ledger"; href: string; label: string; icon: ReactNode }
  | { key: "more"; label: string; icon: ReactNode };

export function MspMobileNav(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const base = `/t/${props.tenantSlug}/msp`;

  const hidden = useMemo(() => {
    if (!pathname) return false;
    return pathname.includes("/print") || pathname.includes("/statement");
  }, [pathname]);

  const items: NavItem[] = useMemo(
    () => [
      { key: "dashboard", href: `${base}`, label: t("app.msp.tab.dashboard"), icon: <IconDashboard /> },
      { key: "exchange", href: `${base}/exchange`, label: t("app.msp.tab.exchange"), icon: <IconExchange /> },
      { key: "hawala", href: `${base}/hawala`, label: t("app.msp.tab.hawala"), icon: <IconTransfer /> },
      { key: "ledger", href: `${base}/ledger`, label: t("app.msp.tab.ledger"), icon: <IconLedger /> },
      { key: "more", label: t("app.msp.mobile.more"), icon: <IconMore /> }
    ],
    [base, t]
  );

  const activeKey = useMemo(() => {
    if (!pathname) return null;
    if (pathname === base) return "dashboard";
    if (pathname.startsWith(`${base}/exchange`)) return "exchange";
    if (pathname.startsWith(`${base}/hawala`)) return "hawala";
    if (pathname.startsWith(`${base}/ledger`)) return "ledger";
    return "more";
  }, [base, pathname]);

  if (hidden) return null;

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/90 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-stretch gap-2 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
          {items.map((it) => {
            const active = it.key === activeKey;
            const className = [
              "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs",
              active ? "bg-primary-50 text-primary-700" : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
            ].join(" ");
            const iconClass = active ? "text-primary-700" : "text-gray-500";
            if (it.key === "more") {
              return (
                <button
                  key={it.key}
                  type="button"
                  className={className}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMoreOpen(true)}
                >
                  <span className={iconClass}>{it.icon}</span>
                  <span className="w-full truncate text-center font-medium">{it.label}</span>
                </button>
              );
            }
            return (
              <Link key={it.key} href={it.href} className={className} aria-current={active ? "page" : undefined}>
                <span className={iconClass}>{it.icon}</span>
                <span className="w-full truncate text-center font-medium">{it.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.msp.mobile.more")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.msp.mobile.more.subtitle")}</div>
          <div className="mt-6 grid grid-cols-2 gap-2">
            {[
              { href: base, label: t("app.msp.tab.dashboard") },
              { href: `${base}/exchange`, label: t("app.msp.tab.exchange") },
              { href: `${base}/hawala`, label: t("app.msp.tab.hawala") },
              { href: `${base}/customers`, label: t("app.msp.tab.customers") },
              { href: `${base}/partners`, label: t("app.msp.tab.partners") },
              { href: `${base}/branches`, label: t("app.msp.tab.branches") },
              { href: `${base}/ledger`, label: t("app.msp.tab.ledger") },
              { href: `${base}/cash`, label: t("app.msp.tab.cash") },
              { href: `${base}/settlements`, label: t("app.msp.tab.settlements") },
              { href: `${base}/reports`, label: t("app.msp.tab.reports") },
              { href: `${base}/audit`, label: t("app.msp.tab.audit") },
              { href: `${base}/settings`, label: t("app.msp.tab.settings") }
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                onClick={() => setMoreOpen(false)}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}

function IconDashboard() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3h7v7H3V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 3h7v7h-7V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 14h7v7h-7v-7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3 14h7v7H3v-7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function IconExchange() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7h11M14 4l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 17H6M10 20l-3-3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconTransfer() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14 6l6 6-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconLedger() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 4h12v16H6V4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconMore() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h0.01M12 12h0.01M19 12h0.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

