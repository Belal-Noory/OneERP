"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type Summary = {
  revenue: string;
  otherIncome: string;
  expenses: string;
  profit: string;
  invoicesCount: number;
  pendingInvoicesCount: number;
  pendingAmount: string;
};

type SummaryResponse = { data: Summary };

type MonthlyResponse = {
  data: {
    year: number;
    items: Array<{ month: string; revenue: string; otherIncome: string; expenses: string; profit: string }>;
    totals: { revenue: string; otherIncome: string; expenses: string; profit: string };
  };
};

function toYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthStartYmd(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return toYmd(d);
}

export function PrintPressReportsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const now = useMemo(() => new Date(), []);
  const [from, setFrom] = useState(monthStartYmd(now));
  const [to, setTo] = useState(toYmd(now));
  const [year, setYear] = useState(() => String(new Date().getFullYear()));

  const [summary, setSummary] = useState<Summary | null>(null);
  const [monthly, setMonthly] = useState<MonthlyResponse["data"] | null>(null);
  const [exporting, setExporting] = useState(false);

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

  const loadSummary = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await apiFetch(`/api/printpress/reports/summary?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as SummaryResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      setSummary((json as SummaryResponse).data);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [from, tenantId, to]);

  const loadMonthly = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const params = new URLSearchParams();
      if (year.trim()) params.set("year", year.trim());
      const res = await apiFetch(`/api/printpress/reports/monthly?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as MonthlyResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      setMonthly((json as MonthlyResponse).data);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [tenantId, year]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    void loadMonthly();
  }, [loadMonthly]);

  async function exportCsv() {
    if (!tenantId) return;
    setExporting(true);
    setErrorKey(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await apiFetch(`/api/printpress/reports/export?${params.toString()}`, { headers: { "X-Tenant-Id": tenantId } });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `printpress-report_${from || "all"}_${to || "all"}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setExporting(false);
    }
  }

  const cards = useMemo(() => {
    const s = summary;
    if (!s) return [];
    return [
      { label: t("app.printpress.reports.card.revenue"), value: s.revenue },
      { label: t("app.printpress.reports.card.otherIncome"), value: s.otherIncome },
      { label: t("app.printpress.reports.card.expenses"), value: s.expenses },
      { label: t("app.printpress.reports.card.profit"), value: s.profit },
      { label: t("app.printpress.reports.card.pendingAmount"), value: s.pendingAmount },
      { label: t("app.printpress.reports.card.pendingInvoices"), value: String(s.pendingInvoicesCount) },
      { label: t("app.printpress.reports.card.invoicesCount"), value: String(s.invoicesCount) }
    ];
  }, [summary, t]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.printpress.reports.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.printpress.reports.subtitle")}</div>
          </div>
          <button
            type="button"
            disabled={!tenantId || exporting}
            onClick={exportCsv}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
          >
            {exporting ? t("common.loading") : t("app.printpress.reports.action.export")}
          </button>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.reports.filter.from")}</label>
            <input
              type="date"
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.reports.filter.to")}</label>
            <input
              type="date"
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              disabled={!tenantId || loading}
              onClick={async () => {
                await loadSummary();
                await loadMonthly();
              }}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
            >
              {loading ? t("common.loading") : t("app.printpress.reports.action.apply")}
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.reports.filter.year")}</label>
            <input
              type="number"
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              min={2000}
              max={2100}
            />
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
            <div className="text-sm text-gray-600">{c.label}</div>
            <div className="mt-2 text-2xl font-semibold text-gray-900">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-100 px-6 py-4">
          <div className="text-sm font-medium text-gray-900">{t("app.printpress.reports.monthly.title")}</div>
          <div className="mt-1 text-xs text-gray-600">
            {t("app.printpress.reports.monthly.year")}: {monthly?.year ?? year}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[840px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.reports.monthly.table.month")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.printpress.reports.monthly.table.revenue")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.printpress.reports.monthly.table.otherIncome")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.printpress.reports.monthly.table.expenses")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.printpress.reports.monthly.table.profit")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={5}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : (monthly?.items ?? []).length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={5}>
                    {t("app.printpress.placeholder")}
                  </td>
                </tr>
              ) : (
                (monthly?.items ?? []).map((m) => (
                  <tr key={m.month}>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{m.month}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-700 tabular">{m.revenue}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-700 tabular">{m.otherIncome}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-700 tabular">{m.expenses}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right font-medium text-gray-900 tabular">{m.profit}</td>
                  </tr>
                ))
              )}
            </tbody>
            {monthly?.totals ? (
              <tfoot>
                <tr>
                  <td className="border-t border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900">{t("app.printpress.reports.monthly.table.total")}</td>
                  <td className="border-t border-gray-200 px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular">{monthly.totals.revenue}</td>
                  <td className="border-t border-gray-200 px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular">{monthly.totals.otherIncome}</td>
                  <td className="border-t border-gray-200 px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular">{monthly.totals.expenses}</td>
                  <td className="border-t border-gray-200 px-4 py-3 text-right text-sm font-semibold text-gray-900 tabular">{monthly.totals.profit}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </div>
    </div>
  );
}
