"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClientI18n } from "@/lib/client-i18n";

export function FuelTabs(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const pathname = usePathname();

  const base = `/t/${props.tenantSlug}/fuel`;

  const tabs = [
    { label: t("app.fuel.tab.overview"), href: base },
    { label: t("app.fuel.tab.tanks"), href: `${base}/tanks` },
    { label: t("app.fuel.tab.pumps"), href: `${base}/pumps` },
    { label: t("app.fuel.tab.shifts"), href: `${base}/shifts` },
    { label: t("app.fuel.tab.sales"), href: `${base}/sales` }
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
