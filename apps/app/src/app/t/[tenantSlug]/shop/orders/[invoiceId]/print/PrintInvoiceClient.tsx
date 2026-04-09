"use client";

import { useEffect, useMemo, useState } from "react";
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

type InvoiceLine = {
  product: { id: string; name: string; sku: string | null; unit: { id: string; name: string; symbol: string | null } | null };
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  discountAmount: string;
  netTotal: string;
};

type InvoicePayment = { id: string; method: string; amount: string; note: string | null; createdAt: string };

type InvoiceResponse = {
  data: {
    id: string;
    kind: "sale" | "refund";
    status: "draft" | "posted" | "void";
    invoiceNumber: string | null;
    refundOf: { id: string; invoiceNumber: string | null } | null;
    currencyCode: string;
    notes: string | null;
    grossSubtotal: string;
    invoiceDiscountAmount: string;
    discountTotal: string;
    taxEnabled: boolean;
    taxRate: string;
    taxTotal: string;
    roundingAdjustment: string;
    subtotal: string;
    paidTotal: string;
    createdAt: string;
    postedAt: string | null;
    customer: { id: string; name: string } | null;
    location: { id: string; name: string } | null;
    lines: InvoiceLine[];
    payments: InvoicePayment[];
  };
};

type Paper = "a4" | "thermal80" | "thermal58";

export function PrintInvoiceClient(props: { tenantSlug: string; invoiceId: string }) {
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

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantCurrentResponse["data"]>(null);
  const [invoice, setInvoice] = useState<InvoiceResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [paper, setPaper] = useState<Paper>(initialPaper);
  const [paddingMm, setPaddingMm] = useState(10);
  const [fontScale, setFontScale] = useState<"compact" | "normal" | "large">("normal");
  const [showSku, setShowSku] = useState(true);
  const [showUnit, setShowUnit] = useState(true);
  const [nameWrap, setNameWrap] = useState<"wrap" | "single">("wrap");
  const [footerText, setFooterText] = useState("");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfExported, setPdfExported] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`oneerp.shop.printSettings.${props.tenantSlug}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{
        paper: Paper;
        paddingMm: number;
        fontScale: "compact" | "normal" | "large";
        showSku: boolean;
        showUnit: boolean;
        nameWrap: "wrap" | "single";
        footerText: string;
      }>;
      if (parsed.paper === "a4" || parsed.paper === "thermal58" || parsed.paper === "thermal80") setPaper(parsed.paper);
      if (typeof parsed.paddingMm === "number" && parsed.paddingMm >= 0 && parsed.paddingMm <= 20) setPaddingMm(parsed.paddingMm);
      if (parsed.fontScale === "compact" || parsed.fontScale === "normal" || parsed.fontScale === "large") setFontScale(parsed.fontScale);
      if (typeof parsed.showSku === "boolean") setShowSku(parsed.showSku);
      if (typeof parsed.showUnit === "boolean") setShowUnit(parsed.showUnit);
      if (parsed.nameWrap === "wrap" || parsed.nameWrap === "single") setNameWrap(parsed.nameWrap);
      if (typeof parsed.footerText === "string") setFooterText(parsed.footerText);
    } catch {}
  }, [props.tenantSlug]);

  useEffect(() => {
    try {
      localStorage.setItem(
        `oneerp.shop.printSettings.${props.tenantSlug}`,
        JSON.stringify({ paper, paddingMm, fontScale, showSku, showUnit, nameWrap, footerText })
      );
    } catch {}
  }, [paper, paddingMm, fontScale, showSku, showUnit, nameWrap, footerText, props.tenantSlug]);

  const logoFullUrl = useMemo(() => {
    const logoUrl = tenant?.branding.logoUrl ?? null;
    return logoUrl ? `${apiBase}${logoUrl}` : null;
  }, [apiBase, tenant?.branding.logoUrl]);

  const balance = useMemo(() => {
    const subtotal = Number(invoice?.subtotal ?? "0");
    const paid = Number(invoice?.paidTotal ?? "0");
    if (!Number.isFinite(subtotal) || !Number.isFinite(paid)) return "0.00";
    return Math.max(0, subtotal - paid).toFixed(2);
  }, [invoice?.paidTotal, invoice?.subtotal]);

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
        const [tenantRes, invoiceRes] = await Promise.all([
          apiFetch("/api/tenants/current", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/invoices/${props.invoiceId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);

        const tenantJson = (await tenantRes.json()) as TenantCurrentResponse;
        const invoiceJson = (await invoiceRes.json()) as InvoiceResponse | { error?: { message_key?: string } };

        if (!tenantRes.ok || !tenantJson.data) {
          setErrorKey("errors.internal");
          return;
        }
        if (!invoiceRes.ok) {
          setErrorKey((invoiceJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }

        if (!cancelled) {
          setTenant(tenantJson.data);
          setInvoice((invoiceJson as InvoiceResponse).data);
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
  }, [tenantId, props.invoiceId]);

  useEffect(() => {
    let cancelled = false;
    async function exportPdf() {
      if (!download || !invoice || !tenant) return;
      if (pdfExported) return;
      setExportingPdf(true);
      try {
        const paperEl = document.querySelector(".print-paper") as HTMLElement | null;
        if (!paperEl) return;

        const html2canvas = (await import("html2canvas")).default;
        const { jsPDF } = await import("jspdf");

        const canvas = await html2canvas(paperEl, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
        const imgData = canvas.toDataURL("image/png");

        const safeNumber = (invoice.invoiceNumber ?? "invoice").replaceAll("/", "-");
        const filename = `${safeNumber}-${paperParamToFileSuffix(paper)}.pdf`;

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
  }, [download, invoice, tenant, paper, pdfExported]);

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card text-sm text-gray-700">Loading…</div>;
  }
  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }
  if (!invoice || !tenant) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card text-sm text-gray-700">—</div>;
  }

  const currency = invoice.currencyCode;
  const dateLabel = invoice.postedAt ?? invoice.createdAt;
  const isThermalPaper = isThermal(paper);
  const width = paper === "thermal58" ? "58mm" : "80mm";
  const scale = fontScale === "compact" ? 0.92 : fontScale === "large" ? 1.06 : 1;
  const cssVars = {
    ["--paper-width" as never]: width,
    ["--paper-padding" as never]: `${paddingMm}mm`,
    ["--font-scale" as never]: String(scale)
  };

  return (
    <div className="space-y-6">
      <div className="no-print rounded-2xl border border-gray-200 bg-white p-4 shadow-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-gray-700">{t("app.shop.print.hint")}</div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm"
              value={paper}
              onChange={(e) => setPaper(e.target.value as Paper)}
              disabled={download}
            >
              <option value="thermal80">{t("app.shop.print.paper.thermal80")}</option>
              <option value="thermal58">{t("app.shop.print.paper.thermal58")}</option>
              <option value="a4">{t("app.shop.print.paper.a4")}</option>
            </select>
            <select
              className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm"
              value={String(paddingMm)}
              onChange={(e) => setPaddingMm(Number(e.target.value))}
              disabled={download}
            >
              <option value="6">{t("app.shop.print.padding.compact")}</option>
              <option value="10">{t("app.shop.print.padding.normal")}</option>
              <option value="14">{t("app.shop.print.padding.comfort")}</option>
            </select>
            <select
              className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm"
              value={fontScale}
              onChange={(e) => setFontScale(e.target.value as "compact" | "normal" | "large")}
              disabled={download}
            >
              <option value="compact">{t("app.shop.print.font.compact")}</option>
              <option value="normal">{t("app.shop.print.font.normal")}</option>
              <option value="large">{t("app.shop.print.font.large")}</option>
            </select>
            <select
              className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm"
              value={nameWrap}
              onChange={(e) => setNameWrap(e.target.value as "wrap" | "single")}
              disabled={download}
            >
              <option value="wrap">{t("app.shop.print.wrap.wrap")}</option>
              <option value="single">{t("app.shop.print.wrap.single")}</option>
            </select>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700"
              onClick={() => window.print()}
              disabled={exportingPdf}
            >
              {t("app.shop.print.action.print")}
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="h-4 w-4" checked={showSku} onChange={(e) => setShowSku(e.target.checked)} disabled={download} />
              {t("app.shop.print.showSku")}
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="h-4 w-4" checked={showUnit} onChange={(e) => setShowUnit(e.target.checked)} disabled={download} />
              {t("app.shop.print.showUnit")}
            </label>
            <button
              type="button"
              disabled={download}
              className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => {
                try {
                  localStorage.removeItem(`oneerp.shop.printSettings.${props.tenantSlug}`);
                } catch {}
                setPaper(initialPaper);
                setPaddingMm(10);
                setFontScale("normal");
                setShowSku(true);
                setShowUnit(true);
                setNameWrap("wrap");
                setFooterText("");
              }}
            >
              {t("app.shop.print.reset")}
            </button>
          </div>
          <div className="w-full md:w-[420px]">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.print.footer.label")}</label>
            <input
              className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder={t("app.shop.print.footer.placeholder")}
              disabled={download}
            />
          </div>
        </div>
      </div>

      <div className={["print-root", isThermalPaper ? "print-thermal" : "print-a4"].join(" ")} style={cssVars}>
        <style>{printCss}</style>

        <div className="print-paper">
          <HeaderBlock
            t={t}
            logoUrl={logoFullUrl}
            displayName={tenant.tenant.displayName}
            legalName={tenant.tenant.legalName}
            address={tenant.branding.address}
            phone={tenant.branding.phone}
            email={tenant.branding.email}
            invoiceNumber={
              invoice.invoiceNumber ?? (invoice.kind === "refund" ? t("app.shop.invoice.titleRefundDraft") : t("app.shop.invoice.titleDraft"))
            }
            kind={invoice.kind}
            refundOfNumber={invoice.refundOf?.invoiceNumber ?? null}
            status={invoice.status}
            dateTime={dateLabel}
            customerName={invoice.customer?.name ?? null}
            locationName={invoice.location?.name ?? null}
            format={isThermalPaper ? "thermal" : "a4"}
          />

          {isThermalPaper ? (
            <ThermalLines t={t} lines={invoice.lines} currency={currency} showSku={showSku} showUnit={showUnit} nameWrap={nameWrap} />
          ) : (
            <A4Lines t={t} lines={invoice.lines} currency={currency} showSku={showSku} showUnit={showUnit} />
          )}

          <TotalsBlock
            t={t}
            currency={currency}
            grossSubtotal={invoice.grossSubtotal}
            discountTotal={invoice.discountTotal}
            taxEnabled={invoice.taxEnabled}
            taxRate={invoice.taxRate}
            taxTotal={invoice.taxTotal}
            roundingAdjustment={invoice.roundingAdjustment}
            subtotal={invoice.subtotal}
            paidTotal={invoice.paidTotal}
            balance={balance}
            notes={invoice.notes}
            kind={invoice.kind}
            format={isThermalPaper ? "thermal" : "a4"}
          />

          <div className={isThermalPaper ? "mt-4 border-t border-dashed border-gray-300 pt-3 text-center text-xs text-gray-600" : "mt-6 text-center text-xs text-gray-600"}>
            {(footerText?.trim() ? footerText.trim() : t("app.shop.print.thanks")) || " "}
          </div>
        </div>
      </div>
    </div>
  );
}

function isThermal(paper: Paper): paper is "thermal58" | "thermal80" {
  return paper === "thermal58" || paper === "thermal80";
}

function paperParamToFileSuffix(paper: Paper): string {
  if (paper === "a4") return "a4";
  return paper;
}

function HeaderBlock(props: {
  t: (k: string) => string;
  logoUrl: string | null;
  displayName: string;
  legalName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  invoiceNumber: string;
  kind: "sale" | "refund";
  refundOfNumber: string | null;
  status: "draft" | "posted" | "void";
  dateTime: string;
  customerName: string | null;
  locationName: string | null;
  format: "a4" | "thermal";
}) {
  const companyLine = props.legalName?.trim() ? props.legalName : props.displayName;
  return (
    <div className={props.format === "thermal" ? "text-center" : ""}>
      <div className={["flex items-start gap-3", props.format === "thermal" ? "justify-center" : "justify-between"].join(" ")}>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {props.logoUrl ? (
              <Image
                alt=""
                src={props.logoUrl}
                crossOrigin="anonymous"
                unoptimized
                width={48}
                height={48}
                className="h-full w-full object-contain"
              />
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
            <div className="text-xs font-medium text-gray-600">{props.t(`app.shop.print.doc.${props.kind}`)}</div>
            <div className="font-semibold text-gray-900">{props.invoiceNumber}</div>
            <div className="mt-1 text-xs text-gray-600">{new Date(props.dateTime).toLocaleString()}</div>
            <div className="mt-1 text-xs text-gray-600">{props.t(`app.shop.orders.status.${props.status}`)}</div>
            {props.kind === "refund" && props.refundOfNumber ? (
              <div className="mt-1 text-xs text-gray-600">
                {props.t("app.shop.print.refundOf")} {props.refundOfNumber}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {props.format === "thermal" ? (
        <div className="mt-3 border-t border-dashed border-gray-300 pt-3 text-xs text-gray-700">
          <div className="font-medium text-gray-600">{props.t(`app.shop.print.doc.${props.kind}`)}</div>
          <div className="font-semibold text-gray-900">{props.invoiceNumber}</div>
          <div className="mt-1">{new Date(props.dateTime).toLocaleString()}</div>
          <div className="mt-1">{props.t(`app.shop.orders.status.${props.status}`)}</div>
          {props.kind === "refund" && props.refundOfNumber ? <div className="mt-1">{props.t("app.shop.print.refundOf")} {props.refundOfNumber}</div> : null}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 text-sm">
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="text-xs font-medium text-gray-600">{props.t("app.shop.print.billTo")}</div>
            <div className="mt-1 font-semibold text-gray-900">{props.customerName ?? props.t("app.shop.print.walkIn")}</div>
          </div>
          <div className="rounded-xl border border-gray-200 p-3">
            <div className="text-xs font-medium text-gray-600">{props.t("app.shop.print.location")}</div>
            <div className="mt-1 font-semibold text-gray-900">{props.locationName ?? "—"}</div>
          </div>
        </div>
      )}
    </div>
  );
}

function A4Lines(props: { t: (k: string) => string; lines: InvoiceLine[]; currency: string; showSku: boolean; showUnit: boolean }) {
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{props.t("app.shop.print.table.product")}</th>
            <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{props.t("app.shop.print.table.qty")}</th>
            <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{props.t("app.shop.print.table.unitPrice")}</th>
            <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{props.t("app.shop.print.table.total")}</th>
          </tr>
        </thead>
        <tbody>
          {props.lines.map((l) => (
            <tr key={l.product.id}>
              <td className="border-b border-gray-100 px-4 py-3">
                <div className="font-medium text-gray-900">{l.product.name}</div>
                {Number(l.discountAmount || "0") > 0 ? (
                  <div className="mt-1 text-xs text-gray-500">
                    {props.t("app.shop.print.lineDiscount")}: {formatMoney(l.discountAmount, props.currency)}
                  </div>
                ) : null}
                {props.showSku || props.showUnit ? (
                  <div className="mt-1 text-xs text-gray-500">
                    {props.showSku ? l.product.sku ?? "—" : null}
                    {props.showSku && props.showUnit ? " · " : null}
                    {props.showUnit && l.product.unit ? `${l.product.unit.name}${l.product.unit.symbol ? ` (${l.product.unit.symbol})` : ""}` : null}
                  </div>
                ) : null}
              </td>
              <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900">{l.quantity}</td>
              <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900">{formatMoney(l.unitPrice, props.currency)}</td>
              <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900">{formatMoney(l.netTotal, props.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ThermalLines(props: { t: (k: string) => string; lines: InvoiceLine[]; currency: string; showSku: boolean; showUnit: boolean; nameWrap: "wrap" | "single" }) {
  return (
    <div className="mt-4 text-xs">
      <div className="border-t border-dashed border-gray-300 pt-3">
        <div className="thermal-head">
          <div className="font-semibold text-gray-900">{props.t("app.shop.print.table.product")}</div>
          <div className="text-right font-semibold text-gray-900">{props.t("app.shop.print.table.total")}</div>
        </div>

        <div className="mt-2 space-y-2">
          {props.lines.map((l) => (
            <div key={l.product.id} className="thermal-row">
              <div className="thermal-row-top">
                <div className={["min-w-0 font-medium text-gray-900", props.nameWrap === "single" ? "truncate" : ""].join(" ")}>{l.product.name}</div>
                <div className="shrink-0 text-right font-medium text-gray-900">{formatMoney(l.netTotal, props.currency)}</div>
              </div>
              <div className="mt-1 thermal-row-sub text-gray-600">
                <div className="min-w-0">
                  {props.t("app.shop.print.table.qty")}: <span className="tabular">{l.quantity}</span> ·{" "}
                  {props.t("app.shop.print.table.unitPrice")}: <span className="tabular">{formatMoney(l.unitPrice, props.currency)}</span>
                </div>
                {Number(l.discountAmount || "0") > 0 ? (
                  <div className="min-w-0">
                    {props.t("app.shop.print.lineDiscount")}: <span className="tabular">{formatMoney(l.discountAmount, props.currency)}</span>
                  </div>
                ) : null}
                {props.showSku || props.showUnit ? (
                  <div className="min-w-0">
                    {props.showSku ? `${props.t("app.shop.print.sku")}: ${l.product.sku ?? "—"}` : null}
                    {props.showSku && props.showUnit ? " · " : null}
                    {props.showUnit && l.product.unit ? `${props.t("app.shop.print.unit")}: ${l.product.unit.name}${l.product.unit.symbol ? ` (${l.product.unit.symbol})` : ""}` : null}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TotalsBlock(props: {
  t: (k: string) => string;
  currency: string;
  grossSubtotal: string;
  discountTotal: string;
  taxEnabled: boolean;
  taxRate: string;
  taxTotal: string;
  roundingAdjustment: string;
  subtotal: string;
  paidTotal: string;
  balance: string;
  notes: string | null;
  kind: "sale" | "refund";
  format: "a4" | "thermal";
}) {
  const grossSubtotal = Number(props.grossSubtotal || "0");
  const discountTotal = Number(props.discountTotal || "0");
  const taxTotal = Number(props.taxTotal || "0");
  const roundingAdjustment = Number(props.roundingAdjustment || "0");
  return (
    <div className="mt-6">
      <div className={props.format === "thermal" ? "border-t border-dashed border-gray-300 pt-3 text-xs" : "grid gap-3 md:grid-cols-2"}>
        <div className={props.format === "thermal" ? "" : "rounded-2xl border border-gray-200 p-4"}>
          <div className="text-xs font-medium text-gray-600">{props.t("app.shop.print.notes")}</div>
          <div className={props.format === "thermal" ? "mt-2 text-xs text-gray-900" : "mt-2 text-sm text-gray-900"}>{props.notes?.trim() ? props.notes : "—"}</div>
        </div>

        <div className={props.format === "thermal" ? "mt-3" : "rounded-2xl border border-gray-200 p-4"}>
          <div className={props.format === "thermal" ? "thermal-kv" : ""}>
            <div className="flex items-center justify-between text-sm">
              <div className="text-gray-700">{props.t("app.shop.print.grossSubtotal")}</div>
              <div className="font-semibold text-gray-900 tabular">{formatMoney(String(grossSubtotal.toFixed(2)), props.currency)}</div>
            </div>
            {discountTotal > 0 ? (
              <div className="mt-2 flex items-center justify-between text-sm">
                <div className="text-gray-700">{props.t("app.shop.print.discountTotal")}</div>
                <div className="font-semibold text-gray-900 tabular">-{formatMoney(String(discountTotal.toFixed(2)), props.currency)}</div>
              </div>
            ) : null}
            {props.taxEnabled && taxTotal > 0 ? (
              <div className="mt-2 flex items-center justify-between text-sm">
                <div className="text-gray-700">
                  {props.t("app.shop.print.tax")} ({props.taxRate}%)
                </div>
                <div className="font-semibold text-gray-900 tabular">{formatMoney(String(taxTotal.toFixed(2)), props.currency)}</div>
              </div>
            ) : null}
            {roundingAdjustment !== 0 ? (
              <div className="mt-2 flex items-center justify-between text-sm">
                <div className="text-gray-700">{props.t("app.shop.print.rounding")}</div>
                <div className="font-semibold text-gray-900 tabular">{formatMoney(String(roundingAdjustment.toFixed(2)), props.currency)}</div>
              </div>
            ) : null}
            <div className="flex items-center justify-between text-sm">
              <div className="text-gray-700">{props.kind === "refund" ? props.t("app.shop.print.refundTotal") : props.t("app.shop.print.total")}</div>
              <div className="font-semibold text-gray-900 tabular">{formatMoney(props.subtotal, props.currency)}</div>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <div className="text-gray-700">{props.kind === "refund" ? props.t("app.shop.print.paidOut") : props.t("app.shop.print.paid")}</div>
              <div className="font-semibold text-gray-900 tabular">{formatMoney(props.paidTotal, props.currency)}</div>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <div className="text-gray-700">{props.kind === "refund" ? props.t("app.shop.print.remaining") : props.t("app.shop.print.balance")}</div>
              <div className="font-semibold text-gray-900 tabular">{formatMoney(props.balance, props.currency)}</div>
            </div>
          </div>
        </div>
      </div>
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
.thermal-kv { }
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
