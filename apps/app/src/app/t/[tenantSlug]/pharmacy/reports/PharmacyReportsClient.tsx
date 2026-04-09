"use client";

import Link from "next/link";
import { useClientI18n } from "@/lib/client-i18n";

export function PharmacyReportsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-2xl font-semibold">{t("app.pharmacy.reports.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.pharmacy.reports.subtitle")}</div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/reports/standard`}>
          <div className="text-lg font-semibold text-gray-900">{t("app.pharmacy.reports.standard.title")}</div>
          <div className="mt-1 text-sm text-gray-700">{t("app.pharmacy.reports.standard.subtitle")}</div>
        </Link>
        <Link className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/reports/expiry`}>
          <div className="text-lg font-semibold text-gray-900">{t("app.pharmacy.reports.expiry.title")}</div>
          <div className="mt-1 text-sm text-gray-700">{t("app.pharmacy.reports.expiry.subtitle")}</div>
        </Link>
        <Link className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/reports/lot-trace`}>
          <div className="text-lg font-semibold text-gray-900">{t("app.pharmacy.reports.lotTrace.title")}</div>
          <div className="mt-1 text-sm text-gray-700">{t("app.pharmacy.reports.lotTrace.subtitle")}</div>
        </Link>
      </div>
    </div>
  );
}
