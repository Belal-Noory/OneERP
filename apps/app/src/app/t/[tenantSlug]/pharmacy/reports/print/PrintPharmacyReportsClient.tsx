"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { getApiBaseUrl } from "@/lib/api";
import { useClientI18n } from "@/lib/client-i18n";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };
type TenantCurrentResponse = {
  data: {
    tenant: { id: string; slug: string; legalName: string; displayName: string; defaultLocale: string; status: string };
    branding: { logoUrl: string | null; address: string | null; phone: string | null; email: string | null };
  } | null;
};

type SalesSummaryResponse = { data: { invoicesCount: number; subtotal: string; paidTotal: string; outstanding: string } };
type CashflowSummaryResponse = { data: { cashIn: string; cashOut: string; net: string } };
type PaymentsByMethodResponse = { data: { items: { method: string; paymentsCount: number; totalAmount: string }[] } };
type TopProductsResponse = { data: { items: { product: { id: string; name: string; sku: string | null }; quantity: string; total: string }[] } };
type LowStockResponse = { data: { items: { product: { id: string; name: string; sku: string | null }; location: { id: string; name: string } | null; onHandQty: string }[] } };
type StockValuationResponse = { data: { currencyCode: string; totalValue: string; items: { product: { id: string; name: string; sku: string | null }; location: { id: string; name: string } | null; onHandQty: string; costPrice: string; value: string }[] } };
type ProfitSummaryResponse = { data: { currencyCode: string; totals: { revenue: string; cogs: string; grossProfit: string; marginPct: string; missingCostCount: number }; items: { product: { id: string; name: string; sku: string | null }; revenue: string; cogs: string; grossProfit: string; marginPct: string }[] } };
type ShopSettingsResponse = { data: { baseCurrencyCode: string; sellCurrencyCode: string; buyCurrencyCode: string } };

type Paper = "a4" | "thermal80" | "thermal58";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function isThermal(paper: Paper): paper is "thermal58" | "thermal80" {
  return paper === "thermal58" || paper === "thermal80";
}

function paperParamToFileSuffix(paper: Paper): string {
  if (paper === "a4") return "a4";
  return paper;
}

export function PrintPharmacyReportsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const apiBase = getApiBaseUrl();
  const searchParams = useSearchParams();

  const initialPaper = ((): Paper => {
    const raw = searchParams.get("paper");
    if (raw === "thermal58") return "thermal58";
    if (raw === "thermal80") return "thermal80";
    return "a4";
  })();
  const download = searchParams.get("download") === "pdf";
  const initialFrom = searchParams.get("from");
  const initialTo = searchParams.get("to");
  const initialLocationId = searchParams.get("locationId");
  const initialThreshold = searchParams.get("threshold");

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantCurrentResponse["data"]>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [paper, setPaper] = useState<Paper>(initialPaper);
  const [paddingMm, setPaddingMm] = useState(10);
  const [fontScale, setFontScale] = useState<"compact" | "normal" | "large">("normal");
  const [footerText, setFooterText] = useState("");

  const [from] = useState(() => {
    if (initialFrom) return initialFrom;
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return isoDate(d);
  });
  const [to] = useState(() => (initialTo ? initialTo : isoDate(new Date())));
  const [locationId] = useState(() => initialLocationId?.trim() || "");
  const [threshold] = useState(() => initialThreshold?.trim() || "0");

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

  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfExported, setPdfExported] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`oneerp.pharmacy.printSettings.${props.tenantSlug}.reports`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{ paper: Paper; paddingMm: number; fontScale: "compact" | "normal" | "large"; footerText: string }>;
      if (parsed.paper === "a4" || parsed.paper === "thermal58" || parsed.paper === "thermal80") setPaper(parsed.paper);
      if (typeof parsed.paddingMm === "number" && parsed.paddingMm >= 0 && parsed.paddingMm <= 20) setPaddingMm(parsed.paddingMm);
      if (parsed.fontScale === "compact" || parsed.fontScale === "normal" || parsed.fontScale === "large") setFontScale(parsed.fontScale);
      if (typeof parsed.footerText === "string") setFooterText(parsed.footerText);
    } catch {}
  }, [props.tenantSlug]);

  useEffect(() => {
    try {
      localStorage.setItem(`oneerp.pharmacy.printSettings.${props.tenantSlug}.reports`, JSON.stringify({ paper, paddingMm, fontScale, footerText }));
    } catch {}
  }, [paper, paddingMm, fontScale, footerText, props.tenantSlug]);

  const logoFullUrl = useMemo(() => {
    const logoUrl = tenant?.branding.logoUrl ?? null;
    return logoUrl ? `${apiBase}${logoUrl}` : null;
  }, [apiBase, tenant?.branding.logoUrl]);

  const isThermalPaper = isThermal(paper);
  const width = paper === "thermal58" ? "58mm" : "80mm";
  const scale = fontScale === "compact" ? 0.92 : fontScale === "large" ? 1.06 : 1;
  const cssVars = { ["--paper-width" as never]: width, ["--paper-padding" as never]: `${paddingMm}mm`, ["--font-scale" as never]: String(scale) };

  useEffect(() => {
    let cancelled = false;
    async function loadTenantId() {
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
    void loadTenantId();
    return () => {
      cancelled = true;
    };
  }, [props.tenantSlug]);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const params = new URLSearchParams();
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        if (locationId) params.set("locationId", locationId);

        const [tenantRes, settingsRes] = await Promise.all([
          apiFetch("/api/tenants/current", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch("/api/pharmacy/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);
        const tenantJson = (await tenantRes.json()) as TenantCurrentResponse;
        const settingsJson = (await settingsRes.json()) as ShopSettingsResponse;
        if (!tenantRes.ok || !tenantJson.data || !settingsRes.ok) {
          setErrorKey("errors.internal");
          return;
        }

        const p = params.toString();
        const [s1, s2, s3, s4, s5, s6, s7, s8] = await Promise.all([
          apiFetch(`/api/pharmacy/reports/sales-summary?${p}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/pharmacy/reports/cashflow-summary?${p}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/pharmacy/reports/payments-by-method?${p}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/pharmacy/reports/payments-by-method?${p}&direction=out`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/pharmacy/reports/top-products?${p}&limit=10`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/pharmacy/reports/low-stock?${new URLSearchParams({ threshold, limit: "20", ...(locationId ? { locationId } : {}) }).toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/pharmacy/reports/stock-valuation?${new URLSearchParams({ limit: "30", ...(locationId ? { locationId } : {}) }).toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/pharmacy/reports/profit-summary?${p}&limit=10`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);
        if (![s1, s2, s3, s4, s5, s6, s7, s8].every((r) => r.ok)) {
          setErrorKey("errors.internal");
          return;
        }

        if (!cancelled) {
          setTenant(tenantJson.data);
          setSellCurrencyCode(settingsJson.data.sellCurrencyCode ?? "USD");
          setBuyCurrencyCode(settingsJson.data.buyCurrencyCode ?? "USD");
          setSummary(((await s1.json()) as SalesSummaryResponse).data);
          setCashflow(((await s2.json()) as CashflowSummaryResponse).data);
          setPayments(((await s3.json()) as PaymentsByMethodResponse).data.items ?? []);
          setRefundPayouts(((await s4.json()) as PaymentsByMethodResponse).data.items ?? []);
          setTopProducts(((await s5.json()) as TopProductsResponse).data.items ?? []);
          setLowStock(((await s6.json()) as LowStockResponse).data.items ?? []);
          setValuation(((await s7.json()) as StockValuationResponse).data);
          setProfit(((await s8.json()) as ProfitSummaryResponse).data);
        }
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, [tenantId, from, to, locationId, threshold]);

  useEffect(() => {
    let cancelled = false;
    async function exportPdf() {
      if (!download || !tenantId) return;
      if (pdfExported) return;
      setExportingPdf(true);
      try {
        try {
          await apiFetch("/api/pharmacy/reports/export-log", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
            body: JSON.stringify({ reportId: "pharmacy.reports.standard.v1", format: "pdf", from, to, locationId: locationId || undefined, threshold })
          });
        } catch {}
        const paperEl = document.querySelector(".print-paper") as HTMLElement | null;
        if (!paperEl) return;
        const html2canvas = (await import("html2canvas")).default;
        const { jsPDF } = await import("jspdf");
        const canvas = await html2canvas(paperEl, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
        const imgData = canvas.toDataURL("image/png");
        const safeDate = new Date().toISOString().slice(0, 10);
        const filename = `pharmacy_reports_${safeDate}_${paperParamToFileSuffix(paper)}.pdf`;
        if (isThermal(paper)) {
          const widthMm = paper === "thermal58" ? 58 : 80;
          const heightMm = (canvas.height * widthMm) / canvas.width;
          const pdf = new jsPDF({ unit: "mm", format: [widthMm, heightMm] });
          pdf.addImage(imgData, "PNG", 0, 0, widthMm, heightMm);
          if (!cancelled) pdf.save(filename);
        } else {
          const pdf = new jsPDF({ unit: "mm", format: "a4" });
          const pageWidth = 210;
          const pageHeight = 297;
          const imgHeight = (canvas.height * pageWidth) / canvas.width;
          let heightLeft = imgHeight;
          let position = 0;
          pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
          heightLeft -= pageHeight;
          while (heightLeft > 0) {
            pdf.addPage();
            position = heightLeft - imgHeight;
            pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
            heightLeft -= pageHeight;
          }
          if (!cancelled) pdf.save(filename);
        }
        if (!cancelled) setPdfExported(true);
      } finally {
        if (!cancelled) setExportingPdf(false);
      }
    }
    void exportPdf();
    return () => {
      cancelled = true;
    };
  }, [download, paper, pdfExported, tenantId, from, to, locationId, threshold]);

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card text-sm text-gray-700">{t("common.loading")}</div>;
  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  if (!tenant) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t("errors.internal")}</div>;

  return (
    <div className="space-y-6">
      <div className="no-print rounded-2xl border border-gray-200 bg-white p-4 shadow-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-gray-700">{t("app.pharmacy.print.hint")}</div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm" value={paper} onChange={(e) => setPaper(e.target.value as Paper)} disabled={download}>
              <option value="thermal80">{t("app.shop.print.paper.thermal80")}</option>
              <option value="thermal58">{t("app.shop.print.paper.thermal58")}</option>
              <option value="a4">{t("app.shop.print.paper.a4")}</option>
            </select>
            <select className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm" value={String(paddingMm)} onChange={(e) => setPaddingMm(Number(e.target.value))} disabled={download}>
              <option value="6">{t("app.shop.print.padding.compact")}</option>
              <option value="10">{t("app.shop.print.padding.normal")}</option>
              <option value="14">{t("app.shop.print.padding.comfort")}</option>
            </select>
            <select className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm" value={fontScale} onChange={(e) => setFontScale(e.target.value as "compact" | "normal" | "large")} disabled={download}>
              <option value="compact">{t("app.shop.print.font.compact")}</option>
              <option value="normal">{t("app.shop.print.font.normal")}</option>
              <option value="large">{t("app.shop.print.font.large")}</option>
            </select>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60" onClick={() => window.print()} disabled={exportingPdf}>
              {t("app.shop.print.action.print")}
            </button>
          </div>
        </div>
      </div>

      <div className={["print-root", isThermalPaper ? "print-thermal" : "print-a4"].join(" ")} style={cssVars}>
        <style>{printCss}</style>
        <div className="print-paper">
          <div className={isThermalPaper ? "text-center" : ""}>
            <div className={["flex items-start gap-3", isThermalPaper ? "justify-center" : "justify-between"].join(" ")}>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-xl border border-gray-200 bg-white">
                  {logoFullUrl ? <Image alt="" src={logoFullUrl} crossOrigin="anonymous" unoptimized width={48} height={48} className="h-full w-full object-contain" /> : null}
                </div>
                <div className="min-w-0">
                  <div className="text-base font-semibold text-gray-900">{tenant.tenant.legalName?.trim() ? tenant.tenant.legalName : tenant.tenant.displayName}</div>
                  <div className="mt-1 text-xs text-gray-600">{t("app.pharmacy.reports.standard.title")}</div>
                  <div className="mt-1 text-xs text-gray-600">
                    {from} → {to}
                  </div>
                </div>
              </div>
              {!isThermalPaper ? (
                <div className="text-right text-xs text-gray-600">
                  {locationId ? `${t("app.shop.reports.filter.location")}: ${locationId}` : t("common.all")}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Box title={t("app.shop.reports.sales.title")}>
              <KV label={t("app.shop.reports.sales.invoicesCount")} value={String(summary?.invoicesCount ?? 0)} />
              <KV label={t("app.shop.reports.sales.subtotal")} value={formatMoney(summary?.subtotal ?? "0", sellCurrencyCode)} />
              <KV label={t("app.shop.reports.sales.paidTotal")} value={formatMoney(summary?.paidTotal ?? "0", sellCurrencyCode)} />
              <KV label={t("app.shop.reports.sales.outstanding")} value={formatMoney(summary?.outstanding ?? "0", sellCurrencyCode)} />
            </Box>

            <Box title={t("app.shop.reports.cashflow.title")}>
              <KV label={t("app.shop.reports.cashflow.cashIn")} value={formatMoney(cashflow?.cashIn ?? "0", sellCurrencyCode)} />
              <KV label={t("app.shop.reports.cashflow.cashOut")} value={formatMoney(cashflow?.cashOut ?? "0", sellCurrencyCode)} />
              <KV label={t("app.shop.reports.cashflow.net")} value={formatMoney(cashflow?.net ?? "0", sellCurrencyCode)} />
            </Box>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Box title={t("app.pharmacy.reports.profit.title")}>
              <KV label={t("app.pharmacy.reports.profit.revenue")} value={formatMoney(profit?.totals.revenue ?? "0", profit?.currencyCode ?? sellCurrencyCode)} />
              <KV label={t("app.pharmacy.reports.profit.cogs")} value={formatMoney(profit?.totals.cogs ?? "0", profit?.currencyCode ?? sellCurrencyCode)} />
              <KV label={t("app.pharmacy.reports.profit.grossProfit")} value={formatMoney(profit?.totals.grossProfit ?? "0", profit?.currencyCode ?? sellCurrencyCode)} />
              <KV label={t("app.pharmacy.reports.profit.margin")} value={`${profit?.totals.marginPct ?? "0"}%`} />
            </Box>

            <Box title={t("app.shop.reports.valuation.title")}>
              <KV label={t("app.shop.reports.valuation.total")} value={formatMoney(valuation?.totalValue ?? "0", buyCurrencyCode)} />
              <KV label={t("app.shop.reports.valuation.currency")} value={valuation?.currencyCode ?? buyCurrencyCode} />
            </Box>
          </div>

          <div className="mt-6">
            <SectionTitle>{t("app.shop.reports.paymentsIn.title")}</SectionTitle>
            <PrintTable header={[t("app.shop.reports.table.method"), t("app.shop.reports.table.count"), t("app.shop.reports.table.total")]}>
              {payments.slice(0, isThermalPaper ? 10 : 25).map((p) => (
                <tr key={p.method} className="border-b border-gray-100">
                  <td className="py-2 pr-3 text-xs text-gray-900">{p.method}</td>
                  <td className="py-2 pr-3 text-xs text-gray-700 tabular">{p.paymentsCount}</td>
                  <td className="py-2 text-xs font-medium text-gray-900 tabular">{formatMoney(p.totalAmount, sellCurrencyCode)}</td>
                </tr>
              ))}
            </PrintTable>
          </div>

          <div className="mt-6">
            <SectionTitle>{t("app.shop.reports.paymentsOut.title")}</SectionTitle>
            <PrintTable header={[t("app.shop.reports.table.method"), t("app.shop.reports.table.count"), t("app.shop.reports.table.total")]}>
              {refundPayouts.slice(0, isThermalPaper ? 10 : 25).map((p) => (
                <tr key={p.method} className="border-b border-gray-100">
                  <td className="py-2 pr-3 text-xs text-gray-900">{p.method}</td>
                  <td className="py-2 pr-3 text-xs text-gray-700 tabular">{p.paymentsCount}</td>
                  <td className="py-2 text-xs font-medium text-gray-900 tabular">{formatMoney(p.totalAmount, sellCurrencyCode)}</td>
                </tr>
              ))}
            </PrintTable>
          </div>

          <div className="mt-6">
            <SectionTitle>{t("app.shop.reports.topProducts.title")}</SectionTitle>
            <PrintTable header={[t("app.shop.reports.table.product"), t("app.shop.reports.table.qty"), t("app.shop.reports.table.total")]}>
              {topProducts.slice(0, isThermalPaper ? 10 : 25).map((r) => (
                <tr key={r.product.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3 text-xs text-gray-900">
                    <div className="font-medium">{r.product.name}</div>
                    <div className="mt-1 text-[10px] text-gray-500">{r.product.sku ?? "—"}</div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-700 tabular">{r.quantity}</td>
                  <td className="py-2 text-xs font-medium text-gray-900 tabular">{formatMoney(r.total, sellCurrencyCode)}</td>
                </tr>
              ))}
            </PrintTable>
          </div>

          <div className="mt-6">
            <SectionTitle>{t("app.shop.reports.lowStock.title")}</SectionTitle>
            <PrintTable header={[t("app.shop.reports.table.product"), t("app.shop.reports.table.location"), t("app.shop.reports.table.onHand")]}>
              {lowStock.slice(0, isThermalPaper ? 12 : 30).map((r) => (
                <tr key={`${r.product.id}:${r.location?.id ?? ""}`} className="border-b border-gray-100">
                  <td className="py-2 pr-3 text-xs text-gray-900">
                    <div className="font-medium">{r.product.name}</div>
                    <div className="mt-1 text-[10px] text-gray-500">{r.product.sku ?? "—"}</div>
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-700">{r.location?.name ?? "—"}</td>
                  <td className="py-2 text-xs font-medium text-gray-900 tabular">{r.onHandQty}</td>
                </tr>
              ))}
            </PrintTable>
          </div>

          <div className={isThermalPaper ? "mt-6 border-t border-dashed border-gray-300 pt-3 text-center text-xs text-gray-600" : "mt-10 text-center text-xs text-gray-600"}>
            {(footerText?.trim() ? footerText.trim() : t("app.shop.print.thanks")) || " "}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle(props: { children: React.ReactNode }) {
  return <div className="mb-2 text-sm font-semibold text-gray-900">{props.children}</div>;
}

function Box(props: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="text-sm font-semibold text-gray-900">{props.title}</div>
      <div className="mt-3 space-y-2">{props.children}</div>
    </div>
  );
}

function KV(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-xs text-gray-600">{props.label}</div>
      <div className="text-xs font-semibold text-gray-900 tabular">{props.value}</div>
    </div>
  );
}

function PrintTable(props: { header: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200">
      <table className="w-full text-left">
        <thead className="bg-white">
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
  );
}

const printCss = `
.print-root { background: transparent; }
.print-paper { background: white; color: #111827; border: 1px solid #E5E7EB; border-radius: 16px; padding: var(--paper-padding, 10mm); transform: scale(var(--font-scale, 1)); transform-origin: top center; }
.print-thermal .print-paper { width: var(--paper-width, 80mm); margin: 0 auto; border-radius: 10px; }
.print-a4 .print-paper { max-width: 210mm; margin: 0 auto; }
.tabular { font-variant-numeric: tabular-nums; }
.no-print { }
@media print {
  body * { visibility: hidden !important; }
  .print-paper, .print-paper * { visibility: visible !important; }
  .print-paper { position: absolute; left: 0; top: 0; }
  .no-print { display: none !important; }
  body { background: white !important; }
  .print-paper { border: none !important; border-radius: 0 !important; padding: 0 !important; }
  .print-thermal .print-paper { width: var(--paper-width, 80mm) !important; }
  @page { margin: 10mm; }
}
`;
