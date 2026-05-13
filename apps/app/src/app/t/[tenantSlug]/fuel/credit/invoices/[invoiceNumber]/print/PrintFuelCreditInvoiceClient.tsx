"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { getApiBaseUrl } from "@/lib/api";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type TenantCurrentResponse = {
  data: {
    tenant: { id: string; slug: string; legalName: string; displayName: string; defaultLocale: string; status: string };
    branding: { logoUrl: string | null; address: string | null; phone: string | null; email: string | null };
  } | null;
};

type CreditInvoiceDetail = {
  invoice: {
    invoiceNumber: string;
    month: string | null;
    periodFrom: string | null;
    periodTo: string | null;
    createdAt: string;
    status: string;
    customer: { id: string; name: string; phone: string | null };
    salesCount: number;
    totalVolume: string;
    totalAmount: string;
    paidAmount: string;
    balance: string;
  };
  payments: { id: string; amount: string; method: string; note: string | null; receivedAt: string }[];
  sales: {
    id: string;
    createdAt: string;
    nozzleId: string;
    volume: string;
    pricePerUnit: string;
    totalAmount: string;
    driverName: string | null;
    licensePlate: string | null;
    nozzle: { name: string; tank: { name: string; fuelType: string } };
  }[];
};

type Paper = "a4" | "thermal80" | "thermal58";

function isThermal(paper: Paper) {
  return paper === "thermal58" || paper === "thermal80";
}

export function PrintFuelCreditInvoiceClient(props: { tenantSlug: string; invoiceNumber: string }) {
  const { t } = useClientI18n();
  const apiBase = getApiBaseUrl();
  const searchParams = useSearchParams();
  const download = searchParams.get("download") === "pdf";
  const paperParam = searchParams.get("paper");
  const initialPaper: Paper = paperParam === "thermal58" ? "thermal58" : paperParam === "thermal80" ? "thermal80" : "a4";

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantCurrentResponse["data"]>(null);
  const [data, setData] = useState<CreditInvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [paper, setPaper] = useState<Paper>(initialPaper);
  const [paddingMm, setPaddingMm] = useState(10);
  const [fontScale, setFontScale] = useState<"compact" | "normal" | "large">("normal");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfExported, setPdfExported] = useState(false);

  const printRef = useRef<HTMLDivElement | null>(null);

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
          apiFetch(`/api/fuel/credit/invoices/${encodeURIComponent(props.invoiceNumber)}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);
        const tenantJson = (await tenantRes.json()) as TenantCurrentResponse;
        const invoiceJson = (await invoiceRes.json()) as { data?: CreditInvoiceDetail; error?: { message_key?: string } };
        if (!tenantRes.ok || !tenantJson.data) {
          setErrorKey("errors.internal");
          return;
        }
        if (!invoiceRes.ok) {
          setErrorKey(invoiceJson.error?.message_key ?? "errors.internal");
          return;
        }
        if (!cancelled) {
          setTenant(tenantJson.data);
          setData((invoiceJson as { data: CreditInvoiceDetail }).data);
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
  }, [props.invoiceNumber, tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function exportPdf() {
      if (!download || !data || !tenant || exportingPdf || pdfExported) return;
      if (!printRef.current) return;

      setExportingPdf(true);
      try {
        const html2canvas = (await import("html2canvas")).default;
        const { jsPDF } = await import("jspdf");

        const canvas = await html2canvas(printRef.current, { scale: 2 });
        const imgData = canvas.toDataURL("image/png");
        const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgProps = pdf.getImageProperties(imgData);
        const imgHeight = (imgProps.height * pageWidth) / imgProps.width;

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

        if (!cancelled) pdf.save(`fuel_credit_invoice_${data.invoice.invoiceNumber}.pdf`);
        if (!cancelled) setPdfExported(true);
      } finally {
        if (!cancelled) setExportingPdf(false);
      }
    }
    void exportPdf();
    return () => {
      cancelled = true;
    };
  }, [data, download, exportingPdf, pdfExported, tenant]);

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card text-sm text-gray-700">{t("common.loading")}</div>;
  }
  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }
  if (!tenant || !data) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card text-sm text-gray-700">—</div>;
  }

  const width = paper === "thermal58" ? "58mm" : paper === "thermal80" ? "80mm" : "210mm";
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
          <div className="text-sm text-gray-700">{t("app.fuel.credit.invoice.print")}</div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm" value={paper} onChange={(e) => setPaper(e.target.value as Paper)} disabled={download}>
              <option value="a4">A4</option>
              <option value="thermal80">Thermal 80</option>
              <option value="thermal58">Thermal 58</option>
            </select>
            <select className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm" value={String(paddingMm)} onChange={(e) => setPaddingMm(Number(e.target.value))} disabled={download}>
              <option value="6">Compact</option>
              <option value="10">Normal</option>
              <option value="14">Comfort</option>
            </select>
            <select className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm" value={fontScale} onChange={(e) => setFontScale(e.target.value as "compact" | "normal" | "large")} disabled={download}>
              <option value="compact">Compact</option>
              <option value="normal">Normal</option>
              <option value="large">Large</option>
            </select>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              onClick={() => window.print()}
              disabled={exportingPdf}
            >
              Print
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto" style={cssVars}>
        <div
          ref={printRef}
          className={[
            "rounded-2xl border border-gray-200 bg-white shadow-card",
            isThermal(paper) ? "mx-auto w-[var(--paper-width)]" : "mx-auto max-w-4xl",
            "p-[var(--paper-padding)]"
          ].join(" ")}
          style={{ transform: `scale(var(--font-scale))`, transformOrigin: "top center" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">{tenant.tenant.displayName || tenant.tenant.legalName}</div>
              {tenant.branding.address ? <div className="mt-1 text-xs text-gray-600">{tenant.branding.address}</div> : null}
              {tenant.branding.phone ? <div className="text-xs text-gray-600">{tenant.branding.phone}</div> : null}
            </div>
            {logoFullUrl ? <Image src={logoFullUrl} alt="" width={80} height={80} className="h-12 w-auto object-contain" /> : null}
          </div>

          <div className="mt-4 border-t border-dashed border-gray-200 pt-4">
            <div className="text-sm font-semibold">{t("app.fuel.credit.invoice.title")}</div>
            <div className="mt-1 text-xs text-gray-600">{data.invoice.invoiceNumber}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-gray-700">
              <div>
                <div className="text-gray-500">Customer</div>
                <div className="font-medium">{data.invoice.customer.name}</div>
              </div>
              <div className="text-right">
                <div className="text-gray-500">Created</div>
                <div className="font-medium">{new Date(data.invoice.createdAt).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-gray-500">From</div>
                <div className="font-medium">{data.invoice.periodFrom ? new Date(data.invoice.periodFrom).toISOString().slice(0, 10) : ""}</div>
              </div>
              <div className="text-right">
                <div className="text-gray-500">To</div>
                <div className="font-medium">{data.invoice.periodTo ? new Date(data.invoice.periodTo).toISOString().slice(0, 10) : ""}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Time</th>
                  <th className="px-3 py-2 text-left font-semibold">Nozzle</th>
                  <th className="px-3 py-2 text-right font-semibold">Volume</th>
                  <th className="px-3 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {data.sales.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2">{new Date(s.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">{s.nozzle.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.volume}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{s.totalAmount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Total</span>
              <span className="tabular-nums font-semibold">{data.invoice.totalAmount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Paid</span>
              <span className="tabular-nums">{data.invoice.paidAmount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Balance</span>
              <span className="tabular-nums font-semibold">{data.invoice.balance}</span>
            </div>
          </div>

          {data.payments.length ? (
            <div className="mt-4 border-t border-dashed border-gray-200 pt-4">
              <div className="text-sm font-semibold">{t("app.fuel.credit.payments.title")}</div>
              <div className="mt-2 overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Time</th>
                      <th className="px-3 py-2 text-left font-semibold">Method</th>
                      <th className="px-3 py-2 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {data.payments.map((p) => (
                      <tr key={p.id}>
                        <td className="px-3 py-2">{new Date(p.receivedAt).toLocaleString()}</td>
                        <td className="px-3 py-2">{p.method}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{p.amount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

