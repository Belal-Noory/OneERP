"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { getApiBaseUrl } from "@/lib/api";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

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

export function PrintPharmacyInvoiceClient(props: { tenantSlug: string; invoiceId: string }) {
  const { t } = useClientI18n();
  const apiBase = getApiBaseUrl();
  const searchParams = useSearchParams();
  const initialPaper = ((): Paper => {
    const raw = searchParams.get("paper");
    if (raw === "thermal58") return "thermal58";
    if (raw === "thermal80") return "thermal80";
    return "a4";
  })();

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

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`oneerp.pharmacy.printSettings.${props.tenantSlug}`);
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
      localStorage.setItem(`oneerp.pharmacy.printSettings.${props.tenantSlug}`, JSON.stringify({ paper, paddingMm, fontScale, showSku, showUnit, nameWrap, footerText }));
    } catch {}
  }, [paper, paddingMm, fontScale, showSku, showUnit, nameWrap, footerText, props.tenantSlug]);

  const logoFullUrl = useMemo(() => {
    const logoUrl = tenant?.branding.logoUrl ?? null;
    return logoUrl ? `${apiBase}${logoUrl}` : null;
  }, [apiBase, tenant?.branding.logoUrl]);

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
          apiFetch(`/api/pharmacy/invoices/${props.invoiceId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
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
  }, [props.invoiceId, tenantId]);

  if (errorKey) return <div className="p-6 text-sm text-red-700">{t(errorKey)}</div>;
  if (loading || !invoice || !tenant) return <div className="p-6 text-sm text-gray-700">{t("common.loading")}</div>;

  const subtotal = invoice.subtotal;

  return (
    <div className="space-y-4">
      <div className="no-print rounded-2xl border border-gray-200 bg-white p-4 shadow-card">
        <div className="grid gap-4 md:grid-cols-6">
          <div>
            <div className="text-xs text-gray-700">{t("app.shop.print.paper")}</div>
            <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
              <option value="thermal80">{t("app.shop.print.paper.thermal80")}</option>
              <option value="thermal58">{t("app.shop.print.paper.thermal58")}</option>
              <option value="a4">{t("app.shop.print.paper.a4")}</option>
            </select>
          </div>
          <div>
            <div className="text-xs text-gray-700">{t("app.shop.print.padding")}</div>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm tabular" value={paddingMm} onChange={(e) => setPaddingMm(Number(e.target.value))} />
          </div>
          <div>
            <div className="text-xs text-gray-700">{t("app.shop.print.font")}</div>
            <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={fontScale} onChange={(e) => setFontScale(e.target.value as typeof fontScale)}>
              <option value="compact">{t("app.shop.print.font.compact")}</option>
              <option value="normal">{t("app.shop.print.font.normal")}</option>
              <option value="large">{t("app.shop.print.font.large")}</option>
            </select>
          </div>
          <div className="flex items-end gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-900">
              <input type="checkbox" checked={showSku} onChange={(e) => setShowSku(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
              SKU
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-900">
              <input type="checkbox" checked={showUnit} onChange={(e) => setShowUnit(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
              {t("app.shop.print.showUnit")}
            </label>
          </div>
          <div className="md:col-span-2">
            <div className="text-xs text-gray-700">{t("app.shop.print.footer")}</div>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={footerText} onChange={(e) => setFooterText(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800" onClick={() => window.print()}>
            {t("app.shop.print.action.print")}
          </button>
        </div>
      </div>

      <div
        className={[
          "print-sheet mx-auto bg-white text-gray-900 shadow-card",
          paper === "a4" ? "w-[210mm]" : paper === "thermal80" ? "w-[80mm]" : "w-[58mm]"
        ].join(" ")}
        style={{
          padding: `${paddingMm}mm`,
          fontSize: fontScale === "compact" ? "12px" : fontScale === "large" ? "15px" : "13px",
          lineHeight: fontScale === "compact" ? "1.15" : fontScale === "large" ? "1.35" : "1.25"
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">{tenant.tenant.displayName || tenant.tenant.legalName}</div>
            {tenant.branding.address ? <div className="mt-1 text-xs text-gray-700">{tenant.branding.address}</div> : null}
            {tenant.branding.phone ? <div className="mt-1 text-xs text-gray-700">{tenant.branding.phone}</div> : null}
          </div>
          {logoFullUrl ? <Image src={logoFullUrl} alt="" width={120} height={60} className="h-auto w-24 object-contain" /> : null}
        </div>

        <div className="mt-4 text-xs text-gray-700">
          <div className="flex items-center justify-between">
            <div>{invoice.invoiceNumber ?? invoice.id}</div>
            <div>{invoice.location?.name ?? ""}</div>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <div>{new Date(invoice.createdAt).toLocaleString()}</div>
            <div>{invoice.status}</div>
          </div>
        </div>

        <div className="mt-4 border-t border-gray-200 pt-3">
          <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-gray-900">
            <div className="col-span-7">{t("app.shop.print.item")}</div>
            <div className="col-span-2 text-right">{t("app.shop.print.qty")}</div>
            <div className="col-span-3 text-right">{t("app.shop.print.total")}</div>
          </div>

          <div className="mt-2 space-y-2">
            {invoice.lines.map((l) => (
              <div key={l.product.id} className="grid grid-cols-12 gap-2 text-xs">
                <div className="col-span-7">
                  <div className={nameWrap === "single" ? "truncate" : ""}>{l.product.name}</div>
                  {showSku && l.product.sku ? <div className="mt-0.5 text-[11px] text-gray-600">{l.product.sku}</div> : null}
                  {showUnit && l.product.unit ? <div className="mt-0.5 text-[11px] text-gray-600">{l.product.unit.symbol ?? l.product.unit.name}</div> : null}
                </div>
                <div className="col-span-2 text-right tabular">{l.quantity}</div>
                <div className="col-span-3 text-right tabular">{formatMoney(l.netTotal, invoice.currencyCode)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 border-t border-gray-200 pt-3 text-xs">
          <div className="flex items-center justify-between">
            <div className="text-gray-700">{t("app.shop.pos.summary.total")}</div>
            <div className="font-semibold">{formatMoney(subtotal, invoice.currencyCode)}</div>
          </div>
        </div>

        {footerText ? <div className="mt-6 text-center text-xs text-gray-700">{footerText}</div> : null}
      </div>
    </div>
  );
}

