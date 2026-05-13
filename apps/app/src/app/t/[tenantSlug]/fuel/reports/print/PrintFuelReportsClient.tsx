"use client";

import { type ReactNode, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
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

type Sale = {
  id: string;
  createdAt: string;
  nozzle: { name: string; tank: { fuelType: string } };
  volume: string;
  totalAmount: string;
  paymentMethod: string;
  customer?: { name: string };
  driverName: string | null;
  licensePlate: string | null;
};

type ReportData = {
  totalSales: string;
  totalVolume: string;
  salesCount: number;
  sales: Sale[];
};

type Paper = "a4" | "thermal80" | "thermal58";

function isThermal(paper: Paper) {
  return paper === "thermal58" || paper === "thermal80";
}

function paperParamToFileSuffix(paper: Paper): string {
  if (paper === "a4") return "a4";
  return paper;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toDayEndIso(dateStr: string): string {
  return new Date(dateStr + "T23:59:59.999Z").toISOString();
}

function Stat(props: { label: string; value: string; muted?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{props.label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{props.value}</div>
      {props.muted ? <div className="mt-1 text-xs text-gray-500">{props.muted}</div> : null}
    </div>
  );
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <div className="mt-4">
      <div className="text-sm font-semibold text-gray-900">{props.title}</div>
      <div className="mt-2">{props.children}</div>
    </div>
  );
}

export function PrintFuelReportsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const apiBase = getApiBaseUrl();
  const searchParams = useSearchParams();
  const download = searchParams.get("download") === "pdf";
  const paperParam = searchParams.get("paper");
  const initialPaper: Paper = paperParam === "thermal58" ? "thermal58" : paperParam === "thermal80" ? "thermal80" : "a4";
  const initialFrom = searchParams.get("from");
  const initialTo = searchParams.get("to");

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantCurrentResponse["data"]>(null);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [paper, setPaper] = useState<Paper>(initialPaper);
  const [paddingMm, setPaddingMm] = useState(10);
  const [fontScale, setFontScale] = useState<"compact" | "normal" | "large">("normal");
  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfExported, setPdfExported] = useState(false);

  const [from, setFrom] = useState(() => {
    if (initialFrom) return initialFrom;
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return isoDate(d);
  });
  const [to, setTo] = useState(() => (initialTo ? initialTo : isoDate(new Date())));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`oneerp.fuel.reports.printSettings.${props.tenantSlug}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<{ paper: Paper; paddingMm: number; fontScale: "compact" | "normal" | "large" }>;
      if (parsed.paper === "a4" || parsed.paper === "thermal58" || parsed.paper === "thermal80") setPaper(parsed.paper);
      if (typeof parsed.paddingMm === "number" && parsed.paddingMm >= 0 && parsed.paddingMm <= 20) setPaddingMm(parsed.paddingMm);
      if (parsed.fontScale === "compact" || parsed.fontScale === "normal" || parsed.fontScale === "large") setFontScale(parsed.fontScale);
    } catch {}
  }, [props.tenantSlug]);

  useEffect(() => {
    try {
      localStorage.setItem(`oneerp.fuel.reports.printSettings.${props.tenantSlug}`, JSON.stringify({ paper, paddingMm, fontScale }));
    } catch {}
  }, [fontScale, paddingMm, paper, props.tenantSlug]);

  const logoFullUrl = useMemo(() => {
    const logoUrl = tenant?.branding.logoUrl ?? null;
    return logoUrl ? `${apiBase}${logoUrl}` : null;
  }, [apiBase, tenant?.branding.logoUrl]);

  const byPayment = useMemo(() => {
    const sales = data?.sales ?? [];
    const map = new Map<string, { method: string; salesCount: number; totalAmount: number; totalVolume: number }>();
    for (const s of sales) {
      const key = s.paymentMethod || "unknown";
      const amount = Number(s.totalAmount) || 0;
      const volume = Number(s.volume) || 0;
      const row = map.get(key) ?? { method: key, salesCount: 0, totalAmount: 0, totalVolume: 0 };
      row.salesCount += 1;
      row.totalAmount += amount;
      row.totalVolume += volume;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [data]);

  const byFuel = useMemo(() => {
    const sales = data?.sales ?? [];
    const map = new Map<string, { fuelType: string; salesCount: number; totalAmount: number; totalVolume: number }>();
    for (const s of sales) {
      const key = s.nozzle?.tank?.fuelType || "unknown";
      const amount = Number(s.totalAmount) || 0;
      const volume = Number(s.volume) || 0;
      const row = map.get(key) ?? { fuelType: key, salesCount: 0, totalAmount: 0, totalVolume: 0 };
      row.salesCount += 1;
      row.totalAmount += amount;
      row.totalVolume += volume;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [data]);

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
        const p = new URLSearchParams();
        if (from) p.set("from", new Date(from).toISOString());
        if (to) p.set("to", toDayEndIso(to));
        p.set("limit", "5000");

        const [tenantRes, reportRes] = await Promise.all([
          apiFetch("/api/tenants/current", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/fuel/reports?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);
        const tenantJson = (await tenantRes.json()) as TenantCurrentResponse;
        const reportJson = (await reportRes.json()) as { data?: ReportData; error?: { message_key?: string } };
        if (!tenantRes.ok || !tenantJson.data) {
          setErrorKey("errors.internal");
          return;
        }
        if (!reportRes.ok || !reportJson.data) {
          setErrorKey(reportJson.error?.message_key ?? "errors.internal");
          return;
        }
        if (!cancelled) {
          setTenant(tenantJson.data);
          setData(reportJson.data);
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
  }, [from, tenantId, to]);

  useEffect(() => {
    let cancelled = false;
    async function exportPdf() {
      if (!download || !data || !tenant || exportingPdf || pdfExported) return;
      const paperEl = document.querySelector(".print-paper") as HTMLElement | null;
      if (!paperEl) return;

      setExportingPdf(true);
      try {
        const html2canvas = (await import("html2canvas")).default;
        const { jsPDF } = await import("jspdf");

        const canvas = await html2canvas(paperEl, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
        const imgData = canvas.toDataURL("image/png");
        const filename = `fuel_reports_${from}_${to}_${paperParamToFileSuffix(paper)}.pdf`;

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
        if (!cancelled) window.setTimeout(() => window.close(), 300);
      } finally {
        if (!cancelled) setExportingPdf(false);
      }
    }
    void exportPdf();
    return () => {
      cancelled = true;
    };
  }, [data, download, exportingPdf, from, pdfExported, tenant, to]);

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
          <div className="text-sm text-gray-700">{t("app.fuel.reports.print.title")}</div>
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
          className={[
            "print-paper",
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
            <div className="text-sm font-semibold">{t("app.fuel.reports.title")}</div>
            <div className="mt-1 text-xs text-gray-600">
              {t("app.shop.reports.export.range")}: {from} → {to}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Stat label={t("app.fuel.reports.totalSales")} value={data.totalSales} />
            <Stat label={t("app.fuel.reports.totalVolume")} value={data.totalVolume} />
            <Stat label={t("app.fuel.reports.salesCount")} value={String(data.salesCount)} />
          </div>

          <Section title={t("app.fuel.reports.section.payments")}>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t("app.fuel.sales.table.payment")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("app.fuel.reports.salesCount")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("app.fuel.reports.totalVolume")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("app.fuel.reports.totalSales")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {byPayment.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-gray-500">{t("app.fuel.reports.empty")}</td>
                    </tr>
                  ) : (
                    byPayment.map((r) => (
                      <tr key={r.method}>
                        <td className="px-3 py-2">{r.method}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.salesCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.totalVolume.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.totalAmount.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={t("app.fuel.reports.section.fuelTypes")}>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t("app.fuel.reports.fuelType")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("app.fuel.reports.salesCount")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("app.fuel.reports.totalVolume")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("app.fuel.reports.totalSales")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {byFuel.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-gray-500">{t("app.fuel.reports.empty")}</td>
                    </tr>
                  ) : (
                    byFuel.map((r) => (
                      <tr key={r.fuelType}>
                        <td className="px-3 py-2">{r.fuelType}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.salesCount}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.totalVolume.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.totalAmount.toFixed(2)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title={t("app.fuel.reports.recentSales")}>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t("app.fuel.sales.table.date")}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t("app.fuel.sales.table.nozzle")}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t("app.fuel.reports.fuelType")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("app.fuel.sales.table.volume")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("app.fuel.sales.table.total")}</th>
                    {isThermal(paper) ? null : <th className="px-3 py-2 text-left font-semibold">{t("app.fuel.sales.table.payment")}</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {data.sales.length === 0 ? (
                    <tr>
                      <td colSpan={isThermal(paper) ? 5 : 6} className="px-3 py-6 text-center text-gray-500">{t("app.fuel.reports.empty")}</td>
                    </tr>
                  ) : (
                    data.sales.map((s) => (
                      <tr key={s.id}>
                        <td className="px-3 py-2">{new Date(s.createdAt).toLocaleString()}</td>
                        <td className="px-3 py-2">{s.nozzle.name}</td>
                        <td className="px-3 py-2">{s.nozzle.tank.fuelType}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{s.volume}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{s.totalAmount}</td>
                        {isThermal(paper) ? null : <td className="px-3 py-2">{s.paymentMethod}</td>}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
