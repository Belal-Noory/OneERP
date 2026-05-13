"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";

type NavItem =
  | { key: "overview" | "tanks" | "pumps" | "sales"; href: string; label: string; icon: ReactNode }
  | { key: "more"; label: string; icon: ReactNode };

export function FuelMobileNav(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const base = `/t/${props.tenantSlug}/fuel`;

  const hidden = useMemo(() => {
    if (!pathname) return false;
    return pathname.includes("/print") || pathname.includes("/statement");
  }, [pathname]);

  const items: NavItem[] = useMemo(
    () => [
      { key: "overview", href: `${base}`, label: t("app.fuel.tab.overview"), icon: <IconOverview /> },
      { key: "tanks", href: `${base}/tanks`, label: t("app.fuel.tab.tanks"), icon: <IconTank /> },
      { key: "pumps", href: `${base}/pumps`, label: t("app.fuel.tab.pumps"), icon: <IconPump /> },
      { key: "sales", href: `${base}/sales`, label: t("app.fuel.tab.sales"), icon: <IconSales /> },
      { key: "more", label: t("app.fuel.mobile.more"), icon: <IconMore /> }
    ],
    [base, t]
  );

  const activeKey = useMemo(() => {
    if (!pathname) return null;
    if (pathname === base) return "overview";
    if (pathname.startsWith(`${base}/tanks`)) return "tanks";
    if (pathname.startsWith(`${base}/pumps`)) return "pumps";
    if (pathname.startsWith(`${base}/sales`)) return "sales";
    if (pathname.startsWith(`${base}/shifts`)) return "more";
    if (pathname.startsWith(`${base}/credit`)) return "more";
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
          <div className="text-xl font-semibold">{t("app.fuel.mobile.more")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.fuel.mobile.more.subtitle")}</div>
          <div className="mt-6 grid grid-cols-2 gap-2">
            {[
              { href: base, label: t("app.fuel.tab.overview") },
              { href: `${base}/tanks`, label: t("app.fuel.tab.tanks") },
              { href: `${base}/pumps`, label: t("app.fuel.tab.pumps") },
              { href: `${base}/sales`, label: t("app.fuel.tab.sales") },
              { href: `${base}/shifts`, label: t("app.fuel.tab.shifts") },
              { href: `${base}/credit`, label: t("app.fuel.tab.credit") }
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

function IconOverview() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3h7v7H3V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 3h7v7h-7V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 14h7v7h-7v-7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3 14h7v7H3v-7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function IconTank() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 8c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7 5v3M17 5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M7 12h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconPump() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 4h8l2 6-2 6H8L6 10l2-6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 16v4M8 20h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconSales() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 6h18v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3 10h18M8 14h2M12 14h2M16 14h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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
