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

type CustomerResponse = {
  data: { id: string; name: string; phone: string | null; email: string | null; address: string | null; notes: string | null; status: "active" | "archived"; balance: string };
};

type LedgerResponse = {
  data: {
    openingBalance: string;
    closingBalance: string;
    items: {
      id: string;
      type: "invoice" | "refund" | "payment" | "refund_payout";
      dateTime: string;
      ref: string | null;
      method: string | null;
      currencyCode: string;
      amount: string;
      delta: string;
      balance: string;
    }[];
  };
};

type Paper = "a4" | "thermal80" | "thermal58";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function PrintCustomerStatementClient(props: { tenantSlug: string; customerId: string }) {
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

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantCurrentResponse["data"]>(null);
  const [customer, setCustomer] = useState<CustomerResponse["data"] | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [paper, setPaper] = useState<Paper>(initialPaper);
  const [paddingMm, setPaddingMm] = useState(10);
  const [fontScale, setFontScale] = useState<"compact" | "normal" | "large">("normal");
  const [footerText, setFooterText] = useState("");

  const [from, setFrom] = useState(() => {
    if (initialFrom) return initialFrom;
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return isoDate(d);
  });
  const [to, setTo] = useState(() => (initialTo ? initialTo : isoDate(new Date())));

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

  const logoFullUrl = useMemo(() => {
    const logoUrl = tenant?.branding.logoUrl ?? null;
    return logoUrl ? `${apiBase}${logoUrl}` : null;
  }, [apiBase, tenant?.branding.logoUrl]);

  const isThermalPaper = paper === "thermal58" || paper === "thermal80";
  const width = paper === "thermal58" ? "58mm" : "80mm";
  const scale = fontScale === "compact" ? 0.92 : fontScale === "large" ? 1.06 : 1;
  const cssVars = {
    ["--paper-width" as never]: width,
    ["--paper-padding" as never]: `${paddingMm}mm`,
    ["--font-scale" as never]: String(scale)
  };

  const statementCurrency = ledger?.items?.[0]?.currencyCode ?? customer ? "USD" : "USD";

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", new Date(to + "T23:59:59.999Z").toISOString());
    return p;
  }, [from, to]);

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
        const [tenantRes, custRes, ledgerRes] = await Promise.all([
          apiFetch("/api/tenants/current", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/customers/${props.customerId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/customers/${props.customerId}/ledger?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);

        const tenantJson = (await tenantRes.json()) as TenantCurrentResponse;
        const custJson = (await custRes.json()) as CustomerResponse | { error?: { message_key?: string } };
        const ledgerJson = (await ledgerRes.json()) as LedgerResponse | { error?: { message_key?: string } };

        if (!tenantRes.ok || !tenantJson.data) {
          setErrorKey("errors.internal");
          return;
        }
        if (!custRes.ok) {
          setErrorKey((custJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        if (!ledgerRes.ok) {
          setErrorKey((ledgerJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }

        if (!cancelled) {
          setTenant(tenantJson.data);
          setCustomer((custJson as CustomerResponse).data);
          setLedger((ledgerJson as LedgerResponse).data);
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
  }, [tenantId, props.customerId, queryParams]);

  useEffect(() => {
    let cancelled = false;
    async function exportPdf() {
      if (!download || !tenant || !customer || !ledger) return;
      if (pdfExported) return;
      setExportingPdf(true);
      try {
        const paperEl = document.querySelector(".print-paper") as HTMLElement | null;
        if (!paperEl) return;

        const html2canvas = (await import("html2canvas")).default;
        const { jsPDF } = await import("jspdf");

        const canvas = await html2canvas(paperEl, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
        const imgData = canvas.toDataURL("image/png");

        const safeName = (customer.name ?? "statement").replaceAll("/", "-").replaceAll("\\", "-");
        const filename = `${safeName}-${paperParamToFileSuffix(paper)}.pdf`;

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
  }, [download, tenant, customer, ledger, paper, pdfExported]);

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card text-sm text-gray-700">Loading…</div>;
  }
  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }
  if (!tenant || !customer || !ledger) {
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

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.customerLedger.filter.from")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={download} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.customerLedger.filter.to")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={download} />
          </div>
          <div>
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
          <StatementHeader
            t={t}
            logoUrl={logoFullUrl}
            displayName={tenant.tenant.displayName}
            legalName={tenant.tenant.legalName}
            address={tenant.branding.address}
            phone={tenant.branding.phone}
            email={tenant.branding.email}
            customerName={customer.name}
            from={from}
            to={to}
            format={isThermalPaper ? "thermal" : "a4"}
          />

          {isThermalPaper ? (
            <ThermalLedger t={t} items={ledger.items} currency={statementCurrency} opening={ledger.openingBalance} closing={ledger.closingBalance} />
          ) : (
            <A4Ledger t={t} items={ledger.items} currency={statementCurrency} opening={ledger.openingBalance} closing={ledger.closingBalance} />
          )}

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

function StatementHeader(props: {
  t: (k: string) => string;
  logoUrl: string | null;
  displayName: string;
  legalName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  customerName: string;
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
            <div className="text-xs font-medium text-gray-600">{props.t("app.shop.customerStatement.title")}</div>
            <div className="mt-1 text-xs text-gray-600">
              {props.t("app.shop.customerStatement.customer")}: <span className="font-medium text-gray-900">{props.customerName}</span>
            </div>
            <div className="mt-1 text-xs text-gray-600">
              {props.t("app.shop.customerStatement.period")}: <span className="font-medium text-gray-900">{periodLabel}</span>
            </div>
            <div className="mt-1 text-xs text-gray-600">{new Date().toLocaleString()}</div>
          </div>
        ) : null}
      </div>

      {props.format === "thermal" ? (
        <div className="mt-3 border-t border-dashed border-gray-300 pt-3 text-xs text-gray-700">
          <div className="font-semibold text-gray-900">{props.t("app.shop.customerStatement.title")}</div>
          <div className="mt-1">
            {props.t("app.shop.customerStatement.customer")}: <span className="font-medium text-gray-900">{props.customerName}</span>
          </div>
          <div className="mt-1">
            {props.t("app.shop.customerStatement.period")}: <span className="font-medium text-gray-900">{periodLabel}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function A4Ledger(props: { t: (k: string) => string; items: LedgerResponse["data"]["items"]; currency: string; opening: string; closing: string }) {
  return (
    <div className="mt-6">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 p-4">
          <div className="text-xs font-medium text-gray-600">{props.t("app.shop.customerLedger.opening")}</div>
          <div className="mt-2 text-lg font-semibold text-gray-900">{formatMoney(props.opening, props.currency)}</div>
        </div>
        <div className="rounded-2xl border border-gray-200 p-4">
          <div className="text-xs font-medium text-gray-600">{props.t("app.shop.customerLedger.closing")}</div>
          <div className="mt-2 text-lg font-semibold text-gray-900">{formatMoney(props.closing, props.currency)}</div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{props.t("app.shop.customerLedger.table.time")}</th>
              <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{props.t("app.shop.customerLedger.table.type")}</th>
              <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{props.t("app.shop.customerLedger.table.ref")}</th>
              <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{props.t("app.shop.customerLedger.table.method")}</th>
              <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{props.t("app.shop.customerLedger.table.amount")}</th>
              <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{props.t("app.shop.customerLedger.table.balance")}</th>
            </tr>
          </thead>
          <tbody>
            {props.items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-gray-600" colSpan={6}>
                  {props.t("app.shop.customerLedger.empty")}
                </td>
              </tr>
            ) : (
              props.items.map((e) => (
                <tr key={e.id}>
                  <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{new Date(e.dateTime).toLocaleString()}</td>
                  <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{props.t(`app.shop.customerLedger.type.${e.type}`)}</td>
                  <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{e.ref ?? "—"}</td>
                  <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{e.method ?? "—"}</td>
                  <td className="border-b border-gray-100 px-4 py-3 text-right font-medium text-gray-900">{formatMoney(e.delta, e.currencyCode)}</td>
                  <td className="border-b border-gray-100 px-4 py-3 text-right font-semibold text-gray-900">{formatMoney(e.balance, e.currencyCode)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ThermalLedger(props: { t: (k: string) => string; items: LedgerResponse["data"]["items"]; currency: string; opening: string; closing: string }) {
  return (
    <div className="mt-4 text-xs">
      <div className="border-t border-dashed border-gray-300 pt-3">
        <div className="flex items-center justify-between text-sm">
          <div className="text-gray-700">{props.t("app.shop.customerLedger.opening")}</div>
          <div className="font-semibold text-gray-900">{formatMoney(props.opening, props.currency)}</div>
        </div>
        <div className="mt-2 flex items-center justify-between text-sm">
          <div className="text-gray-700">{props.t("app.shop.customerLedger.closing")}</div>
          <div className="font-semibold text-gray-900">{formatMoney(props.closing, props.currency)}</div>
        </div>
      </div>

      <div className="mt-4 border-t border-dashed border-gray-300 pt-3">
        <div className="thermal-head">
          <div className="font-semibold text-gray-900">{props.t("app.shop.customerLedger.table.type")}</div>
          <div className="text-right font-semibold text-gray-900">{props.t("app.shop.customerLedger.table.amount")}</div>
        </div>
        <div className="mt-2 space-y-2">
          {props.items.length === 0 ? (
            <div className="text-gray-600">{props.t("app.shop.customerLedger.empty")}</div>
          ) : (
            props.items.map((e) => (
              <div key={e.id} className="thermal-row">
                <div className="thermal-row-top">
                  <div className="min-w-0 font-medium text-gray-900">{props.t(`app.shop.customerLedger.type.${e.type}`)}</div>
                  <div className="shrink-0 text-right font-medium text-gray-900">{formatMoney(e.delta, e.currencyCode)}</div>
                </div>
                <div className="mt-1 thermal-row-sub text-gray-600">
                  <div className="min-w-0">
                    {new Date(e.dateTime).toLocaleString()} {e.ref ? ` · ${e.ref}` : ""} {e.method ? ` · ${e.method}` : ""}
                  </div>
                  <div className="min-w-0">
                    {props.t("app.shop.customerLedger.table.balance")}: <span className="tabular">{formatMoney(e.balance, e.currencyCode)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
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
