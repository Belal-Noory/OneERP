"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";

type NavItem =
  | { key: "pos" | "orders" | "cash" | "products"; href: string; label: string; icon: ReactNode }
  | { key: "more"; label: string; icon: ReactNode };

export function ShopMobileNav(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const base = `/t/${props.tenantSlug}/shop`;

  const hidden = useMemo(() => {
    if (!pathname) return false;
    return pathname.includes("/print") || pathname.includes("/statement");
  }, [pathname]);

  const items: NavItem[] = useMemo(
    () => [
      { key: "pos", href: `${base}/pos`, label: t("app.shop.tab.pos"), icon: <IconPos /> },
      { key: "orders", href: `${base}/orders`, label: t("app.shop.tab.orders"), icon: <IconReceipt /> },
      { key: "cash", href: `${base}/cash`, label: t("app.shop.tab.cash"), icon: <IconCash /> },
      { key: "products", href: `${base}/products`, label: t("app.shop.tab.products"), icon: <IconBox /> },
      { key: "more", label: t("app.shop.mobile.more"), icon: <IconMore /> }
    ],
    [base, t]
  );

  const activeKey = useMemo(() => {
    if (!pathname) return null;
    if (pathname === base) return "more";
    if (pathname.startsWith(`${base}/pos`)) return "pos";
    if (pathname.startsWith(`${base}/orders`)) return "orders";
    if (pathname.startsWith(`${base}/cash`)) return "cash";
    if (pathname.startsWith(`${base}/products`)) return "products";
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
          <div className="text-xl font-semibold">{t("app.shop.mobile.more")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.shop.mobile.more.subtitle")}</div>
          <div className="mt-6 grid grid-cols-2 gap-2">
            {[
              { href: base, label: t("app.shop.tab.overview") },
              { href: `${base}/pos`, label: t("app.shop.tab.pos") },
              { href: `${base}/orders`, label: t("app.shop.tab.orders") },
              { href: `${base}/customers`, label: t("app.shop.tab.customers") },
              { href: `${base}/purchases`, label: t("app.shop.tab.purchases") },
              { href: `${base}/purchase-orders`, label: t("app.shop.tab.purchaseOrders") },
              { href: `${base}/suppliers`, label: t("app.shop.tab.suppliers") },
              { href: `${base}/products`, label: t("app.shop.tab.products") },
              { href: `${base}/labels`, label: t("app.shop.tab.labels") },
              { href: `${base}/inventory`, label: t("app.shop.tab.inventory") },
              { href: `${base}/cash`, label: t("app.shop.tab.cash") },
              { href: `${base}/reports`, label: t("app.shop.tab.reports") }
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

function IconPos() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 4h10a2 2 0 0 1 2 2v4H5V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M5 10h14v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 14h2M12 14h4M8 17h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconReceipt() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M7 3h10a2 2 0 0 1 2 2v16l-2-1-2 1-2-1-2 1-2-1-2 1-2-1-2 1V5a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconBox() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2.5 3.5 7.5v9L12 21.5l8.5-5v-9L12 2.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7.5 10.2 12 12.8l4.5-2.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 12.8v5.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconCash() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16v10H4V7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7 10h10M7 14h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M16 14a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
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
