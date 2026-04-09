"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type SalesSummaryResponse = { data: { invoicesCount: number; subtotal: string; paidTotal: string; outstanding: string } };
type CashflowSummaryResponse = { data: { cashIn: string; cashOut: string; net: string } };
type PaymentsByMethodResponse = { data: { items: { method: string; paymentsCount: number; totalAmount: string }[] } };
type TopProductsResponse = { data: { items: { product: { id: string; name: string; sku: string | null; unit: { id: string; name: string; symbol: string | null } | null }; quantity: string; total: string }[] } };
type LowStockResponse = { data: { items: { product: { id: string; name: string; sku: string | null; unit: { id: string; name: string; symbol: string | null } | null }; location: { id: string; name: string } | null; onHandQty: string }[] } };
type StockValuationResponse = {
  data: {
    currencyCode: string;
    totalValue: string;
    items: {
      product: { id: string; name: string; sku: string | null; unit: { id: string; name: string; symbol: string | null } | null };
      location: { id: string; name: string } | null;
      onHandQty: string;
      costPrice: string;
      value: string;
    }[];
  };
};
type ProfitSummaryResponse = {
  data: {
    currencyCode: string;
    totals: { revenue: string; cogs: string; grossProfit: string; marginPct: string; missingCostCount: number };
    items: { product: { id: string; name: string; sku: string | null; unit: { id: string; name: string; symbol: string | null } | null }; revenue: string; cogs: string; grossProfit: string; marginPct: string }[];
  };
};

type ShopSettingsResponse = { data: { baseCurrencyCode: string; sellCurrencyCode: string; buyCurrencyCode: string } };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function PharmacyStandardReportsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return isoDate(d);
  });
  const [to, setTo] = useState(() => isoDate(new Date()));

  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [locationId, setLocationId] = useState<string>("all");
  const [threshold, setThreshold] = useState("0");

  const [summary, setSummary] = useState<SalesSummaryResponse["data"] | null>(null);
  const [cashflow, setCashflow] = useState<CashflowSummaryResponse["data"] | null>(null);
  const [payments, setPayments] = useState<PaymentsByMethodResponse["data"]["items"]>([]);
  const [refundPayouts, setRefundPayouts] = useState<PaymentsByMethodResponse["data"]["items"]>([]);
  const [topProducts, setTopProducts] = useState<TopProductsResponse["data"]["items"]>([]);
  const [lowStock, setLowStock] = useState<LowStockResponse["data"]["items"]>([]);
  const [valuation, setValuation] = useState<StockValuationResponse["data"] | null>(null);
  const [profit, setProfit] = useState<ProfitSummaryResponse["data"] | null>(null);

  const [sellCurrencyCode, setSellCurrencyCode] = useState("USD");
  const [buyCurrencyCode, setBuyCurrencyCode] = useState("USD");

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", new Date(to + "T23:59:59.999Z").toISOString());
    if (locationId !== "all") p.set("locationId", locationId);
    return p.toString();
  }, [from, locationId, to]);

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

  const loadAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const [locRes, settingsRes] = await Promise.all([
        apiFetch("/api/pharmacy/locations", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/pharmacy/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
      ]);
      if (!locRes.ok || !settingsRes.ok) {
        setErrorKey("errors.internal");
        return;
      }
      const locJson = (await locRes.json()) as { data: { id: string; name: string }[] };
      const settingsJson = (await settingsRes.json()) as ShopSettingsResponse;
      setLocations(locJson.data ?? []);
      setSellCurrencyCode(settingsJson.data.sellCurrencyCode ?? "USD");
      setBuyCurrencyCode(settingsJson.data.buyCurrencyCode ?? "USD");

      const p = queryParams;
      const [s1, s2, s3, s4, s5, s6, s7] = await Promise.all([
        apiFetch(`/api/pharmacy/reports/sales-summary?${p}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch(`/api/pharmacy/reports/cashflow-summary?${p}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch(`/api/pharmacy/reports/payments-by-method?${p}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch(`/api/pharmacy/reports/payments-by-method?${p}&direction=out`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch(`/api/pharmacy/reports/top-products?${p}&limit=10`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch(`/api/pharmacy/reports/low-stock?${new URLSearchParams({ threshold, limit: "20", ...(locationId !== "all" ? { locationId } : {}) }).toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch(`/api/pharmacy/reports/stock-valuation?${new URLSearchParams({ limit: "30", ...(locationId !== "all" ? { locationId } : {}) }).toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
      ]);

      const [profitRes] = await Promise.all([apiFetch(`/api/pharmacy/reports/profit-summary?${p}&limit=10`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })]);

      if (![s1, s2, s3, s4, s5, s6, s7, profitRes].every((r) => r.ok)) {
        setErrorKey("errors.internal");
        return;
      }

      setSummary(((await s1.json()) as SalesSummaryResponse).data);
      setCashflow(((await s2.json()) as CashflowSummaryResponse).data);
      setPayments(((await s3.json()) as PaymentsByMethodResponse).data.items ?? []);
      setRefundPayouts(((await s4.json()) as PaymentsByMethodResponse).data.items ?? []);
      setTopProducts(((await s5.json()) as TopProductsResponse).data.items ?? []);
      setLowStock(((await s6.json()) as LowStockResponse).data.items ?? []);
      setValuation(((await s7.json()) as StockValuationResponse).data);
      setProfit(((await profitRes.json()) as ProfitSummaryResponse).data);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [locationId, queryParams, tenantId, threshold]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const exportExcel = useCallback(async () => {
    if (!tenantId) return;
    setExportingExcel(true);
    setErrorKey(null);
    try {
      try {
        await apiFetch("/api/pharmacy/reports/export-log", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
          body: JSON.stringify({ reportId: "pharmacy.reports.standard.v1", format: "xlsx", from: new Date(from).toISOString(), to: new Date(to + "T23:59:59.999Z").toISOString(), locationId: locationId !== "all" ? locationId : undefined, threshold })
        });
      } catch {}

      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      const summaryAoA = [
        ["Pharmacy standard reports"],
        ["Exported at", new Date().toISOString()],
        ["From", from],
        ["To", to],
        ["Location", locationId === "all" ? t("common.all") : locations.find((l) => l.id === locationId)?.name ?? locationId],
        ["Low stock threshold", threshold]
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");

      if (summary) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Invoices", summary.invoicesCount], ["Subtotal", summary.subtotal], ["Paid", summary.paidTotal], ["Outstanding", summary.outstanding]]), "Sales summary");
      if (cashflow) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Cash in", cashflow.cashIn], ["Cash out", cashflow.cashOut], ["Net", cashflow.net]]), "Cashflow");

      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Method", "Count", "Total"], ...payments.map((p) => [p.method, p.paymentsCount, p.totalAmount])]), "Payments in");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Method", "Count", "Total"], ...refundPayouts.map((p) => [p.method, p.paymentsCount, p.totalAmount])]), "Payments out");

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([["Product", "SKU", "Qty", "Total"], ...topProducts.map((r) => [r.product.name, r.product.sku ?? "", r.quantity, r.total])]),
        "Top products"
      );

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([["Product", "SKU", "Location", "On hand"], ...lowStock.map((r) => [r.product.name, r.product.sku ?? "", r.location?.name ?? "", r.onHandQty])]),
        "Low stock"
      );

      if (valuation) {
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Total value", valuation.totalValue], ["Currency", valuation.currencyCode]]), "Valuation");
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.aoa_to_sheet([
            ["Product", "SKU", "Location", "On hand", "Cost", "Value"],
            ...valuation.items.map((r) => [r.product.name, r.product.sku ?? "", r.location?.name ?? "", r.onHandQty, r.costPrice, r.value])
          ]),
          "Valuation items"
        );
      }

      if (profit) {
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.aoa_to_sheet([
            ["Revenue", profit.totals.revenue],
            ["COGS", profit.totals.cogs],
            ["Gross profit", profit.totals.grossProfit],
            ["Margin %", profit.totals.marginPct],
            ["Missing cost items", profit.totals.missingCostCount]
          ]),
          "Profit summary"
        );
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.aoa_to_sheet([
            ["Product", "SKU", "Revenue", "COGS", "Gross profit", "Margin %"],
            ...profit.items.map((r) => [r.product.name, r.product.sku ?? "", r.revenue, r.cogs, r.grossProfit, r.marginPct])
          ]),
          "Profit by product"
        );
      }

      const safeDate = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `pharmacy_reports_${safeDate}.xlsx`);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setExportingExcel(false);
      setExportMenuOpen(false);
    }
  }, [cashflow, from, locationId, locations, lowStock, payments, profit, refundPayouts, summary, t, tenantId, threshold, to, topProducts, valuation]);

  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Link className="text-sm font-medium text-gray-600 hover:text-gray-900" href={`/t/${props.tenantSlug}/pharmacy/reports`}>
                {t("app.pharmacy.reports.title")}
              </Link>
              <div className="text-sm text-gray-500">/</div>
              <div className="text-2xl font-semibold">{t("app.pharmacy.reports.standard.title")}</div>
            </div>
            <div className="mt-2 text-gray-700">{t("app.pharmacy.reports.standard.subtitle")}</div>
          </div>

          <div className="relative">
            <button
              type="button"
              disabled={!tenantId || exportingExcel}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setExportMenuOpen((v) => !v)}
            >
              {exportingExcel ? t("common.working") : t("app.shop.reports.export.button")}
            </button>
            {exportMenuOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50" onClick={() => void exportExcel()}>
                  <span className="inline-block h-4 w-4 text-gray-600">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M7 3h10v18H7V3Zm2 4h6M9 11h6M9 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {t("app.shop.reports.export.excel")}
                </button>
                <a
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/pharmacy/reports/print?paper=a4&from=${encodeURIComponent(new Date(from).toISOString())}&to=${encodeURIComponent(new Date(to + "T23:59:59.999Z").toISOString())}&locationId=${encodeURIComponent(locationId === "all" ? "" : locationId)}&threshold=${encodeURIComponent(threshold)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.reports.export.printView")}
                </a>
                <a
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/pharmacy/reports/print?paper=a4&download=pdf&from=${encodeURIComponent(new Date(from).toISOString())}&to=${encodeURIComponent(new Date(to + "T23:59:59.999Z").toISOString())}&locationId=${encodeURIComponent(locationId === "all" ? "" : locationId)}&threshold=${encodeURIComponent(threshold)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.reports.export.pdfA4")}
                </a>
                <a
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/pharmacy/reports/print?paper=thermal80&download=pdf&from=${encodeURIComponent(new Date(from).toISOString())}&to=${encodeURIComponent(new Date(to + "T23:59:59.999Z").toISOString())}&locationId=${encodeURIComponent(locationId === "all" ? "" : locationId)}&threshold=${encodeURIComponent(threshold)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.reports.export.pdf80")}
                </a>
                <a
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/pharmacy/reports/print?paper=thermal58&download=pdf&from=${encodeURIComponent(new Date(from).toISOString())}&to=${encodeURIComponent(new Date(to + "T23:59:59.999Z").toISOString())}&locationId=${encodeURIComponent(locationId === "all" ? "" : locationId)}&threshold=${encodeURIComponent(threshold)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.reports.export.pdf58")}
                </a>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-5">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.reports.filter.from")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.reports.filter.to")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.reports.filter.location")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="all">{t("common.all")}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.reports.filter.lowStockThreshold")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm tabular" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button type="button" className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60" onClick={() => void loadAll()} disabled={!tenantId || loading}>
              {loading ? t("common.working") : t("common.button.refresh")}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MetricCard title={t("app.shop.reports.sales.title")} subtitle={t("app.shop.reports.sales.subtitle")} rows={[{ label: t("app.shop.reports.sales.invoicesCount"), value: String(summary?.invoicesCount ?? 0) }, { label: t("app.shop.reports.sales.subtotal"), value: formatMoney(summary?.subtotal ?? "0", sellCurrencyCode) }, { label: t("app.shop.reports.sales.paidTotal"), value: formatMoney(summary?.paidTotal ?? "0", sellCurrencyCode) }, { label: t("app.shop.reports.sales.outstanding"), value: formatMoney(summary?.outstanding ?? "0", sellCurrencyCode) }]} />
        <MetricCard title={t("app.shop.reports.cashflow.title")} subtitle={t("app.shop.reports.cashflow.subtitle")} rows={[{ label: t("app.shop.reports.cashflow.cashIn"), value: formatMoney(cashflow?.cashIn ?? "0", sellCurrencyCode) }, { label: t("app.shop.reports.cashflow.cashOut"), value: formatMoney(cashflow?.cashOut ?? "0", sellCurrencyCode) }, { label: t("app.shop.reports.cashflow.net"), value: formatMoney(cashflow?.net ?? "0", sellCurrencyCode) }]} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <TableCard title={t("app.shop.reports.paymentsIn.title")} subtitle={t("app.shop.reports.paymentsIn.subtitle")} header={[t("app.shop.reports.table.method"), t("app.shop.reports.table.count"), t("app.shop.reports.table.total")]}>
          {payments.map((p) => (
            <tr key={p.method} className="border-b border-gray-100">
              <td className="py-2 pr-3 text-sm text-gray-900">{p.method}</td>
              <td className="py-2 pr-3 text-sm text-gray-700 tabular">{p.paymentsCount}</td>
              <td className="py-2 text-sm font-medium text-gray-900 tabular">{formatMoney(p.totalAmount, sellCurrencyCode)}</td>
            </tr>
          ))}
        </TableCard>

        <TableCard title={t("app.shop.reports.paymentsOut.title")} subtitle={t("app.shop.reports.paymentsOut.subtitle")} header={[t("app.shop.reports.table.method"), t("app.shop.reports.table.count"), t("app.shop.reports.table.total")]}>
          {refundPayouts.map((p) => (
            <tr key={p.method} className="border-b border-gray-100">
              <td className="py-2 pr-3 text-sm text-gray-900">{p.method}</td>
              <td className="py-2 pr-3 text-sm text-gray-700 tabular">{p.paymentsCount}</td>
              <td className="py-2 text-sm font-medium text-gray-900 tabular">{formatMoney(p.totalAmount, sellCurrencyCode)}</td>
            </tr>
          ))}
        </TableCard>

        <TableCard title={t("app.shop.reports.topProducts.title")} subtitle={t("app.shop.reports.topProducts.subtitle")} header={[t("app.shop.reports.table.product"), t("app.shop.reports.table.qty"), t("app.shop.reports.table.total")]}>
          {topProducts.map((r) => (
            <tr key={r.product.id} className="border-b border-gray-100">
              <td className="py-2 pr-3 text-sm text-gray-900">
                <div className="font-medium">{r.product.name}</div>
                <div className="mt-1 text-xs text-gray-500">{r.product.sku ?? "—"}</div>
              </td>
              <td className="py-2 pr-3 text-sm text-gray-700 tabular">{r.quantity}</td>
              <td className="py-2 text-sm font-medium text-gray-900 tabular">{formatMoney(r.total, sellCurrencyCode)}</td>
            </tr>
          ))}
        </TableCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <TableCard title={t("app.shop.reports.lowStock.title")} subtitle={t("app.shop.reports.lowStock.subtitle")} header={[t("app.shop.reports.table.product"), t("app.shop.reports.table.location"), t("app.shop.reports.table.onHand")]}>
          {lowStock.map((r) => (
            <tr key={`${r.product.id}:${r.location?.id ?? ""}`} className="border-b border-gray-100">
              <td className="py-2 pr-3 text-sm text-gray-900">
                <div className="font-medium">{r.product.name}</div>
                <div className="mt-1 text-xs text-gray-500">{r.product.sku ?? "—"}</div>
              </td>
              <td className="py-2 pr-3 text-sm text-gray-700">{r.location?.name ?? "—"}</td>
              <td className="py-2 text-sm font-medium text-gray-900 tabular">{r.onHandQty}</td>
            </tr>
          ))}
        </TableCard>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold text-gray-900">{t("app.shop.reports.valuation.title")}</div>
              <div className="mt-1 text-sm text-gray-700">{t("app.shop.reports.valuation.subtitle")}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-medium text-gray-600">{t("app.shop.reports.valuation.total")}</div>
              <div className="mt-1 text-lg font-semibold text-gray-900 tabular">{formatMoney(valuation?.totalValue ?? "0", buyCurrencyCode)}</div>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200">
            <table className="w-full text-left">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-700">{t("app.shop.reports.table.product")}</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-700">{t("app.shop.reports.table.location")}</th>
                  <th className="px-4 py-2 text-xs font-semibold text-gray-700">{t("app.shop.reports.table.value")}</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {(valuation?.items ?? []).slice(0, 10).map((r) => (
                  <tr key={`${r.product.id}:${r.location?.id ?? ""}`} className="border-b border-gray-100">
                    <td className="px-4 py-2 text-sm text-gray-900">
                      <div className="font-medium">{r.product.name}</div>
                      <div className="mt-1 text-xs text-gray-500">{r.product.sku ?? "—"}</div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">{r.location?.name ?? "—"}</td>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900 tabular">{formatMoney(r.value, buyCurrencyCode)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-gray-900">{t("app.pharmacy.reports.profit.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.pharmacy.reports.profit.subtitle")}</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-medium text-gray-600">{t("app.pharmacy.reports.profit.total")}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900 tabular">{formatMoney(profit?.totals.grossProfit ?? "0", profit?.currencyCode ?? sellCurrencyCode)}</div>
            <div className="mt-1 text-xs text-gray-600 tabular">{`${t("app.pharmacy.reports.profit.margin")}: ${profit?.totals.marginPct ?? "0"}%`}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <MiniMetric label={t("app.pharmacy.reports.profit.revenue")} value={formatMoney(profit?.totals.revenue ?? "0", profit?.currencyCode ?? sellCurrencyCode)} />
          <MiniMetric label={t("app.pharmacy.reports.profit.cogs")} value={formatMoney(profit?.totals.cogs ?? "0", profit?.currencyCode ?? sellCurrencyCode)} />
          <MiniMetric label={t("app.pharmacy.reports.profit.grossProfit")} value={formatMoney(profit?.totals.grossProfit ?? "0", profit?.currencyCode ?? sellCurrencyCode)} />
          <MiniMetric label={t("app.pharmacy.reports.profit.missingCost")} value={String(profit?.totals.missingCostCount ?? 0)} />
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200">
          <table className="w-full text-left">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-xs font-semibold text-gray-700">{t("app.shop.reports.table.product")}</th>
                <th className="px-4 py-2 text-xs font-semibold text-gray-700">{t("app.pharmacy.reports.profit.revenue")}</th>
                <th className="px-4 py-2 text-xs font-semibold text-gray-700">{t("app.pharmacy.reports.profit.cogs")}</th>
                <th className="px-4 py-2 text-xs font-semibold text-gray-700">{t("app.pharmacy.reports.profit.grossProfit")}</th>
                <th className="px-4 py-2 text-xs font-semibold text-gray-700">{t("app.pharmacy.reports.profit.margin")}</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {(profit?.items ?? []).slice(0, 10).map((r) => (
                <tr key={r.product.id} className="border-b border-gray-100">
                  <td className="px-4 py-2 text-sm text-gray-900">
                    <div className="font-medium">{r.product.name}</div>
                    <div className="mt-1 text-xs text-gray-500">{r.product.sku ?? "—"}</div>
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-900 tabular">{formatMoney(r.revenue, profit?.currencyCode ?? sellCurrencyCode)}</td>
                  <td className="px-4 py-2 text-sm text-gray-900 tabular">{formatMoney(r.cogs, profit?.currencyCode ?? sellCurrencyCode)}</td>
                  <td className="px-4 py-2 text-sm font-medium text-gray-900 tabular">{formatMoney(r.grossProfit, profit?.currencyCode ?? sellCurrencyCode)}</td>
                  <td className="px-4 py-2 text-sm text-gray-700 tabular">{`${r.marginPct}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard(props: { title: string; subtitle: string; rows: { label: string; value: string }[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
      <div className="text-lg font-semibold text-gray-900">{props.title}</div>
      <div className="mt-1 text-sm text-gray-700">{props.subtitle}</div>
      <div className="mt-4 space-y-2">
        {props.rows.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <div className="text-sm text-gray-700">{r.label}</div>
            <div className="text-sm font-semibold text-gray-900 tabular">{r.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TableCard(props: { title: string; subtitle: string; header: string[]; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
      <div className="text-lg font-semibold text-gray-900">{props.title}</div>
      <div className="mt-1 text-sm text-gray-700">{props.subtitle}</div>
      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200">
        <table className="w-full text-left">
          <thead className="bg-gray-50">
            <tr>
              {props.header.map((h) => (
                <th key={h} className="px-4 py-2 text-xs font-semibold text-gray-700">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">{props.children}</tbody>
        </table>
      </div>
    </div>
  );
}

function MiniMetric(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="text-xs font-medium text-gray-600">{props.label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900 tabular">{props.value}</div>
    </div>
  );
}
