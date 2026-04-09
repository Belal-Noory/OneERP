"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { getApiBaseUrl } from "@/lib/api";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = {
  data: {
    memberships: { tenantId: string; tenantSlug: string }[];
  };
};

type TenantCurrentResponse = {
  data: {
    tenant: { id: string; slug: string; legalName: string; displayName: string; defaultLocale: string; status: string };
    branding: { logoUrl: string | null; address: string | null; phone: string | null; email: string | null };
  } | null;
};

type SalesSummaryResponse = {
  data: { invoicesCount: number; subtotal: string; paidTotal: string; outstanding: string };
};

type CashflowSummaryResponse = {
  data: { cashIn: string; cashOut: string; net: string };
};

type PaymentsByMethodResponse = {
  data: { items: { method: string; paymentsCount: number; totalAmount: string }[] };
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

export function PrintReportsClient(props: { tenantSlug: string }) {
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

  const [from, setFrom] = useState(() => {
    if (initialFrom) return initialFrom;
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return isoDate(d);
  });
  const [to, setTo] = useState(() => (initialTo ? initialTo : isoDate(new Date())));
  const [locationId] = useState(() => initialLocationId?.trim() || null);
  const [threshold] = useState(() => initialThreshold?.trim() || null);

  const [summary, setSummary] = useState<SalesSummaryResponse["data"] | null>(null);
  const [cashflow, setCashflow] = useState<CashflowSummaryResponse["data"] | null>(null);
  const [paymentsIn, setPaymentsIn] = useState<PaymentsByMethodResponse["data"]["items"]>([]);
  const [refundPayouts, setRefundPayouts] = useState<PaymentsByMethodResponse["data"]["items"]>([]);
  const [topProducts, setTopProducts] = useState<TopProductsResponse["data"]["items"]>([]);
  const [lowStock, setLowStock] = useState<LowStockResponse["data"]["items"]>([]);
  const [valuation, setValuation] = useState<StockValuationResponse["data"] | null>(null);

  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfExported, setPdfExported] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`oneerp.shop.printSettings.${props.tenantSlug}`);
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
      localStorage.setItem(`oneerp.shop.printSettings.${props.tenantSlug}`, JSON.stringify({ paper, paddingMm, fontScale, footerText }));
    } catch {}
  }, [paper, paddingMm, fontScale, footerText, props.tenantSlug]);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", new Date(to + "T23:59:59.999Z").toISOString());
    return p;
  }, [from, to]);

  const logoFullUrl = useMemo(() => {
    const logoUrl = tenant?.branding.logoUrl ?? null;
    return logoUrl ? `${apiBase}${logoUrl}` : null;
  }, [apiBase, tenant?.branding.logoUrl]);

  const isThermalPaper = isThermal(paper);
  const width = paper === "thermal58" ? "58mm" : "80mm";
  const scale = fontScale === "compact" ? 0.92 : fontScale === "large" ? 1.06 : 1;
  const cssVars = {
    ["--paper-width" as never]: width,
    ["--paper-padding" as never]: `${paddingMm}mm`,
    ["--font-scale" as never]: String(scale)
  };

  const [sellCurrencyCode, setSellCurrencyCode] = useState("USD");
  const [buyCurrencyCode, setBuyCurrencyCode] = useState("USD");

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
        const lowParams = new URLSearchParams();
        if (threshold) lowParams.set("threshold", threshold);
        if (locationId) lowParams.set("locationId", locationId);
        lowParams.set("limit", "2000");

        const valuationParams = new URLSearchParams();
        if (locationId) valuationParams.set("locationId", locationId);
        valuationParams.set("limit", "50");

        const [tenantRes, settingsRes, sumRes, cashRes, payRes, refundRes, topRes, lowRes, valuationRes] = await Promise.all([
          apiFetch("/api/tenants/current", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch("/api/shop/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/reports/sales-summary?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/reports/cashflow-summary?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/reports/payments-by-method?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/reports/payments-by-method?${queryParams.toString()}&direction=out`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/reports/top-products?${queryParams.toString()}&limit=20`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/reports/low-stock?${lowParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/reports/stock-valuation?${valuationParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);

        const tenantJson = (await tenantRes.json()) as TenantCurrentResponse;
        if (!tenantRes.ok || !tenantJson.data) {
          setErrorKey("errors.internal");
          return;
        }
        if (!settingsRes.ok || !sumRes.ok || !cashRes.ok || !payRes.ok || !refundRes.ok || !topRes.ok || !lowRes.ok || !valuationRes.ok) {
          setErrorKey("errors.internal");
          return;
        }

        const settingsJson = (await settingsRes.json()) as ShopSettingsResponse;
        const sumJson = (await sumRes.json()) as SalesSummaryResponse;
        const cashJson = (await cashRes.json()) as CashflowSummaryResponse;
        const payJson = (await payRes.json()) as PaymentsByMethodResponse;
        const refundJson = (await refundRes.json()) as PaymentsByMethodResponse;
        const topJson = (await topRes.json()) as TopProductsResponse;
        const lowJson = (await lowRes.json()) as LowStockResponse;
        const valuationJson = (await valuationRes.json()) as StockValuationResponse;

        if (!cancelled) {
          setTenant(tenantJson.data);
          setSellCurrencyCode(settingsJson.data.sellCurrencyCode ?? "USD");
          setBuyCurrencyCode(settingsJson.data.buyCurrencyCode ?? "USD");
          setSummary(sumJson.data);
          setCashflow(cashJson.data);
          setPaymentsIn(payJson.data.items ?? []);
          setRefundPayouts(refundJson.data.items ?? []);
          setTopProducts(topJson.data.items ?? []);
          setLowStock(lowJson.data.items ?? []);
          setValuation(valuationJson.data);
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
  }, [tenantId, queryParams, locationId, threshold]);

  useEffect(() => {
    let cancelled = false;
    async function exportPdf() {
      if (!download || !tenant || !summary || !cashflow) return;
      if (pdfExported) return;
      if (!tenantId) return;
      setExportingPdf(true);
      try {
        await apiFetch("/api/shop/reports/export-log", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
          body: JSON.stringify({
            reportId: "shop.reports.v1",
            format: "pdf",
            from: from ? new Date(from).toISOString() : undefined,
            to: to ? new Date(to + "T23:59:59.999Z").toISOString() : undefined,
            locationId: locationId ?? undefined,
            threshold: threshold ?? undefined
          })
        });
      } catch {}
      try {
        const paperEl = document.querySelector(".print-paper") as HTMLElement | null;
        if (!paperEl) return;

        const html2canvas = (await import("html2canvas")).default;
        const { jsPDF } = await import("jspdf");

        const canvas = await html2canvas(paperEl, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
        const imgData = canvas.toDataURL("image/png");

        const filename = `shop_reports_${from}_${to}_${paperParamToFileSuffix(paper)}.pdf`;
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
  }, [download, tenant, tenantId, summary, cashflow, paper, pdfExported, from, to, locationId, threshold]);

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card text-sm text-gray-700">Loading…</div>;
  }
  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }
  if (!tenant || !summary || !cashflow) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t("errors.internal")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="no-print rounded-2xl border border-gray-200 bg-white p-4 shadow-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-gray-700">{t("app.shop.print.hint")}</div>
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
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700" onClick={() => window.print()} disabled={exportingPdf}>
              {t("app.shop.print.action.print")}
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.reports.filter.from")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={download} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.reports.filter.to")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={download} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.print.footer.label")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder={t("app.shop.print.footer.placeholder")} disabled={download} />
          </div>
        </div>
      </div>

      <div className={["print-root", isThermalPaper ? "print-thermal" : "print-a4"].join(" ")} style={cssVars}>
        <style>{printCss}</style>

        <div className="print-paper">
          <Header
            t={t}
            logoUrl={logoFullUrl}
            displayName={tenant.tenant.displayName}
            legalName={tenant.tenant.legalName}
            address={tenant.branding.address}
            phone={tenant.branding.phone}
            email={tenant.branding.email}
            from={from}
            to={to}
            format={isThermalPaper ? "thermal" : "a4"}
          />

          <div className={isThermalPaper ? "mt-4 text-xs" : "mt-6"}>
            <div className={isThermalPaper ? "border-t border-dashed border-gray-300 pt-3" : "grid gap-3 md:grid-cols-3"}>
              <Kpi t={t} label={t("app.shop.reports.kpi.sales")} value={formatMoney(summary.subtotal, sellCurrencyCode)} />
              <Kpi t={t} label={t("app.shop.reports.kpi.cashIn")} value={formatMoney(cashflow.cashIn, sellCurrencyCode)} />
              <Kpi t={t} label={t("app.shop.reports.kpi.net")} value={formatMoney(cashflow.net, sellCurrencyCode)} />
            </div>
          </div>

          {isThermalPaper ? (
            <ThermalTables
              t={t}
              sellCurrency={sellCurrencyCode}
              buyCurrency={buyCurrencyCode}
              paymentsIn={paymentsIn}
              refundPayouts={refundPayouts}
              topProducts={topProducts}
              lowStock={lowStock}
              valuation={valuation}
            />
          ) : (
            <A4Tables
              t={t}
              sellCurrency={sellCurrencyCode}
              buyCurrency={buyCurrencyCode}
              paymentsIn={paymentsIn}
              refundPayouts={refundPayouts}
              topProducts={topProducts}
              lowStock={lowStock}
              valuation={valuation}
            />
          )}

          <div className={isThermalPaper ? "mt-4 border-t border-dashed border-gray-300 pt-3 text-center text-xs text-gray-600" : "mt-6 text-center text-xs text-gray-600"}>
            {(footerText?.trim() ? footerText.trim() : t("app.shop.print.thanks")) || " "}
          </div>
        </div>
      </div>
    </div>
  );
}

function Header(props: {
  t: (k: string) => string;
  logoUrl: string | null;
  displayName: string;
  legalName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  from: string;
  to: string;
  format: "a4" | "thermal";
}) {
  const companyLine = props.legalName?.trim() ? props.legalName : props.displayName;
  const periodLabel = `${props.from} → ${props.to}`;
  return (
    <div className={props.format === "thermal" ? "text-center" : ""}>
      <div className={["flex items-start gap-3", props.format === "thermal" ? "justify-center" : "justify-between"].join(" ")}>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {props.logoUrl ? (
              <Image alt="" src={props.logoUrl} crossOrigin="anonymous" unoptimized width={48} height={48} className="h-full w-full object-contain" />
            ) : null}
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold text-gray-900">{companyLine}</div>
            {props.address ? <div className="mt-1 text-xs text-gray-600">{props.address}</div> : null}
            <div className="mt-1 text-xs text-gray-600">
              {props.phone ? `${props.phone}` : ""}
              {props.phone && props.email ? " • " : ""}
              {props.email ? props.email : ""}
            </div>
          </div>
        </div>

        {props.format === "a4" ? (
          <div className="text-right text-sm">
            <div className="text-xs font-medium text-gray-600">{props.t("app.shop.reports.export.printTitle")}</div>
            <div className="mt-1 text-xs text-gray-600">
              {props.t("app.shop.customerStatement.period")}: <span className="font-medium text-gray-900">{periodLabel}</span>
            </div>
            <div className="mt-1 text-xs text-gray-600">{new Date().toLocaleString()}</div>
          </div>
        ) : null}
      </div>

      {props.format === "thermal" ? (
        <div className="mt-3 border-t border-dashed border-gray-300 pt-3 text-xs text-gray-700">
          <div className="font-semibold text-gray-900">{props.t("app.shop.reports.export.printTitle")}</div>
          <div className="mt-1">
            {props.t("app.shop.customerStatement.period")}: <span className="font-medium text-gray-900">{periodLabel}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Kpi(props: { t: (k: string) => string; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium text-gray-600">{props.label}</div>
      <div className="mt-2 text-lg font-semibold text-gray-900">{props.value}</div>
    </div>
  );
}

function A4Tables(props: {
  t: (k: string) => string;
  sellCurrency: string;
  buyCurrency: string;
  paymentsIn: PaymentsByMethodResponse["data"]["items"];
  refundPayouts: PaymentsByMethodResponse["data"]["items"];
  topProducts: TopProductsResponse["data"]["items"];
  lowStock: LowStockResponse["data"]["items"];
  valuation: StockValuationResponse["data"] | null;
}) {
  return (
    <div className="mt-6 space-y-6">
      <TableBlock title={props.t("app.shop.reports.paymentsByMethod.title")}>
        <MethodTable t={props.t} items={props.paymentsIn} currency={props.sellCurrency} />
      </TableBlock>
      <TableBlock title={props.t("app.shop.reports.refundPayoutsByMethod.title")}>
        <MethodTable t={props.t} items={props.refundPayouts} currency={props.sellCurrency} />
      </TableBlock>
      <TableBlock title={props.t("app.shop.reports.topProducts.title")}>
        <TopProductsTable t={props.t} items={props.topProducts} currency={props.sellCurrency} />
      </TableBlock>
      <TableBlock title={props.t("app.shop.reports.stockValuation.title")}>
        <StockValuationTable t={props.t} items={props.valuation?.items ?? []} currency={props.buyCurrency} />
      </TableBlock>
      <TableBlock title={props.t("app.shop.reports.lowStock.title")}>
        <LowStockTable t={props.t} items={props.lowStock} />
      </TableBlock>
    </div>
  );
}

function ThermalTables(props: {
  t: (k: string) => string;
  sellCurrency: string;
  buyCurrency: string;
  paymentsIn: PaymentsByMethodResponse["data"]["items"];
  refundPayouts: PaymentsByMethodResponse["data"]["items"];
  topProducts: TopProductsResponse["data"]["items"];
  lowStock: LowStockResponse["data"]["items"];
  valuation: StockValuationResponse["data"] | null;
}) {
  return (
    <div className="mt-4 text-xs">
      <div className="mt-4 border-t border-dashed border-gray-300 pt-3">
        <div className="text-sm font-semibold text-gray-900">{props.t("app.shop.reports.paymentsByMethod.title")}</div>
        <ThermalMethodList t={props.t} items={props.paymentsIn} currency={props.sellCurrency} />
      </div>
      <div className="mt-4 border-t border-dashed border-gray-300 pt-3">
        <div className="text-sm font-semibold text-gray-900">{props.t("app.shop.reports.refundPayoutsByMethod.title")}</div>
        <ThermalMethodList t={props.t} items={props.refundPayouts} currency={props.sellCurrency} />
      </div>
      <div className="mt-4 border-t border-dashed border-gray-300 pt-3">
        <div className="text-sm font-semibold text-gray-900">{props.t("app.shop.reports.topProducts.title")}</div>
        <ThermalTopProducts t={props.t} items={props.topProducts} currency={props.sellCurrency} />
      </div>
      <div className="mt-4 border-t border-dashed border-gray-300 pt-3">
        <div className="text-sm font-semibold text-gray-900">{props.t("app.shop.reports.stockValuation.title")}</div>
        <ThermalStockValuation t={props.t} items={props.valuation?.items ?? []} currency={props.buyCurrency} />
      </div>
      <div className="mt-4 border-t border-dashed border-gray-300 pt-3">
        <div className="text-sm font-semibold text-gray-900">{props.t("app.shop.reports.lowStock.title")}</div>
        <ThermalLowStock t={props.t} items={props.lowStock} />
      </div>
    </div>
  );
}

function StockValuationTable(props: { t: (k: string) => string; items: StockValuationResponse["data"]["items"]; currency: string }) {
  return (
    <table className="min-w-[820px] w-full border-separate border-spacing-0 text-sm">
      <thead>
        <tr>
          <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{props.t("app.shop.reports.stockValuation.product")}</th>
          <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{props.t("app.shop.reports.stockValuation.location")}</th>
          <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{props.t("app.shop.reports.stockValuation.onHand")}</th>
          <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{props.t("app.shop.reports.stockValuation.costPrice")}</th>
          <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{props.t("app.shop.reports.stockValuation.value")}</th>
        </tr>
      </thead>
      <tbody>
        {props.items.length === 0 ? (
          <tr>
            <td className="px-4 py-6 text-gray-600" colSpan={5}>
              {props.t("app.shop.reports.stockValuation.empty")}
            </td>
          </tr>
        ) : (
          props.items.map((i) => (
            <tr key={`${i.product.id}-${i.location?.id ?? "none"}`}>
              <td className="border-b border-gray-100 px-4 py-3">
                <div className="font-medium text-gray-900">{i.product.name}</div>
                <div className="mt-1 text-xs text-gray-500">{i.product.sku ?? "—"}</div>
              </td>
              <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{i.location?.name ?? "—"}</td>
              <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900">{i.onHandQty}</td>
              <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900">{formatMoney(i.costPrice, props.currency)}</td>
              <td className="border-b border-gray-100 px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(i.value, props.currency)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function ThermalStockValuation(props: { t: (k: string) => string; items: StockValuationResponse["data"]["items"]; currency: string }) {
  if (props.items.length === 0) return <div className="mt-2 text-gray-600">{props.t("app.shop.reports.stockValuation.empty")}</div>;
  return (
    <div className="mt-2 space-y-2">
      {props.items.slice(0, 40).map((i) => (
        <div key={`${i.product.id}-${i.location?.id ?? "none"}`} className="thermal-row">
          <div className="thermal-row-top">
            <div className="min-w-0 font-medium text-gray-900">{i.product.name}</div>
            <div className="shrink-0 text-right font-medium text-gray-900">{formatMoney(i.value, props.currency)}</div>
          </div>
          <div className="mt-1 thermal-row-sub text-gray-600">
            {props.t("app.shop.reports.stockValuation.onHand")}: <span className="tabular">{i.onHandQty}</span>
            {i.location?.name ? ` · ${i.location.name}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

function TableBlock(props: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="text-lg font-semibold text-gray-900">{props.title}</div>
      <div className="mt-4 overflow-x-auto">{props.children}</div>
    </div>
  );
}

function MethodTable(props: { t: (k: string) => string; items: PaymentsByMethodResponse["data"]["items"]; currency: string }) {
  return (
    <table className="min-w-[520px] w-full border-separate border-spacing-0 text-sm">
      <thead>
        <tr>
          <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{props.t("app.shop.reports.paymentsByMethod.method")}</th>
          <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{props.t("app.shop.reports.paymentsByMethod.count")}</th>
          <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{props.t("app.shop.reports.paymentsByMethod.total")}</th>
        </tr>
      </thead>
      <tbody>
        {props.items.length === 0 ? (
          <tr>
            <td className="px-4 py-6 text-gray-600" colSpan={3}>
              {props.t("app.shop.reports.empty")}
            </td>
          </tr>
        ) : (
          props.items.map((p) => (
            <tr key={p.method}>
              <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{p.method}</td>
              <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-700">{p.paymentsCount}</td>
              <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900">{formatMoney(p.totalAmount, props.currency)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function TopProductsTable(props: { t: (k: string) => string; items: TopProductsResponse["data"]["items"]; currency: string }) {
  return (
    <table className="min-w-[640px] w-full border-separate border-spacing-0 text-sm">
      <thead>
        <tr>
          <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{props.t("app.shop.reports.topProducts.product")}</th>
          <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{props.t("app.shop.reports.topProducts.qty")}</th>
          <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{props.t("app.shop.reports.topProducts.total")}</th>
        </tr>
      </thead>
      <tbody>
        {props.items.length === 0 ? (
          <tr>
            <td className="px-4 py-6 text-gray-600" colSpan={3}>
              {props.t("app.shop.reports.empty")}
            </td>
          </tr>
        ) : (
          props.items.map((r) => (
            <tr key={r.product.id}>
              <td className="border-b border-gray-100 px-4 py-3">
                <div className="font-medium text-gray-900">{r.product.name}</div>
                <div className="mt-1 text-xs text-gray-500">{r.product.sku ?? "—"}</div>
              </td>
              <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-700">{r.quantity}</td>
              <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900">{formatMoney(r.total, props.currency)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function LowStockTable(props: { t: (k: string) => string; items: LowStockResponse["data"]["items"] }) {
  return (
    <table className="min-w-[760px] w-full border-separate border-spacing-0 text-sm">
      <thead>
        <tr>
          <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{props.t("app.shop.reports.lowStock.product")}</th>
          <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{props.t("app.shop.reports.lowStock.location")}</th>
          <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{props.t("app.shop.reports.lowStock.onHand")}</th>
        </tr>
      </thead>
      <tbody>
        {props.items.length === 0 ? (
          <tr>
            <td className="px-4 py-6 text-gray-600" colSpan={3}>
              {props.t("app.shop.reports.lowStock.empty")}
            </td>
          </tr>
        ) : (
          props.items.map((i) => (
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
  );
}

function ThermalMethodList(props: { t: (k: string) => string; items: PaymentsByMethodResponse["data"]["items"]; currency: string }) {
  if (props.items.length === 0) return <div className="mt-2 text-gray-600">{props.t("app.shop.reports.empty")}</div>;
  return (
    <div className="mt-2 space-y-2">
      {props.items.map((p) => (
        <div key={p.method} className="thermal-row">
          <div className="thermal-row-top">
            <div className="min-w-0 font-medium text-gray-900">{p.method}</div>
            <div className="shrink-0 text-right font-medium text-gray-900">{formatMoney(p.totalAmount, props.currency)}</div>
          </div>
          <div className="mt-1 thermal-row-sub text-gray-600">
            {props.t("app.shop.reports.paymentsByMethod.count")}: <span className="tabular">{p.paymentsCount}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ThermalTopProducts(props: { t: (k: string) => string; items: TopProductsResponse["data"]["items"]; currency: string }) {
  if (props.items.length === 0) return <div className="mt-2 text-gray-600">{props.t("app.shop.reports.empty")}</div>;
  return (
    <div className="mt-2 space-y-2">
      {props.items.map((r) => (
        <div key={r.product.id} className="thermal-row">
          <div className="thermal-row-top">
            <div className="min-w-0 font-medium text-gray-900">{r.product.name}</div>
            <div className="shrink-0 text-right font-medium text-gray-900">{formatMoney(r.total, props.currency)}</div>
          </div>
          <div className="mt-1 thermal-row-sub text-gray-600">
            {props.t("app.shop.reports.topProducts.qty")}: <span className="tabular">{r.quantity}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ThermalLowStock(props: { t: (k: string) => string; items: LowStockResponse["data"]["items"] }) {
  if (props.items.length === 0) return <div className="mt-2 text-gray-600">{props.t("app.shop.reports.lowStock.empty")}</div>;
  return (
    <div className="mt-2 space-y-2">
      {props.items.slice(0, 80).map((i) => (
        <div key={`${i.product.id}-${i.location?.id ?? "none"}`} className="thermal-row">
          <div className="thermal-row-top">
            <div className="min-w-0 font-medium text-gray-900">{i.product.name}</div>
            <div className="shrink-0 text-right font-medium text-gray-900">{i.onHandQty}</div>
          </div>
          <div className="mt-1 thermal-row-sub text-gray-600">{i.location?.name ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}

const printCss = `
.print-root { background: transparent; }
.print-paper { background: white; color: #111827; border: 1px solid #E5E7EB; border-radius: 16px; padding: var(--paper-padding, 10mm); transform: scale(var(--font-scale, 1)); transform-origin: top center; }
.print-thermal .print-paper { width: var(--paper-width, 80mm); margin: 0 auto; border-radius: 10px; }
.print-a4 .print-paper { max-width: 210mm; margin: 0 auto; }
.tabular { font-variant-numeric: tabular-nums; }
.thermal-head { display: grid; grid-template-columns: 1fr auto; gap: 8px; }
.thermal-row { border-bottom: 1px dashed #E5E7EB; padding-bottom: 8px; }
.thermal-row-top { display: grid; grid-template-columns: 1fr auto; gap: 10px; align-items: start; }
.thermal-row-sub { line-height: 1.35; }
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
