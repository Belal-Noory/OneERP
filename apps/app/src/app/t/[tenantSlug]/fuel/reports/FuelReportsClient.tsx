"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

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

type TenantCurrentResponse = {
  data: {
    tenant: { id: string; slug: string; legalName: string; displayName: string; defaultLocale: string; status: string };
    branding: { logoUrl: string | null; address: string | null; phone: string | null; email: string | null };
  } | null;
};

type Paper = "a4" | "thermal80" | "thermal58";

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toDayEndIso(dateStr: string): string {
  return new Date(dateStr + "T23:59:59.999Z").toISOString();
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function isThermal(paper: Paper) {
  return paper === "thermal58" || paper === "thermal80";
}

function paperParamToFileSuffix(paper: Paper): string {
  if (paper === "a4") return "a4";
  return paper;
}

export function FuelReportsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingPdfPaper, setExportingPdfPaper] = useState<Paper | null>(null);
  const [exportTenant, setExportTenant] = useState<TenantCurrentResponse["data"]>(null);
  const [exportLogoDataUrl, setExportLogoDataUrl] = useState<string | null>(null);
  const [exportPaper, setExportPaper] = useState<Paper>("a4");

  const [range, setRange] = useState<"today" | "week" | "month" | "custom">("week");
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return isoDate(d);
  });
  const [to, setTo] = useState(() => isoDate(new Date()));

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", toDayEndIso(to));
    p.set("limit", "200");
    return p;
  }, [from, to]);

  const computed = useMemo(() => {
    const sales = reportData?.sales ?? [];

    const byPayment = new Map<string, { method: string; salesCount: number; totalAmount: number; totalVolume: number }>();
    const byFuel = new Map<string, { fuelType: string; salesCount: number; totalAmount: number; totalVolume: number }>();

    for (const s of sales) {
      const methodKey = s.paymentMethod || "unknown";
      const fuelKey = s.nozzle?.tank?.fuelType || "unknown";
      const amount = Number(s.totalAmount) || 0;
      const volume = Number(s.volume) || 0;

      const methodRow = byPayment.get(methodKey) ?? { method: methodKey, salesCount: 0, totalAmount: 0, totalVolume: 0 };
      methodRow.salesCount += 1;
      methodRow.totalAmount += amount;
      methodRow.totalVolume += volume;
      byPayment.set(methodKey, methodRow);

      const fuelRow = byFuel.get(fuelKey) ?? { fuelType: fuelKey, salesCount: 0, totalAmount: 0, totalVolume: 0 };
      fuelRow.salesCount += 1;
      fuelRow.totalAmount += amount;
      fuelRow.totalVolume += volume;
      byFuel.set(fuelKey, fuelRow);
    }

    return {
      byPayment: Array.from(byPayment.values()).sort((a, b) => b.totalAmount - a.totalAmount),
      byFuel: Array.from(byFuel.values()).sort((a, b) => b.totalAmount - a.totalAmount)
    };
  }, [reportData]);

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

  const reloadReport = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/fuel/reports?${queryParams.toString()}`, {
        cache: "no-store",
        headers: { "X-Tenant-Id": tenantId }
      });
      const json = (await res.json()) as { data?: ReportData; error?: { message_key?: string } };
      if (!res.ok || !json.data) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setReportData(json.data);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [queryParams, tenantId]);

  useEffect(() => {
    void reloadReport();
  }, [reloadReport]);

  useEffect(() => {
    const today = isoDate(new Date());
    if (range === "today") {
      setFrom(today);
      setTo(today);
      return;
    }
    if (range === "week") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      setFrom(isoDate(d));
      setTo(today);
      return;
    }
    if (range === "month") {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      setFrom(isoDate(d));
      setTo(today);
    }
  }, [range]);

  async function exportExcel() {
    if (!tenantId) return;
    setExportingXlsx(true);
    setErrorKey(null);
    try {
      const p = new URLSearchParams();
      if (from) p.set("from", new Date(from).toISOString());
      if (to) p.set("to", toDayEndIso(to));
      p.set("limit", "5000");

      const res = await apiFetch(`/api/fuel/reports?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as { data?: ReportData; error?: { message_key?: string } };
      if (!res.ok || !json.data) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }

      const sales = json.data.sales ?? [];
      const byPayment = new Map<string, { salesCount: number; totalAmount: number; totalVolume: number }>();
      const byFuel = new Map<string, { salesCount: number; totalAmount: number; totalVolume: number }>();
      for (const s of sales) {
        const methodKey = s.paymentMethod || "unknown";
        const fuelKey = s.nozzle?.tank?.fuelType || "unknown";
        const amount = Number(s.totalAmount) || 0;
        const volume = Number(s.volume) || 0;

        const m = byPayment.get(methodKey) ?? { salesCount: 0, totalAmount: 0, totalVolume: 0 };
        m.salesCount += 1;
        m.totalAmount += amount;
        m.totalVolume += volume;
        byPayment.set(methodKey, m);

        const f = byFuel.get(fuelKey) ?? { salesCount: 0, totalAmount: 0, totalVolume: 0 };
        f.salesCount += 1;
        f.totalAmount += amount;
        f.totalVolume += volume;
        byFuel.set(fuelKey, f);
      }

      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      const rangeLabel = `${from || ""} → ${to || ""}`;
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          [t("app.shop.reports.export.range"), rangeLabel],
          [t("app.fuel.reports.salesCount"), json.data.salesCount],
          [t("app.fuel.reports.totalSales"), Number(json.data.totalSales)],
          [t("app.fuel.reports.totalVolume"), Number(json.data.totalVolume)]
        ]),
        t("app.shop.reports.export.sheet.summary")
      );

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          [t("app.fuel.sales.table.payment"), t("app.fuel.reports.salesCount"), t("app.fuel.reports.totalVolume"), t("app.fuel.reports.totalSales")],
          ...Array.from(byPayment.entries())
            .map(([method, v]) => [method, v.salesCount, v.totalVolume, v.totalAmount])
            .sort((a, b) => Number(b[3]) - Number(a[3]))
        ]),
        t("app.fuel.reports.export.sheet.payments")
      );

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ["Fuel type", t("app.fuel.reports.salesCount"), t("app.fuel.reports.totalVolume"), t("app.fuel.reports.totalSales")],
          ...Array.from(byFuel.entries())
            .map(([fuelType, v]) => [fuelType, v.salesCount, v.totalVolume, v.totalAmount])
            .sort((a, b) => Number(b[3]) - Number(a[3]))
        ]),
        t("app.fuel.reports.export.sheet.fuelTypes")
      );

      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          [
            t("app.fuel.sales.table.date"),
            t("app.fuel.sales.table.nozzle"),
            "Fuel",
            t("app.fuel.sales.table.volume"),
            t("app.fuel.sales.table.total"),
            t("app.fuel.sales.table.payment"),
            "Customer",
            "Driver",
            "Plate"
          ],
          ...sales.map((s) => [
            new Date(s.createdAt).toISOString(),
            s.nozzle.name,
            s.nozzle.tank.fuelType,
            Number(s.volume),
            Number(s.totalAmount),
            s.paymentMethod,
            s.customer?.name ?? "",
            s.driverName ?? "",
            s.licensePlate ?? ""
          ])
        ]),
        t("app.fuel.reports.export.sheet.sales")
      );

      const safeFrom = from || "from";
      const safeTo = to || "to";
      XLSX.writeFile(wb, `fuel_reports_${safeFrom}_${safeTo}.xlsx`);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setExportingXlsx(false);
      setExportMenuOpen(false);
    }
  }

  async function exportPdf(paper: Paper) {
    if (!tenantId || !reportData) return;
    if (exportingPdf) return;
    setExportingPdf(true);
    setExportingPdfPaper(paper);
    setExportMenuOpen(false);
    setErrorKey(null);
    setExportTenant(null);
    setExportLogoDataUrl(null);
    setExportPaper(paper);

    try {
      const tenantRes = await apiFetch("/api/tenants/current", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const tenantJson = (await tenantRes.json()) as TenantCurrentResponse;
      if (!tenantRes.ok || !tenantJson.data) {
        setErrorKey("errors.internal");
        return;
      }

      let logoDataUrl: string | null = null;
      const logoUrl = tenantJson.data.branding.logoUrl ?? null;
      if (logoUrl) {
        try {
          const r = await apiFetch(logoUrl, { cache: "no-store" });
          if (r.ok) {
            const bytes = new Uint8Array(await r.arrayBuffer());
            const contentType = r.headers.get("content-type") ?? "image/png";
            logoDataUrl = `data:${contentType};base64,${base64FromBytes(bytes)}`;
          }
        } catch {}
      }

      setExportTenant(tenantJson.data);
      setExportLogoDataUrl(logoDataUrl);

      const startedAt = Date.now();
      let paperEl: HTMLElement | null = null;
      while (!paperEl && Date.now() - startedAt < 2000) {
        await new Promise((r) => window.setTimeout(r, 50));
        paperEl = document.querySelector(".fuel-reports-export-paper") as HTMLElement | null;
      }
      if (!paperEl) {
        setErrorKey("errors.internal");
        return;
      }

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
        pdf.save(filename);
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

        pdf.save(filename);
      }
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setExportingPdf(false);
      setExportingPdfPaper(null);
      setExportTenant(null);
      setExportLogoDataUrl(null);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-lg font-semibold">{t("app.fuel.reports.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.fuel.reports.subtitle")}</div>
        <div className="mt-6 text-gray-500">{t("common.loading")}</div>
      </div>
    );
  }

  if (errorKey) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-lg font-semibold">{t("app.fuel.reports.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.fuel.reports.subtitle")}</div>
        <div className="mt-6 text-red-600">{t(errorKey)}</div>
      </div>
    );
  }

  if (!reportData) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-lg font-semibold">{t("app.fuel.reports.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.fuel.reports.subtitle")}</div>
        <div className="mt-6 text-gray-500">{t("app.fuel.reports.empty")}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-lg font-semibold">{t("app.fuel.reports.title")}</div>
          <div className="mt-2 text-gray-700">{t("app.fuel.reports.subtitle")}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              className={range === "today" ? "h-10 rounded-xl bg-gray-900 px-3 text-sm font-medium text-white" : "h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"}
              onClick={() => setRange("today")}
            >
              {t("app.fuel.reports.today")}
            </button>
            <button
              type="button"
              className={range === "week" ? "h-10 rounded-xl bg-gray-900 px-3 text-sm font-medium text-white" : "h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"}
              onClick={() => setRange("week")}
            >
              {t("app.fuel.reports.thisWeek")}
            </button>
            <button
              type="button"
              className={range === "month" ? "h-10 rounded-xl bg-gray-900 px-3 text-sm font-medium text-white" : "h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"}
              onClick={() => setRange("month")}
            >
              {t("app.fuel.reports.thisMonth")}
            </button>
            <button
              type="button"
              className={range === "custom" ? "h-10 rounded-xl bg-gray-900 px-3 text-sm font-medium text-white" : "h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"}
              onClick={() => setRange("custom")}
            >
              {t("app.fuel.reports.custom")}
            </button>
          </div>

          {range === "custom" ? (
            <>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.fuel.reports.filter.from")}</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 h-10 rounded-xl border border-gray-200 px-3 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.fuel.reports.filter.to")}</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 h-10 rounded-xl border border-gray-200 px-3 text-sm" />
              </div>
            </>
          ) : null}

          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
            onClick={() => void reloadReport()}
          >
            {t("common.button.refresh")}
          </button>

          <div className="relative">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setExportMenuOpen((v) => !v)}
              disabled={exportingXlsx || exportingPdf || !reportData}
            >
              {exportingXlsx || exportingPdf ? t("common.working") : t("app.shop.reports.export.button")}
            </button>
            {exportMenuOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  onClick={() => void exportExcel()}
                  disabled={exportingPdf || exportingXlsx}
                >
                  <span className="inline-block h-4 w-4 text-gray-600">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M7 3h10v18H7V3Zm2 4h6M9 11h6M9 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {t("app.shop.reports.export.excel")}
                </button>

                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  disabled={exportingXlsx || exportingPdf}
                  onClick={() => void exportPdf("a4")}
                >
                  <span className="inline-block h-4 w-4 text-gray-600">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M7 3h10v6H7V3Zm0 8h10v10H7V11Zm2 3h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {exportingPdfPaper === "a4" ? t("common.working") : t("app.shop.reports.export.pdfA4")}
                </button>

                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  disabled={exportingXlsx || exportingPdf}
                  onClick={() => void exportPdf("thermal80")}
                >
                  <span className="inline-block h-4 w-4 text-gray-600">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M7 3h10v6H7V3Zm0 8h10v10H7V11Zm2 3h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {exportingPdfPaper === "thermal80" ? t("common.working") : t("app.shop.reports.export.pdf80")}
                </button>

                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  disabled={exportingXlsx || exportingPdf}
                  onClick={() => void exportPdf("thermal58")}
                >
                  <span className="inline-block h-4 w-4 text-gray-600">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M7 3h10v6H7V3Zm0 8h10v10H7V11Zm2 3h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {exportingPdfPaper === "thermal58" ? t("common.working") : t("app.shop.reports.export.pdf58")}
                </button>

                <a
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/fuel/reports/print?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&paper=a4`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span className="inline-block h-4 w-4 text-gray-600">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M6 9h12v10H6V9Zm2-6h8v4H8V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {t("app.shop.reports.export.printView")}
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {exportingPdf && exportTenant ? (
        <div className="fixed left-[-12000px] top-0 bg-white">
          <div
            className="fuel-reports-export-paper rounded-2xl border border-gray-200 bg-white p-6 shadow-card"
            style={{
              width: exportPaper === "thermal58" ? "58mm" : exportPaper === "thermal80" ? "80mm" : "210mm"
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">{exportTenant.tenant.displayName || exportTenant.tenant.legalName}</div>
                {exportTenant.branding.address ? <div className="mt-1 text-xs text-gray-600">{exportTenant.branding.address}</div> : null}
                {exportTenant.branding.phone ? <div className="text-xs text-gray-600">{exportTenant.branding.phone}</div> : null}
              </div>
              {exportLogoDataUrl ? <img src={exportLogoDataUrl} alt="" className="h-12 w-auto object-contain" /> : null}
            </div>

            <div className="mt-4 border-t border-dashed border-gray-200 pt-4">
              <div className="text-sm font-semibold">{t("app.fuel.reports.title")}</div>
              <div className="mt-1 text-xs text-gray-600">{t("app.shop.reports.export.range")}: {from} → {to}</div>
            </div>

            <div className={exportPaper === "a4" ? "mt-4 grid grid-cols-3 gap-2" : "mt-4 grid gap-2"}>
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.reports.totalSales")}</div>
                <div className="mt-1 text-base font-semibold tabular-nums">{reportData.totalSales}</div>
              </div>
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.reports.totalVolume")}</div>
                <div className="mt-1 text-base font-semibold tabular-nums">{reportData.totalVolume}</div>
              </div>
              <div className="rounded-xl border border-gray-200 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.reports.salesCount")}</div>
                <div className="mt-1 text-base font-semibold tabular-nums">{reportData.salesCount}</div>
              </div>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
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
                  {computed.byPayment.map((r) => (
                    <tr key={r.method}>
                      <td className="px-3 py-2">{r.method}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.salesCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.totalVolume.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.totalAmount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
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
                  {computed.byFuel.map((r) => (
                    <tr key={r.fuelType}>
                      <td className="px-3 py-2">{r.fuelType}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.salesCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.totalVolume.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.totalAmount.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t("app.fuel.sales.table.date")}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t("app.fuel.sales.table.nozzle")}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t("app.fuel.reports.fuelType")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("app.fuel.sales.table.volume")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("app.fuel.sales.table.total")}</th>
                    {exportPaper === "a4" ? <th className="px-3 py-2 text-left font-semibold">{t("app.fuel.sales.table.payment")}</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {(reportData.sales ?? []).slice(0, 200).map((s) => (
                    <tr key={s.id}>
                      <td className="px-3 py-2">{new Date(s.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-2">{s.nozzle.name}</td>
                      <td className="px-3 py-2">{s.nozzle.tank.fuelType}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{s.volume}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{s.totalAmount}</td>
                      {exportPaper === "a4" ? <td className="px-3 py-2">{s.paymentMethod}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-600">{t("app.fuel.reports.totalSales")}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{reportData.totalSales}</div>
          <div className="mt-2 text-xs text-gray-500">{t("app.shop.reports.export.range")}: {from} → {to}</div>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-600">{t("app.fuel.reports.totalVolume")}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{reportData.totalVolume}</div>
        </div>
        <div className="rounded-xl border border-gray-200 p-4">
          <div className="text-sm text-gray-600">{t("app.fuel.reports.salesCount")}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{reportData.salesCount}</div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-gray-200">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900">{t("app.fuel.reports.section.payments")}</div>
          <table className="w-full text-sm">
            <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left">{t("app.fuel.sales.table.payment")}</th>
                <th className="px-4 py-3 text-right">{t("app.fuel.reports.salesCount")}</th>
                <th className="px-4 py-3 text-right">{t("app.fuel.reports.totalVolume")}</th>
                <th className="px-4 py-3 text-right">{t("app.fuel.reports.totalSales")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {computed.byPayment.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">{t("app.fuel.reports.empty")}</td>
                </tr>
              ) : (
                computed.byPayment.map((r) => (
                  <tr key={r.method} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{r.method}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.salesCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.totalVolume.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{r.totalAmount.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900">{t("app.fuel.reports.section.fuelTypes")}</div>
          <table className="w-full text-sm">
            <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr className="border-b border-gray-200">
                <th className="px-4 py-3 text-left">{t("app.fuel.reports.fuelType")}</th>
                <th className="px-4 py-3 text-right">{t("app.fuel.reports.salesCount")}</th>
                <th className="px-4 py-3 text-right">{t("app.fuel.reports.totalVolume")}</th>
                <th className="px-4 py-3 text-right">{t("app.fuel.reports.totalSales")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {computed.byFuel.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">{t("app.fuel.reports.empty")}</td>
                </tr>
              ) : (
                computed.byFuel.map((r) => (
                  <tr key={r.fuelType} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-900">{r.fuelType}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.salesCount}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.totalVolume.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{r.totalAmount.toFixed(2)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900">{t("app.fuel.reports.recentSales")}</div>
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">{t("app.fuel.sales.table.date")}</th>
              <th className="px-4 py-3 text-left">{t("app.fuel.sales.table.nozzle")}</th>
              <th className="px-4 py-3 text-left">{t("app.fuel.reports.fuelType")}</th>
              <th className="px-4 py-3 text-right">{t("app.fuel.sales.table.volume")}</th>
              <th className="px-4 py-3 text-right">{t("app.fuel.sales.table.total")}</th>
              <th className="px-4 py-3 text-left">{t("app.fuel.sales.table.payment")}</th>
              <th className="px-4 py-3 text-left">{t("app.fuel.reports.customer")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {reportData.sales.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">{t("app.fuel.reports.empty")}</td>
              </tr>
            ) : (
              reportData.sales.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{new Date(s.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{s.nozzle.name}</td>
                  <td className="px-4 py-3 text-gray-700">{s.nozzle.tank.fuelType}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{s.volume}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{s.totalAmount}</td>
                  <td className="px-4 py-3 text-gray-700">{s.paymentMethod}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="min-w-0">
                      <div className="truncate">{s.customer?.name ?? ""}</div>
                      {s.driverName || s.licensePlate ? (
                        <div className="truncate text-xs text-gray-500">{[s.driverName ?? "", s.licensePlate ?? ""].filter(Boolean).join(" · ")}</div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
