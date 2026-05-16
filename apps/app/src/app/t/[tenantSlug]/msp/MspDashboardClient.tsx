"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { ModuleTrainingSection } from "@/components/ModuleTrainingSection";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };
type DashboardResponse = { data: { kpis: { customers: number; partners: number; branches: number } } };

export function MspDashboardClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [kpis, setKpis] = useState<DashboardResponse["data"]["kpis"]>({ customers: 0, partners: 0, branches: 0 });

  const base = useMemo(() => `/t/${props.tenantSlug}/msp`, [props.tenantSlug]);

  useEffect(() => {
    let cancelled = false;
    async function loadTenant() {
      setLoading(true);
      setErrorKey(null);
      try {
        const meRes = await apiFetch("/api/me", { cache: "no-store" });
        if (!meRes.ok) {
          setErrorKey("errors.unauthenticated");
          return;
        }
        const me = (await meRes.json()) as MeResponse;
        const membership = me.data.memberships.find((m) => m.tenantSlug === props.tenantSlug) ?? null;
        if (!membership) {
          setErrorKey("errors.tenantAccessDenied");
          return;
        }
        if (!cancelled) setTenantId(membership.tenantId);
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadTenant();
    return () => {
      cancelled = true;
    };
  }, [props.tenantSlug]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const res = await apiFetch("/api/msp/dashboard", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as DashboardResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        if (!cancelled) setKpis((json as DashboardResponse).data.kpis);
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold">{t("app.msp.dashboard.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.msp.dashboard.subtitle")}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}/exchange`} className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800">
              {t("app.msp.tab.exchange")}
            </Link>
            <Link href={`${base}/hawala`} className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50">
              {t("app.msp.tab.hawala")}
            </Link>
            <Link href={`${base}/reports`} className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50">
              {t("app.msp.tab.reports")}
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <KpiCard label={t("app.msp.kpi.customers")} value={kpis.customers} loading={loading} />
          <KpiCard label={t("app.msp.kpi.partners")} value={kpis.partners} loading={loading} />
          <KpiCard label={t("app.msp.kpi.branches")} value={kpis.branches} loading={loading} />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-sm font-semibold text-gray-900">{t("app.msp.quick.title")}</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <QuickLink href={`${base}/customers`} label={t("app.msp.tab.customers")} />
          <QuickLink href={`${base}/partners`} label={t("app.msp.tab.partners")} />
          <QuickLink href={`${base}/branches`} label={t("app.msp.tab.branches")} />
          <QuickLink href={`${base}/ledger`} label={t("app.msp.tab.ledger")} />
          <QuickLink href={`${base}/cash`} label={t("app.msp.tab.cash")} />
          <QuickLink href={`${base}/settlements`} label={t("app.msp.tab.settlements")} />
        </div>
      </div>

      <ModuleTrainingSection moduleId="msp" />
    </div>
  );
}

function KpiCard(props: { label: string; value: number; loading: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-600">{props.label}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">{props.loading ? "…" : props.value}</div>
    </div>
  );
}

function QuickLink(props: { href: string; label: string }) {
  return (
    <Link href={props.href} className="inline-flex h-11 items-center justify-between rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50">
      <span className="truncate">{props.label}</span>
      <span className="text-gray-400">→</span>
    </Link>
  );
}
