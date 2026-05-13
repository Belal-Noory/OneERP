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

type Category = { id: string; name: string };
type CategoriesResponse = { data: Category[] };

type ProductRow = { id: string; name: string; sku: string | null; sellPrice: string; status: "active" | "archived"; category: { id: string; name: string } | null };
type ProductsResponse = { data: { items: ProductRow[]; page: number; pageSize: number; total: number } };
type SettingsResponse = { data: { sellCurrencyCode: string } };

type Paper = "a4" | "thermal80" | "thermal58";

function isThermal(paper: Paper): paper is "thermal58" | "thermal80" {
  return paper === "thermal58" || paper === "thermal80";
}

function paperParamToFileSuffix(paper: Paper): string {
  if (paper === "a4") return "a4";
  return paper;
}

export function PrintPharmacyMedicinesClient(props: { tenantSlug: string }) {
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
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [paper, setPaper] = useState<Paper>(initialPaper);
  const [paddingMm, setPaddingMm] = useState(10);
  const [fontScale, setFontScale] = useState<"compact" | "normal" | "large">("normal");
  const [footerText, setFooterText] = useState("");

  const [q, setQ] = useState(() => searchParams.get("q")?.trim() ?? "");
  const [status, setStatus] = useState<"active" | "archived">(() => (searchParams.get("status") === "archived" ? "archived" : "active"));
  const [categoryId, setCategoryId] = useState(() => searchParams.get("categoryId")?.trim() ?? "");

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<ProductRow[]>([]);
  const [sellCurrencyCode, setSellCurrencyCode] = useState("USD");

  const [exportingPdf, setExportingPdf] = useState(false);
  const [pdfExported, setPdfExported] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`oneerp.pharmacy.printSettings.${props.tenantSlug}.medicines`);
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
      localStorage.setItem(`oneerp.pharmacy.printSettings.${props.tenantSlug}.medicines`, JSON.stringify({ paper, paddingMm, fontScale, footerText }));
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
        if (q.trim()) params.set("q", q.trim());
        params.set("status", status);
        if (categoryId.trim()) params.set("categoryId", categoryId.trim());
        params.set("page", "1");
        params.set("pageSize", "50");
        const [tenantRes, settingsRes, catsRes] = await Promise.all([
          apiFetch("/api/tenants/current", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch("/api/pharmacy/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch("/api/pharmacy/categories", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);
        const tenantJson = (await tenantRes.json()) as TenantCurrentResponse;
        if (!tenantRes.ok || !tenantJson.data || !settingsRes.ok || !catsRes.ok) {
          setErrorKey("errors.internal");
          return;
        }
        const settingsJson = (await settingsRes.json()) as SettingsResponse;
        const catsJson = (await catsRes.json()) as CategoriesResponse;
        const all: ProductRow[] = [];
        for (let p = 1; p <= 60; p += 1) {
          const pageParams = new URLSearchParams(params.toString());
          pageParams.set("page", String(p));
          const res = await apiFetch(`/api/pharmacy/products?${pageParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
          const json = (await res.json()) as ProductsResponse;
          if (!res.ok) break;
          const batch = json.data.items ?? [];
          all.push(...batch);
          if (batch.length < 50) break;
          if (all.length >= 500) break;
        }
        if (!cancelled) {
          setTenant(tenantJson.data);
          setSellCurrencyCode(settingsJson.data.sellCurrencyCode ?? "USD");
          setCategories(catsJson.data ?? []);
          setItems(all);
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
  }, [tenantId, q, status, categoryId]);

  useEffect(() => {
    let cancelled = false;
    async function exportPdf() {
      if (!download || !tenantId) return;
      if (pdfExported) return;
      setExportingPdf(true);
      try {
        try {
          const threshold = `q=${q.trim() || ""};status=${status};categoryId=${categoryId.trim() || ""}`;
          await apiFetch("/api/pharmacy/reports/export-log", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
            body: JSON.stringify({ reportId: "pharmacy.medicines.list.v1", format: "pdf", threshold })
          });
        } catch {}
        const paperEl = document.querySelector(".print-paper") as HTMLElement | null;
        if (!paperEl) return;
        const html2canvas = (await import("html2canvas")).default;
        const { jsPDF } = await import("jspdf");
        const canvas = await html2canvas(paperEl, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
        const imgData = canvas.toDataURL("image/png");
        const safeDate = new Date().toISOString().slice(0, 10);
        const filename = `pharmacy_medicines_${safeDate}_${paperParamToFileSuffix(paper)}.pdf`;
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
  }, [download, paper, pdfExported, q, status, categoryId, tenantId]);

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card text-sm text-gray-700">{t("common.loading")}</div>;
  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  if (!tenant) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t("errors.internal")}</div>;

  const catName = categoryId.trim() ? categories.find((c) => c.id === categoryId.trim())?.name ?? categoryId.trim() : t("common.all");

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

        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("common.search")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={q} onChange={(e) => setQ(e.target.value)} disabled={download} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("common.status")}</label>
            <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value as "active" | "archived")} disabled={download}>
              <option value="active">{t("common.status.active")}</option>
              <option value="archived">{t("common.status.archived")}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.products.field.category")}</label>
            <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={download}>
              <option value="">{t("common.all")}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.print.footer.label")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={footerText} onChange={(e) => setFooterText(e.target.value)} placeholder={t("app.shop.print.footer.placeholder")} disabled={download} />
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
                  {tenant.branding.address ? <div className="mt-1 text-xs text-gray-600">{tenant.branding.address}</div> : null}
                  <div className="mt-1 text-xs text-gray-600">
                    {tenant.branding.phone ? `${tenant.branding.phone}` : ""}
                    {tenant.branding.phone && tenant.branding.email ? " • " : ""}
                    {tenant.branding.email ? tenant.branding.email : ""}
                  </div>
                </div>
              </div>
              {!isThermalPaper ? (
                <div className="text-right text-sm">
                  <div className="text-xs font-medium text-gray-600">{t("app.pharmacy.export.printTitle.medicines")}</div>
                  <div className="mt-1 text-xs text-gray-600">
                    {t("app.shop.products.field.category")}: <span className="font-medium text-gray-900">{catName}</span>
                  </div>
                </div>
              ) : null}
            </div>
            {isThermalPaper ? <div className="mt-2 text-xs text-gray-600">{t("app.pharmacy.export.printTitle.medicines")}</div> : null}
          </div>

          {isThermalPaper ? (
            <div className="mt-4 text-xs">
              <div className="border-t border-dashed border-gray-300 pt-3">
                {items.slice(0, 80).map((p) => (
                  <div key={p.id} className="thermal-row">
                    <div className="thermal-row-top">
                      <div className="min-w-0 font-medium text-gray-900">{p.name}</div>
                      <div className="shrink-0 text-right font-medium text-gray-900">{formatMoney(p.sellPrice, sellCurrencyCode)}</div>
                    </div>
                    <div className="mt-1 thermal-row-sub text-gray-600">
                      {p.sku ?? "—"}
                      {p.category?.name ? ` · ${p.category.name}` : ""}
                    </div>
                  </div>
                ))}
              </div>
              {items.length > 80 ? <div className="mt-3 text-center text-xs text-gray-600">…</div> : null}
            </div>
          ) : (
            <div className="mt-6">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-gray-200 py-2 text-left font-semibold text-gray-900">{t("app.shop.products.table.name")}</th>
                    <th className="border-b border-gray-200 py-2 text-left font-semibold text-gray-900">{t("app.shop.products.table.sku")}</th>
                    <th className="border-b border-gray-200 py-2 text-right font-semibold text-gray-900">{t("app.shop.products.table.price")}</th>
                    <th className="border-b border-gray-200 py-2 text-left font-semibold text-gray-900">{t("app.shop.products.table.category")}</th>
                    <th className="border-b border-gray-200 py-2 text-left font-semibold text-gray-900">{t("app.shop.products.table.status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.slice(0, 500).map((p) => (
                    <tr key={p.id}>
                      <td className="border-b border-gray-100 py-2 pr-3 text-gray-900">{p.name}</td>
                      <td className="border-b border-gray-100 py-2 pr-3 text-gray-700">{p.sku ?? "—"}</td>
                      <td className="border-b border-gray-100 py-2 text-right font-medium text-gray-900 tabular">{formatMoney(p.sellPrice, sellCurrencyCode)}</td>
                      <td className="border-b border-gray-100 py-2 pr-3 text-gray-700">{p.category?.name ?? "—"}</td>
                      <td className="border-b border-gray-100 py-2 pr-3 text-gray-700">{p.status === "active" ? t("common.status.active") : t("common.status.archived")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {items.length > 500 ? <div className="mt-3 text-center text-xs text-gray-600">…</div> : null}
            </div>
          )}

          <div className={isThermalPaper ? "mt-4 border-t border-dashed border-gray-300 pt-3 text-center text-xs text-gray-600" : "mt-6 text-center text-xs text-gray-600"}>
            {(footerText?.trim() ? footerText.trim() : t("app.shop.print.thanks")) || " "}
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
