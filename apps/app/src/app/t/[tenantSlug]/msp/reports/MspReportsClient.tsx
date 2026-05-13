"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type SummaryResponse = {
  data: {
    from: string;
    to: string;
    exchange: Array<{ type: string; tickets: number; quoteAmount: string; baseAmount: string; feeBase: string; totalBase: string }>;
    hawala: Array<{ status: string; transfers: number; amount: string; fee: string; total: string }>;
    cash: Array<{ currencyCode: string; cashIn: string; cashOut: string; balance: string }>;
    settlements: Array<{ currencyCode: string; direction: string; count: number; amount: string }>;
  };
};

type FxPositionsResponse = {
  data: {
    items: Array<{
      currencyCode: string;
      cash: string;
      bank: string;
      cashBank: string;
      customer: string;
      partner: string;
      system: string;
      netOwned: string;
    }>;
  };
};

type FxProfitResponse = {
  data: {
    from: string;
    to: string;
    totalsByBase: Array<{ baseCode: string; tickets: number; ticketsWithRate: number; feeBase: string; spreadBaseEstimated: string; profitEstimated: string }>;
    items: Array<{
      baseCode: string;
      quoteCode: string;
      type: string;
      tickets: number;
      ticketsWithRate: number;
      quoteAmount: string;
      baseAmount: string;
      feeBase: string;
      totalBase: string;
      spreadBaseEstimated: string;
      profitEstimated: string;
    }>;
  };
};

type FxRealizedPnlResponse = {
  data: {
    from: string;
    to: string;
    totalsByValuation: Array<{ valuationCurrencyCode: string; tickets: number; fee: string; costOfSold: string; profit: string }>;
    items: Array<{
      valuationCurrencyCode: string;
      quoteCode: string;
      tickets: number;
      quoteAmount: string;
      baseAmount: string;
      fee: string;
      proceeds: string;
      costOfSold: string;
      profit: string;
    }>;
  };
};

type FxUnrealizedPnlResponse = {
  data: {
    asOfDate: string;
    items: Array<{
      currencyCode: string;
      valuationCurrencyCode: string;
      qty: string;
      totalCostValuation: string;
      avgCostValuation: string;
      buyRate: string | null;
      sellRate: string | null;
      rateDate: string | null;
      marketRate: string | null;
      marketValue: string | null;
      unrealized: string | null;
    }>;
  };
};

type AmlAlert = {
  id: string;
  createdAt: string;
  status: "open" | "closed" | string;
  ruleCode: string;
  severity: "low" | "medium" | "high" | string;
  title: string;
  sourceType: string;
  sourceId: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  currencyCode: string | null;
  amount: string | null;
  closedAt: string | null;
  closeNote: string | null;
};

type AmlAlertsResponse = { data: { items: AmlAlert[]; page: number; pageSize: number; total: number } };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function MspReportsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return isoDate(d);
  });
  const [to, setTo] = useState(() => isoDate(new Date()));

  const [summary, setSummary] = useState<SummaryResponse["data"] | null>(null);
  const [fxPositions, setFxPositions] = useState<FxPositionsResponse["data"] | null>(null);
  const [fxProfit, setFxProfit] = useState<FxProfitResponse["data"] | null>(null);
  const [fxRealized, setFxRealized] = useState<FxRealizedPnlResponse["data"] | null>(null);
  const [fxUnrealized, setFxUnrealized] = useState<FxUnrealizedPnlResponse["data"] | null>(null);

  const [amlStatus, setAmlStatus] = useState<"open" | "all" | "closed">("open");
  const [amlAlerts, setAmlAlerts] = useState<AmlAlert[]>([]);

  const loadTenant = useCallback(async () => {
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
      setTenantId(membership.tenantId);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [props.tenantSlug]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const p = new URLSearchParams();
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      const pAml = new URLSearchParams();
      if (from) pAml.set("from", from);
      if (to) pAml.set("to", to);
      pAml.set("status", amlStatus);
      pAml.set("page", "1");
      pAml.set("pageSize", "200");

      const [sumRes, posRes, profitRes, realizedRes, unrealizedRes, amlRes] = await Promise.all([
        apiFetch(`/api/msp/reports/summary?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/msp/fx/positions", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch(`/api/msp/fx/profit?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch(`/api/msp/fx/pnl/realized?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch(`/api/msp/fx/pnl/unrealized?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch(`/api/msp/aml/alerts?${pAml.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
      ]);

      const sumJson = (await sumRes.json()) as SummaryResponse | { error?: { message_key?: string } };
      if (!sumRes.ok) {
        setErrorKey((sumJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const posJson = (await posRes.json()) as FxPositionsResponse | { error?: { message_key?: string } };
      if (!posRes.ok) {
        setErrorKey((posJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const profitJson = (await profitRes.json()) as FxProfitResponse | { error?: { message_key?: string } };
      if (!profitRes.ok) {
        setErrorKey((profitJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const realizedJson = (await realizedRes.json()) as FxRealizedPnlResponse | { error?: { message_key?: string } };
      if (!realizedRes.ok) {
        setErrorKey((realizedJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const unrealizedJson = (await unrealizedRes.json()) as FxUnrealizedPnlResponse | { error?: { message_key?: string } };
      if (!unrealizedRes.ok) {
        setErrorKey((unrealizedJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const amlJson = (await amlRes.json()) as AmlAlertsResponse | { error?: { message_key?: string } };
      if (!amlRes.ok) {
        setErrorKey((amlJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }

      setSummary((sumJson as SummaryResponse).data);
      setFxPositions((posJson as FxPositionsResponse).data);
      setFxProfit((profitJson as FxProfitResponse).data);
      setFxRealized((realizedJson as FxRealizedPnlResponse).data);
      setFxUnrealized((unrealizedJson as FxUnrealizedPnlResponse).data);
      setAmlAlerts(((amlJson as AmlAlertsResponse).data.items ?? []).slice(0, 200));
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [amlStatus, from, tenantId, to]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  useEffect(() => {
    void load();
  }, [load]);

  const canExport = useMemo(() => !exporting && !!summary && !!tenantId, [exporting, summary, tenantId]);

  const closeAlert = useCallback(
    async (id: string) => {
      if (!tenantId) return;
      const note = window.prompt(t("app.msp.aml.close.prompt")) ?? "";
      setErrorKey(null);
      try {
        const res = await apiFetch(`/api/msp/aml/alerts/${encodeURIComponent(id)}/close`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
          body: JSON.stringify({ note: note.trim() || undefined })
        });
        const json = (await res.json()) as { data?: { success: boolean }; error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey(json.error?.message_key ?? "errors.internal");
          return;
        }
        await load();
      } catch {
        setErrorKey("errors.internal");
      }
    },
    [load, t, tenantId]
  );

  const exportXlsx = async () => {
    if (!canExport || !tenantId || !summary) return;
    setExporting(true);
    setErrorKey(null);
    try {
      await apiFetch("/api/msp/reports/export-log", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({ format: "xlsx", from: summary.from, to: summary.to })
      });

      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      const meta = XLSX.utils.aoa_to_sheet([
        [t("app.msp.reports.export.meta.range"), `${summary.from} → ${summary.to}`],
        [t("app.msp.reports.export.meta.exportedAt"), new Date().toISOString()]
      ]);
      XLSX.utils.book_append_sheet(wb, meta, t("app.msp.reports.export.sheet.meta"));

      const exchange = XLSX.utils.aoa_to_sheet([
        [t("app.msp.reports.exchange.type"), t("app.msp.reports.exchange.tickets"), t("app.msp.reports.exchange.quoteAmount"), t("app.msp.reports.exchange.baseAmount"), t("app.msp.reports.exchange.feeBase"), t("app.msp.reports.exchange.totalBase")],
        ...summary.exchange.map((r) => [r.type, r.tickets, r.quoteAmount, r.baseAmount, r.feeBase, r.totalBase])
      ]);
      XLSX.utils.book_append_sheet(wb, exchange, t("app.msp.reports.export.sheet.exchange"));

      const hawala = XLSX.utils.aoa_to_sheet([
        [t("app.msp.reports.hawala.status"), t("app.msp.reports.hawala.transfers"), t("app.msp.reports.hawala.amount"), t("app.msp.reports.hawala.fee"), t("app.msp.reports.hawala.total")],
        ...summary.hawala.map((r) => [r.status, r.transfers, r.amount, r.fee, r.total])
      ]);
      XLSX.utils.book_append_sheet(wb, hawala, t("app.msp.reports.export.sheet.hawala"));

      const cash = XLSX.utils.aoa_to_sheet([
        [t("app.msp.reports.cash.currency"), t("app.msp.reports.cash.in"), t("app.msp.reports.cash.out"), t("app.msp.reports.cash.balance")],
        ...summary.cash.map((r) => [r.currencyCode, r.cashIn, r.cashOut, r.balance])
      ]);
      XLSX.utils.book_append_sheet(wb, cash, t("app.msp.reports.export.sheet.cash"));

      const settlements = XLSX.utils.aoa_to_sheet([
        [t("app.msp.reports.settlements.currency"), t("app.msp.reports.settlements.direction"), t("app.msp.reports.settlements.count"), t("app.msp.reports.settlements.amount")],
        ...summary.settlements.map((r) => [r.currencyCode, r.direction, r.count, r.amount])
      ]);
      XLSX.utils.book_append_sheet(wb, settlements, t("app.msp.reports.export.sheet.settlements"));

      const fxPositionsSheet = XLSX.utils.aoa_to_sheet([
        [
          t("app.msp.reports.fxPositions.currency"),
          t("app.msp.reports.fxPositions.cashBank"),
          t("app.msp.reports.fxPositions.cash"),
          t("app.msp.reports.fxPositions.bank"),
          t("app.msp.reports.fxPositions.customer"),
          t("app.msp.reports.fxPositions.partner"),
          t("app.msp.reports.fxPositions.netOwned")
        ],
        ...(fxPositions?.items ?? []).map((r) => [r.currencyCode, r.cashBank, r.cash, r.bank, r.customer, r.partner, r.netOwned])
      ]);
      XLSX.utils.book_append_sheet(wb, fxPositionsSheet, t("app.msp.reports.export.sheet.fxPositions"));

      const fxProfitTotalsSheet = XLSX.utils.aoa_to_sheet([
        [
          t("app.msp.reports.fxProfit.base"),
          t("app.msp.reports.fxProfit.tickets"),
          t("app.msp.reports.fxProfit.ticketsWithRate"),
          t("app.msp.reports.fxProfit.feeBase"),
          t("app.msp.reports.fxProfit.spread"),
          t("app.msp.reports.fxProfit.profit")
        ],
        ...(fxProfit?.totalsByBase ?? []).map((r) => [r.baseCode, r.tickets, r.ticketsWithRate, r.feeBase, r.spreadBaseEstimated, r.profitEstimated])
      ]);
      XLSX.utils.book_append_sheet(wb, fxProfitTotalsSheet, t("app.msp.reports.export.sheet.fxProfitTotals"));

      const fxProfitItemsSheet = XLSX.utils.aoa_to_sheet([
        [
          t("app.msp.reports.fxProfit.base"),
          t("app.msp.reports.fxProfit.quote"),
          t("app.msp.reports.fxProfit.type"),
          t("app.msp.reports.fxProfit.tickets"),
          t("app.msp.reports.fxProfit.ticketsWithRate"),
          t("app.msp.reports.fxProfit.quoteAmount"),
          t("app.msp.reports.fxProfit.baseAmount"),
          t("app.msp.reports.fxProfit.feeBase"),
          t("app.msp.reports.fxProfit.spread"),
          t("app.msp.reports.fxProfit.profit")
        ],
        ...(fxProfit?.items ?? []).map((r) => [r.baseCode, r.quoteCode, r.type, r.tickets, r.ticketsWithRate, r.quoteAmount, r.baseAmount, r.feeBase, r.spreadBaseEstimated, r.profitEstimated])
      ]);
      XLSX.utils.book_append_sheet(wb, fxProfitItemsSheet, t("app.msp.reports.export.sheet.fxProfitItems"));

      const fxRealizedTotalsSheet = XLSX.utils.aoa_to_sheet([
        [
          t("app.msp.reports.fxRealized.valuation"),
          t("app.msp.reports.fxRealized.tickets"),
          t("app.msp.reports.fxRealized.fee"),
          t("app.msp.reports.fxRealized.costOfSold"),
          t("app.msp.reports.fxRealized.profit")
        ],
        ...(fxRealized?.totalsByValuation ?? []).map((r) => [r.valuationCurrencyCode, r.tickets, r.fee, r.costOfSold, r.profit])
      ]);
      XLSX.utils.book_append_sheet(wb, fxRealizedTotalsSheet, t("app.msp.reports.export.sheet.fxRealizedTotals"));

      const fxRealizedItemsSheet = XLSX.utils.aoa_to_sheet([
        [
          t("app.msp.reports.fxRealized.valuation"),
          t("app.msp.reports.fxRealized.quote"),
          t("app.msp.reports.fxRealized.tickets"),
          t("app.msp.reports.fxRealized.quoteAmount"),
          t("app.msp.reports.fxRealized.proceeds"),
          t("app.msp.reports.fxRealized.costOfSold"),
          t("app.msp.reports.fxRealized.profit")
        ],
        ...(fxRealized?.items ?? []).map((r) => [r.valuationCurrencyCode, r.quoteCode, r.tickets, r.quoteAmount, r.proceeds, r.costOfSold, r.profit])
      ]);
      XLSX.utils.book_append_sheet(wb, fxRealizedItemsSheet, t("app.msp.reports.export.sheet.fxRealizedItems"));

      const fxUnrealizedSheet = XLSX.utils.aoa_to_sheet([
        [
          t("app.msp.reports.fxUnrealized.valuation"),
          t("app.msp.reports.fxUnrealized.currency"),
          t("app.msp.reports.fxUnrealized.qty"),
          t("app.msp.reports.fxUnrealized.avgCost"),
          t("app.msp.reports.fxUnrealized.totalCost"),
          t("app.msp.reports.fxUnrealized.marketRate"),
          t("app.msp.reports.fxUnrealized.marketValue"),
          t("app.msp.reports.fxUnrealized.unrealized")
        ],
        ...(fxUnrealized?.items ?? []).map((r) => [r.valuationCurrencyCode, r.currencyCode, r.qty, r.avgCostValuation, r.totalCostValuation, r.marketRate ?? "", r.marketValue ?? "", r.unrealized ?? ""])
      ]);
      XLSX.utils.book_append_sheet(wb, fxUnrealizedSheet, t("app.msp.reports.export.sheet.fxUnrealized"));

      const pAml = new URLSearchParams();
      pAml.set("from", summary.from);
      pAml.set("to", summary.to);
      pAml.set("status", "all");
      pAml.set("page", "1");
      pAml.set("pageSize", "500");
      const amlRes = await apiFetch(`/api/msp/aml/alerts?${pAml.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const amlJson = (await amlRes.json()) as AmlAlertsResponse | { error?: { message_key?: string } };
      if (!amlRes.ok) {
        setErrorKey((amlJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const amlItems = (amlJson as AmlAlertsResponse).data.items ?? [];
      const amlSheet = XLSX.utils.aoa_to_sheet([
        [
          t("app.msp.aml.table.time"),
          t("app.msp.aml.table.status"),
          t("app.msp.aml.table.severity"),
          t("app.msp.aml.table.rule"),
          t("app.msp.aml.table.customer"),
          t("app.msp.aml.table.currency"),
          t("app.msp.aml.table.amount"),
          t("app.msp.aml.table.title")
        ],
        ...amlItems.map((a) => [
          a.createdAt,
          a.status,
          a.severity,
          a.ruleCode,
          `${a.customerName ?? ""}${a.customerPhone ? " (" + a.customerPhone + ")" : ""}`,
          a.currencyCode ?? "",
          a.amount ?? "",
          a.title
        ])
      ]);
      XLSX.utils.book_append_sheet(wb, amlSheet, t("app.msp.reports.export.sheet.amlAlerts"));

      XLSX.writeFile(wb, `msp_reports_${summary.from}_${summary.to}.xlsx`);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">{t("common.loading")}</div>;
  }
  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold">{t("app.msp.reports.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.msp.reports.subtitle")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => void load()}>
              {t("common.button.refresh")}
            </button>
            <button
              type="button"
              disabled={!canExport}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              onClick={() => void exportXlsx()}
            >
              {exporting ? t("common.working") : t("app.msp.reports.exportExcel")}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-7">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.reports.filter.from")}</label>
            <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.reports.filter.to")}</label>
            <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.aml.filter.status")}</label>
            <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={amlStatus} onChange={(e) => setAmlStatus(e.target.value as "open" | "all" | "closed")}>
              <option value="open">{t("app.msp.aml.status.open")}</option>
              <option value="all">{t("app.msp.aml.status.all")}</option>
              <option value="closed">{t("app.msp.aml.status.closed")}</option>
            </select>
          </div>
          <div className="md:col-span-4 flex items-end justify-end">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => void load()}>
              {t("app.msp.reports.apply")}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-200 px-6 py-4 text-sm font-semibold text-gray-900">{t("app.msp.reports.section.exchange")}</div>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">{t("app.msp.reports.exchange.type")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.reports.exchange.tickets")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.reports.exchange.quoteAmount")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.reports.exchange.baseAmount")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.reports.exchange.feeBase")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.reports.exchange.totalBase")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {(summary?.exchange ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {t("app.msp.reports.empty")}
                </td>
              </tr>
            ) : (
              (summary?.exchange ?? []).map((r) => (
                <tr key={r.type} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">{r.type}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.tickets}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.quoteAmount}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.baseAmount}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.feeBase}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{r.totalBase}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-200 px-6 py-4 text-sm font-semibold text-gray-900">{t("app.msp.reports.section.hawala")}</div>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">{t("app.msp.reports.hawala.status")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.reports.hawala.transfers")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.reports.hawala.amount")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.reports.hawala.fee")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.reports.hawala.total")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {(summary?.hawala ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  {t("app.msp.reports.empty")}
                </td>
              </tr>
            ) : (
              (summary?.hawala ?? []).map((r) => (
                <tr key={r.status} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">{r.status}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.transfers}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.amount}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.fee}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{r.total}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
          <div className="border-b border-gray-200 px-6 py-4 text-sm font-semibold text-gray-900">{t("app.msp.reports.section.cash")}</div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">{t("app.msp.reports.cash.currency")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.cash.in")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.cash.out")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.cash.balance")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {(summary?.cash ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    {t("app.msp.reports.empty")}
                  </td>
                </tr>
              ) : (
                (summary?.cash ?? []).map((r) => (
                  <tr key={r.currencyCode} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{r.currencyCode}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.cashIn}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.cashOut}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{r.balance}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
          <div className="border-b border-gray-200 px-6 py-4 text-sm font-semibold text-gray-900">{t("app.msp.reports.section.settlements")}</div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">{t("app.msp.reports.settlements.currency")}</th>
                <th className="px-4 py-3 text-left">{t("app.msp.reports.settlements.direction")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.settlements.count")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.settlements.amount")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {(summary?.settlements ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    {t("app.msp.reports.empty")}
                  </td>
                </tr>
              ) : (
                (summary?.settlements ?? []).map((r, idx) => (
                  <tr key={`${r.currencyCode}-${r.direction}-${idx}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{r.currencyCode}</td>
                    <td className="px-4 py-3 text-gray-700">{r.direction}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.count}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{r.amount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
          <div className="border-b border-gray-200 px-6 py-4 text-sm font-semibold text-gray-900">{t("app.msp.reports.section.aml")}</div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">{t("app.msp.aml.table.time")}</th>
                <th className="px-4 py-3 text-left">{t("app.msp.aml.table.severity")}</th>
                <th className="px-4 py-3 text-left">{t("app.msp.aml.table.rule")}</th>
                <th className="px-4 py-3 text-left">{t("app.msp.aml.table.customer")}</th>
                <th className="px-4 py-3 text-left">{t("app.msp.aml.table.amount")}</th>
                <th className="px-4 py-3 text-left">{t("app.msp.aml.table.title")}</th>
                <th className="px-4 py-3 text-left">{t("app.msp.aml.table.status")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.aml.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {(amlAlerts ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    {t("app.msp.aml.empty")}
                  </td>
                </tr>
              ) : (
                (amlAlerts ?? []).map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 tabular-nums text-gray-700">{a.createdAt.replace("T", " ").slice(0, 19)}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900">{a.severity}</td>
                    <td className="px-4 py-3 text-gray-700">{a.ruleCode}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {a.customerName ?? ""} {a.customerPhone ? `(${a.customerPhone})` : ""}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-gray-700">
                      {a.currencyCode ?? ""} {a.amount ?? ""}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{a.title}</td>
                    <td className="px-4 py-3 text-gray-700">{a.status}</td>
                    <td className="px-4 py-3 text-right">
                      {a.status === "open" ? (
                        <button type="button" className="inline-flex h-8 items-center justify-center rounded-lg bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-800" onClick={() => void closeAlert(a.id)}>
                          {t("app.msp.aml.action.close")}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-500">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-200 px-6 py-4 text-sm font-semibold text-gray-900">{t("app.msp.reports.section.fxPositions")}</div>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">{t("app.msp.reports.fxPositions.currency")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.reports.fxPositions.cashBank")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.reports.fxPositions.cash")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.reports.fxPositions.bank")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.reports.fxPositions.customer")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.reports.fxPositions.partner")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.reports.fxPositions.netOwned")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {(fxPositions?.items ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  {t("app.msp.reports.empty")}
                </td>
              </tr>
            ) : (
              (fxPositions?.items ?? []).map((r) => (
                <tr key={r.currencyCode} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">{r.currencyCode}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{r.cashBank}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.cash}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.bank}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.customer}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.partner}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{r.netOwned}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="space-y-6">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
          <div className="border-b border-gray-200 px-6 py-4 text-sm font-semibold text-gray-900">{t("app.msp.reports.section.fxProfit")}</div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">{t("app.msp.reports.fxProfit.base")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxProfit.tickets")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxProfit.ticketsWithRate")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxProfit.feeBase")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxProfit.spread")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxProfit.profit")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {(fxProfit?.totalsByBase ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    {t("app.msp.reports.empty")}
                  </td>
                </tr>
              ) : (
                (fxProfit?.totalsByBase ?? []).map((r) => (
                  <tr key={r.baseCode} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{r.baseCode}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.tickets}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.ticketsWithRate}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.feeBase}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.spreadBaseEstimated}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{r.profitEstimated}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
          <div className="border-b border-gray-200 px-6 py-4 text-sm font-semibold text-gray-900">{t("app.msp.reports.section.fxProfitDetails")}</div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">{t("app.msp.reports.fxProfit.base")}</th>
                <th className="px-4 py-3 text-left">{t("app.msp.reports.fxProfit.quote")}</th>
                <th className="px-4 py-3 text-left">{t("app.msp.reports.fxProfit.type")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxProfit.tickets")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxProfit.ticketsWithRate")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxProfit.feeBase")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxProfit.spread")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxProfit.profit")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {(fxProfit?.items ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    {t("app.msp.reports.empty")}
                  </td>
                </tr>
              ) : (
                (fxProfit?.items ?? []).map((r, idx) => (
                  <tr key={`${r.baseCode}-${r.quoteCode}-${r.type}-${idx}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{r.baseCode}</td>
                    <td className="px-4 py-3 text-gray-700">{r.quoteCode}</td>
                    <td className="px-4 py-3 text-gray-700">{r.type}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.tickets}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.ticketsWithRate}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.feeBase}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.spreadBaseEstimated}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{r.profitEstimated}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
          <div className="border-b border-gray-200 px-6 py-4 text-sm font-semibold text-gray-900">{t("app.msp.reports.section.fxRealized")}</div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">{t("app.msp.reports.fxRealized.valuation")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxRealized.tickets")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxRealized.fee")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxRealized.costOfSold")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxRealized.profit")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {(fxRealized?.totalsByValuation ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    {t("app.msp.reports.empty")}
                  </td>
                </tr>
              ) : (
                (fxRealized?.totalsByValuation ?? []).map((r) => (
                  <tr key={r.valuationCurrencyCode} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{r.valuationCurrencyCode}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.tickets}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.fee}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.costOfSold}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{r.profit}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
          <div className="border-b border-gray-200 px-6 py-4 text-sm font-semibold text-gray-900">{t("app.msp.reports.section.fxUnrealized")}</div>
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">{t("app.msp.reports.fxUnrealized.valuation")}</th>
                <th className="px-4 py-3 text-left">{t("app.msp.reports.fxUnrealized.currency")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxUnrealized.qty")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxUnrealized.avgCost")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxUnrealized.totalCost")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxUnrealized.marketRate")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxUnrealized.marketValue")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.reports.fxUnrealized.unrealized")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {(fxUnrealized?.items ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    {t("app.msp.reports.empty")}
                  </td>
                </tr>
              ) : (
                (fxUnrealized?.items ?? []).map((r, idx) => (
                  <tr key={`${r.valuationCurrencyCode}-${r.currencyCode}-${idx}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">{r.valuationCurrencyCode}</td>
                    <td className="px-4 py-3 text-gray-700">{r.currencyCode}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.qty}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.avgCostValuation}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.totalCostValuation}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.marketRate ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.marketValue ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{r.unrealized ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
