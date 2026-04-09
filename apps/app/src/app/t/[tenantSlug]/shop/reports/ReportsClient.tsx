"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = {
  data: {
    memberships: { tenantId: string; tenantSlug: string }[];
  };
};

type SalesSummaryResponse = {
  data: { invoicesCount: number; subtotal: string; paidTotal: string; outstanding: string };
};

type PaymentsByMethodResponse = {
  data: { items: { method: string; paymentsCount: number; totalAmount: string }[] };
};

type CashflowSummaryResponse = {
  data: { cashIn: string; cashOut: string; net: string };
};

type TopProductsResponse = {
  data: {
    items: {
      product: { id: string; name: string; sku: string | null; unit: { id: string; name: string; symbol: string | null } | null };
      quantity: string;
      total: string;
    }[];
  };
};

type LocationsResponse = { data: { id: string; name: string }[] };

type LowStockResponse = {
  data: {
    items: {
      product: { id: string; name: string; sku: string | null; unit: { id: string; name: string; symbol: string | null } | null };
      location: { id: string; name: string } | null;
      onHandQty: string;
    }[];
  };
};

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

type ShopSettingsResponse = { data: { baseCurrencyCode: string; sellCurrencyCode: string; buyCurrencyCode: string } };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function ReportsClient(props: { tenantSlug: string }) {
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

  const [sellCurrencyCode, setSellCurrencyCode] = useState("USD");
  const [buyCurrencyCode, setBuyCurrencyCode] = useState("USD");

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", new Date(to + "T23:59:59.999Z").toISOString());
    return p;
  }, [from, to]);

  async function logExport(format: "pdf" | "xlsx") {
    if (!tenantId) return;
    try {
      await apiFetch("/api/shop/reports/export-log", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({
          reportId: "shop.reports.v1",
          format,
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(to + "T23:59:59.999Z").toISOString() : undefined,
          locationId: locationId !== "all" ? locationId : undefined,
          threshold: threshold.trim() || undefined
        })
      });
    } catch {}
  }

  async function exportExcel() {
    if (!tenantId) return;
    setExportingExcel(true);
    setErrorKey(null);
    try {
      await logExport("xlsx");

      const lowParams = new URLSearchParams();
      if (threshold.trim()) lowParams.set("threshold", threshold.trim());
      if (locationId !== "all") lowParams.set("locationId", locationId);
      lowParams.set("limit", "5000");

      const valuationParams = new URLSearchParams();
      if (locationId !== "all") valuationParams.set("locationId", locationId);
      valuationParams.set("limit", "2000");

      const [sumRes, cashRes, payRes, refundPayRes, topRes, lowRes, valuationRes] = await Promise.all([
        apiFetch(`/api/shop/reports/sales-summary?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch(`/api/shop/reports/cashflow-summary?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch(`/api/shop/reports/payments-by-method?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch(`/api/shop/reports/payments-by-method?${queryParams.toString()}&direction=out`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch(`/api/shop/reports/top-products?${queryParams.toString()}&limit=50`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch(`/api/shop/reports/low-stock?${lowParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch(`/api/shop/reports/stock-valuation?${valuationParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
      ]);

      if (!sumRes.ok || !cashRes.ok || !payRes.ok || !refundPayRes.ok || !topRes.ok || !lowRes.ok || !valuationRes.ok) {
        setErrorKey("errors.internal");
        return;
      }

      const sumJson = (await sumRes.json()) as SalesSummaryResponse;
      const cashJson = (await cashRes.json()) as CashflowSummaryResponse;
      const payJson = (await payRes.json()) as PaymentsByMethodResponse;
      const refundPayJson = (await refundPayRes.json()) as PaymentsByMethodResponse;
      const topJson = (await topRes.json()) as TopProductsResponse;
      const lowJson = (await lowRes.json()) as LowStockResponse;
      const valuationJson = (await valuationRes.json()) as StockValuationResponse;

      const XLSX = await import("xlsx");

      const wb = XLSX.utils.book_new();

      const summarySheet = XLSX.utils.aoa_to_sheet([
        [t("app.shop.reports.export.range"), `${from} → ${to}`],
        [t("app.shop.reports.kpi.invoices"), sumJson.data.invoicesCount],
        [t("app.shop.reports.kpi.sales"), Number(sumJson.data.subtotal)],
        [t("app.shop.reports.kpi.paid"), Number(sumJson.data.paidTotal)],
        [t("app.shop.reports.kpi.outstanding"), Number(sumJson.data.outstanding)],
        [t("app.shop.reports.kpi.cashIn"), Number(cashJson.data.cashIn)],
        [t("app.shop.reports.kpi.cashOut"), Number(cashJson.data.cashOut)],
        [t("app.shop.reports.kpi.net"), Number(cashJson.data.net)],
        [t("app.shop.reports.stockValuation.total"), Number(valuationJson.data.totalValue)]
      ]);
      XLSX.utils.book_append_sheet(wb, summarySheet, t("app.shop.reports.export.sheet.summary"));

      const paymentsInSheet = XLSX.utils.aoa_to_sheet([
        [t("app.shop.reports.paymentsByMethod.method"), t("app.shop.reports.paymentsByMethod.count"), t("app.shop.reports.paymentsByMethod.total")],
        ...(payJson.data.items ?? []).map((p) => [p.method, p.paymentsCount, Number(p.totalAmount)])
      ]);
      XLSX.utils.book_append_sheet(wb, paymentsInSheet, t("app.shop.reports.export.sheet.paymentsIn"));

      const refundOutSheet = XLSX.utils.aoa_to_sheet([
        [t("app.shop.reports.paymentsByMethod.method"), t("app.shop.reports.paymentsByMethod.count"), t("app.shop.reports.paymentsByMethod.total")],
        ...(refundPayJson.data.items ?? []).map((p) => [p.method, p.paymentsCount, Number(p.totalAmount)])
      ]);
      XLSX.utils.book_append_sheet(wb, refundOutSheet, t("app.shop.reports.export.sheet.refundPayouts"));

      const topProductsSheet = XLSX.utils.aoa_to_sheet([
        [t("app.shop.reports.topProducts.product"), t("app.shop.reports.topProducts.qty"), t("app.shop.reports.topProducts.total"), "SKU"],
        ...(topJson.data.items ?? []).map((r) => [r.product.name, Number(r.quantity), Number(r.total), r.product.sku ?? ""])
      ]);
      XLSX.utils.book_append_sheet(wb, topProductsSheet, t("app.shop.reports.export.sheet.topProducts"));

      const lowStockSheet = XLSX.utils.aoa_to_sheet([
        [t("app.shop.reports.lowStock.product"), "SKU", t("app.shop.reports.lowStock.location"), t("app.shop.reports.lowStock.onHand")],
        ...(lowJson.data.items ?? []).map((i) => [i.product.name, i.product.sku ?? "", i.location?.name ?? "", Number(i.onHandQty)])
      ]);
      XLSX.utils.book_append_sheet(wb, lowStockSheet, t("app.shop.reports.export.sheet.lowStock"));

      const valuationSheet = XLSX.utils.aoa_to_sheet([
        [
          t("app.shop.reports.stockValuation.product"),
          "SKU",
          t("app.shop.reports.stockValuation.location"),
          t("app.shop.reports.stockValuation.onHand"),
          t("app.shop.reports.stockValuation.costPrice"),
          t("app.shop.reports.stockValuation.value")
        ],
        ...(valuationJson.data.items ?? []).map((i) => [
          i.product.name,
          i.product.sku ?? "",
          i.location?.name ?? "",
          Number(i.onHandQty),
          Number(i.costPrice),
          Number(i.value)
        ])
      ]);
      XLSX.utils.book_append_sheet(wb, valuationSheet, t("app.shop.reports.export.sheet.stockValuation"));

      const safeFrom = from || "from";
      const safeTo = to || "to";
      const filename = `shop_reports_${safeFrom}_${safeTo}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setExportingExcel(false);
      setExportMenuOpen(false);
    }
  }

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
    async function loadLocations() {
      if (!tenantId) return;
      try {
        const [locRes, settingsRes] = await Promise.all([
          apiFetch("/api/shop/locations", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch("/api/shop/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);

        if (locRes.ok) {
          const locJson = (await locRes.json()) as LocationsResponse;
          if (!cancelled) setLocations(locJson.data ?? []);
        }

        if (settingsRes.ok) {
          const settingsJson = (await settingsRes.json()) as ShopSettingsResponse;
          if (!cancelled) {
            setSellCurrencyCode(settingsJson.data.sellCurrencyCode ?? "USD");
            setBuyCurrencyCode(settingsJson.data.buyCurrencyCode ?? "USD");
          }
        }
      } catch {}
    }
    void loadLocations();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function loadReports() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const [sumRes, cashRes, payRes, refundPayRes, topRes] = await Promise.all([
          apiFetch(`/api/shop/reports/sales-summary?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/reports/cashflow-summary?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/reports/payments-by-method?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/reports/payments-by-method?${queryParams.toString()}&direction=out`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/reports/top-products?${queryParams.toString()}&limit=10`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);

        if (!sumRes.ok || !cashRes.ok || !payRes.ok || !refundPayRes.ok || !topRes.ok) {
          setErrorKey("errors.internal");
          return;
        }

        const sumJson = (await sumRes.json()) as SalesSummaryResponse;
        const cashJson = (await cashRes.json()) as CashflowSummaryResponse;
        const payJson = (await payRes.json()) as PaymentsByMethodResponse;
        const refundPayJson = (await refundPayRes.json()) as PaymentsByMethodResponse;
        const topJson = (await topRes.json()) as TopProductsResponse;

        if (!cancelled) {
          setSummary(sumJson.data);
          setCashflow(cashJson.data);
          setPayments(payJson.data.items ?? []);
          setRefundPayouts(refundPayJson.data.items ?? []);
          setTopProducts(topJson.data.items ?? []);
        }
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadReports();
    return () => {
      cancelled = true;
    };
  }, [tenantId, queryParams]);

  useEffect(() => {
    let cancelled = false;
    async function loadLowStock() {
      if (!tenantId) return;
      try {
        const valuationParams = new URLSearchParams();
        if (locationId !== "all") valuationParams.set("locationId", locationId);
        valuationParams.set("limit", "20");

        const p = new URLSearchParams();
        if (threshold.trim()) p.set("threshold", threshold.trim());
        if (locationId !== "all") p.set("locationId", locationId);
        const res = await apiFetch(`/api/shop/reports/low-stock?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const valuationRes = await apiFetch(`/api/shop/reports/stock-valuation?${valuationParams.toString()}`, {
          cache: "no-store",
          headers: { "X-Tenant-Id": tenantId }
        });
        if (!res.ok || !valuationRes.ok) return;
        const json = (await res.json()) as LowStockResponse;
        const valuationJson = (await valuationRes.json()) as StockValuationResponse;
        if (!cancelled) {
          setLowStock(json.data.items ?? []);
          setValuation(valuationJson.data);
        }
      } catch {}
    }
    void loadLowStock();
    return () => {
      cancelled = true;
    };
  }, [tenantId, locationId, threshold]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.shop.reports.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.shop.reports.subtitle")}</div>
          </div>
          <div className="relative">
            <button
              type="button"
              disabled={exportingExcel}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setExportMenuOpen((v) => !v)}
            >
              <span className="mr-2 inline-block h-4 w-4 text-gray-600">
                <svg viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v9m0 0l-3-3m3 3l3-3M5 19h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              {exportingExcel ? t("app.shop.products.action.working") : t("app.shop.reports.export.button")}
            </button>
            {exportMenuOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
                  onClick={() => void exportExcel()}
                >
                  <span className="inline-block h-4 w-4 text-gray-600">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M4 4h10l6 6v10H4z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M14 4v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M8 16l2-3 2 3 2-3 2 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {t("app.shop.reports.export.excel")}
                </button>
                <a
                  className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/shop/reports/print?paper=a4&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${locationId !== "all" ? `&locationId=${encodeURIComponent(locationId)}` : ""}${threshold.trim() ? `&threshold=${encodeURIComponent(threshold.trim())}` : ""}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    setExportMenuOpen(false);
                  }}
                >
                  <span className="inline-block h-4 w-4 text-gray-600">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M6 4h8l4 4v12H6zM10 14h4M10 10h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {t("app.shop.reports.export.printView")}
                </a>
                <a
                  className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/shop/reports/print?paper=a4&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${locationId !== "all" ? `&locationId=${encodeURIComponent(locationId)}` : ""}${threshold.trim() ? `&threshold=${encodeURIComponent(threshold.trim())}` : ""}&download=pdf`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    void logExport("pdf");
                    setExportMenuOpen(false);
                  }}
                >
                  <span className="inline-block h-4 w-4 text-gray-600">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M6 4h8l4 4v12H6zM10 14h4M10 10h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {t("app.shop.reports.export.pdfA4")}
                </a>
                <a
                  className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/shop/reports/print?paper=thermal80&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${locationId !== "all" ? `&locationId=${encodeURIComponent(locationId)}` : ""}${threshold.trim() ? `&threshold=${encodeURIComponent(threshold.trim())}` : ""}&download=pdf`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    void logExport("pdf");
                    setExportMenuOpen(false);
                  }}
                >
                  <span className="inline-block h-4 w-4 text-gray-600">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M6 4h8l4 4v12H6zM10 14h4M10 10h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {t("app.shop.reports.export.pdf80")}
                </a>
                <a
                  className="flex items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/shop/reports/print?paper=thermal58&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${locationId !== "all" ? `&locationId=${encodeURIComponent(locationId)}` : ""}${threshold.trim() ? `&threshold=${encodeURIComponent(threshold.trim())}` : ""}&download=pdf`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    void logExport("pdf");
                    setExportMenuOpen(false);
                  }}
                >
                  <span className="inline-block h-4 w-4 text-gray-600">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M6 4h8l4 4v12H6zM10 14h4M10 10h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {t("app.shop.reports.export.pdf58")}
                </a>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.reports.filter.from")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.reports.filter.to")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={loading}
              onClick={() => {
                setFrom(from);
                setTo(to);
              }}
            >
              {t("app.shop.reports.action.refresh")}
            </button>
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard title={t("app.shop.reports.kpi.invoices")} value={summary ? String(summary.invoicesCount) : "—"} />
        <StatCard title={t("app.shop.reports.kpi.sales")} value={summary ? formatMoney(summary.subtotal, sellCurrencyCode) : "—"} />
        <StatCard title={t("app.shop.reports.kpi.paid")} value={summary ? formatMoney(summary.paidTotal, sellCurrencyCode) : "—"} />
        <StatCard title={t("app.shop.reports.kpi.outstanding")} value={summary ? formatMoney(summary.outstanding, sellCurrencyCode) : "—"} />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title={t("app.shop.reports.kpi.cashIn")} value={cashflow ? formatMoney(cashflow.cashIn, sellCurrencyCode) : "—"} />
        <StatCard title={t("app.shop.reports.kpi.cashOut")} value={cashflow ? formatMoney(cashflow.cashOut, sellCurrencyCode) : "—"} />
        <StatCard title={t("app.shop.reports.kpi.net")} value={cashflow ? formatMoney(cashflow.net, sellCurrencyCode) : "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
          <div className="text-lg font-semibold">{t("app.shop.reports.paymentsByMethod.title")}</div>
          <div className="mt-4 block lg:hidden">
            {payments.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-600">{t("app.shop.reports.empty")}</div>
            ) : (
              <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                {payments.map((p) => (
                  <div key={p.method} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900">{p.method}</div>
                      <div className="mt-1 text-xs text-gray-600">
                        {t("app.shop.reports.paymentsByMethod.count")}: <span className="font-medium text-gray-900">{p.paymentsCount}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-semibold text-gray-900">{formatMoney(p.totalAmount, sellCurrencyCode)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 hidden overflow-x-auto lg:block">
            <table className="min-w-[520px] w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.shop.reports.paymentsByMethod.method")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{t("app.shop.reports.paymentsByMethod.count")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{t("app.shop.reports.paymentsByMethod.total")}</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-gray-600" colSpan={3}>
                      {t("app.shop.reports.empty")}
                    </td>
                  </tr>
                ) : (
                  payments.map((p) => (
                    <tr key={p.method}>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{p.method}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-700">{p.paymentsCount}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900">{formatMoney(p.totalAmount, sellCurrencyCode)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
          <div className="text-lg font-semibold">{t("app.shop.reports.refundPayoutsByMethod.title")}</div>
          <div className="mt-4 block lg:hidden">
            {refundPayouts.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-600">{t("app.shop.reports.empty")}</div>
            ) : (
              <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                {refundPayouts.map((p) => (
                  <div key={p.method} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900">{p.method}</div>
                      <div className="mt-1 text-xs text-gray-600">
                        {t("app.shop.reports.paymentsByMethod.count")}: <span className="font-medium text-gray-900">{p.paymentsCount}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-semibold text-gray-900">{formatMoney(p.totalAmount, sellCurrencyCode)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 hidden overflow-x-auto lg:block">
            <table className="min-w-[520px] w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.shop.reports.paymentsByMethod.method")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{t("app.shop.reports.paymentsByMethod.count")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{t("app.shop.reports.paymentsByMethod.total")}</th>
                </tr>
              </thead>
              <tbody>
                {refundPayouts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-gray-600" colSpan={3}>
                      {t("app.shop.reports.empty")}
                    </td>
                  </tr>
                ) : (
                  refundPayouts.map((p) => (
                    <tr key={p.method}>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{p.method}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-700">{p.paymentsCount}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900">{formatMoney(p.totalAmount, sellCurrencyCode)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
          <div className="text-lg font-semibold">{t("app.shop.reports.topProducts.title")}</div>
          <div className="mt-4 block lg:hidden">
            {topProducts.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-600">{t("app.shop.reports.empty")}</div>
            ) : (
              <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                {topProducts.map((r) => (
                  <div key={r.product.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-900">{r.product.name}</div>
                        <div className="mt-1 text-xs text-gray-600">{r.product.sku ?? "—"}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[11px] font-medium text-gray-600">{t("app.shop.reports.topProducts.qty")}</div>
                        <div className="mt-1 text-sm font-semibold text-gray-900">{r.quantity}</div>
                      </div>
                    </div>
                    <div className="mt-2 text-right text-sm font-semibold text-gray-900">{formatMoney(r.total, sellCurrencyCode)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 hidden overflow-x-auto lg:block">
            <table className="min-w-[560px] w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.shop.reports.topProducts.product")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{t("app.shop.reports.topProducts.qty")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{t("app.shop.reports.topProducts.total")}</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-gray-600" colSpan={3}>
                      {t("app.shop.reports.empty")}
                    </td>
                  </tr>
                ) : (
                  topProducts.map((r) => (
                    <tr key={r.product.id}>
                      <td className="border-b border-gray-100 px-4 py-3">
                        <div className="font-medium text-gray-900">{r.product.name}</div>
                        <div className="mt-1 text-xs text-gray-500">{r.product.sku ?? "—"}</div>
                      </td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-700">{r.quantity}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900">{formatMoney(r.total, sellCurrencyCode)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-lg font-semibold">{t("app.shop.reports.lowStock.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.shop.reports.lowStock.subtitle")}</div>
          </div>
          <div className="grid w-full gap-3 md:w-auto md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.shop.reports.lowStock.location")}</label>
              <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="all">{t("app.shop.reports.lowStock.allLocations")}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.shop.reports.lowStock.threshold")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={threshold} onChange={(e) => setThreshold(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-lg font-semibold">{t("app.shop.reports.stockValuation.title")}</div>
              <div className="mt-1 text-sm text-gray-700">{t("app.shop.reports.stockValuation.subtitle")}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <span className="text-gray-700">{t("app.shop.reports.stockValuation.total")}: </span>
              <span className="font-semibold text-gray-900">{valuation ? formatMoney(valuation.totalValue, buyCurrencyCode) : "—"}</span>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[860px] w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.shop.reports.stockValuation.product")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.shop.reports.stockValuation.location")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{t("app.shop.reports.stockValuation.onHand")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{t("app.shop.reports.stockValuation.costPrice")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{t("app.shop.reports.stockValuation.value")}</th>
                </tr>
              </thead>
              <tbody>
                {!valuation || valuation.items.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-gray-600" colSpan={5}>
                      {t("app.shop.reports.stockValuation.empty")}
                    </td>
                  </tr>
                ) : (
                  valuation.items.map((i) => (
                    <tr key={`${i.product.id}-${i.location?.id ?? "none"}`}>
                      <td className="border-b border-gray-100 px-4 py-3">
                        <div className="font-medium text-gray-900">{i.product.name}</div>
                        <div className="mt-1 text-xs text-gray-500">{i.product.sku ?? "—"}</div>
                      </td>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{i.location?.name ?? "—"}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900">{i.onHandQty}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900">{formatMoney(i.costPrice, buyCurrencyCode)}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(i.value, buyCurrencyCode)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[760px] w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.shop.reports.lowStock.product")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.shop.reports.lowStock.location")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{t("app.shop.reports.lowStock.onHand")}</th>
              </tr>
            </thead>
            <tbody>
              {lowStock.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={3}>
                    {t("app.shop.reports.lowStock.empty")}
                  </td>
                </tr>
              ) : (
                lowStock.map((i) => (
                  <tr key={`${i.product.id}-${i.location?.id ?? "none"}`}>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="font-medium text-gray-900">{i.product.name}</div>
                      <div className="mt-1 text-xs text-gray-500">{i.product.sku ?? "—"}</div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{i.location?.name ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right font-semibold text-gray-900">{i.onHandQty}</td>
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

function StatCard(props: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-card">
      <div className="text-xs font-medium text-gray-600">{props.title}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{props.value}</div>
    </div>
  );
}
