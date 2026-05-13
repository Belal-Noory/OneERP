"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClientI18n } from "@/lib/client-i18n";

export function MspTabs(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const pathname = usePathname();

  const base = `/t/${props.tenantSlug}/msp`;

  const tabs = [
    { label: t("app.msp.tab.dashboard"), href: base },
    { label: t("app.msp.tab.exchange"), href: `${base}/exchange` },
    { label: t("app.msp.tab.hawala"), href: `${base}/hawala` },
    { label: t("app.msp.tab.customers"), href: `${base}/customers` },
    { label: t("app.msp.tab.partners"), href: `${base}/partners` },
    { label: t("app.msp.tab.branches"), href: `${base}/branches` },
    { label: t("app.msp.tab.ledger"), href: `${base}/ledger` },
    { label: t("app.msp.tab.cash"), href: `${base}/cash` },
    { label: t("app.msp.tab.settlements"), href: `${base}/settlements` },
    { label: t("app.msp.tab.reports"), href: `${base}/reports` },
    { label: t("app.msp.tab.audit"), href: `${base}/audit` },
    { label: t("app.msp.tab.settings"), href: `${base}/settings` }
  ];

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {tabs.map((tab) => {
        const active = pathname === tab.href || (pathname.startsWith(tab.href + "/") && tab.href !== base);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition-colors ${
              active ? "bg-primary-50 text-primary-700" : "bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

