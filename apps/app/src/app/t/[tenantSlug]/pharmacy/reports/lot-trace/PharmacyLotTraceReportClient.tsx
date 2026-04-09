"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };
type Location = { id: string; name: string };
type LocationsResponse = { data: Array<{ id: string; name: string; isActive: boolean }> };

type LotSearchRow = {
  id: string;
  lotNumber: string;
  expiryDate: string | null;
  onHandQty: string;
  createdAt: string;
  product: { id: string; name: string; sku: string | null };
  location: { id: string; name: string };
};
type LotSearchResponse = { data: { items: LotSearchRow[]; page: number; pageSize: number; total: number } };

type LotDetailResponse = {
  data: {
    lot: LotSearchRow;
    totals: { received: string; sold: string; refunded: string };
    receipts: Array<{
      id: string;
      quantity: string;
      unitCost: string;
      createdAt: string;
      invoice: { id: string; purchaseNumber: string; status: string; postedAt: string | null; supplier: { id: string; name: string } | null };
    }>;
    allocations: Array<{
      id: string;
      quantity: string;
      createdAt: string;
      invoice: { id: string; invoiceNumber: string; kind: "sale" | "refund"; status: string; postedAt: string | null; customer: { id: string; name: string } | null; location: { id: string; name: string } | null };
    }>;
  };
};

export function PharmacyLotTraceReportClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<string>("all");
  const [q, setQ] = useState("");

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<LotSearchRow[]>([]);
  const [total, setTotal] = useState(0);

  const [selectedLotId, setSelectedLotId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<LotDetailResponse["data"] | null>(null);

  const effectiveLocations = useMemo(() => locations, [locations]);

  const exportXlsx = useCallback(async () => {
    if (!tenantId) return;
    setExportingXlsx(true);
    setErrorKey(null);
    try {
      try {
        const location = locationId !== "all" ? locationId : undefined;
        const threshold = `q=${q.trim() || ""};lotId=${selectedLotId ?? ""}`;
        await apiFetch("/api/pharmacy/reports/export-log", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
          body: JSON.stringify({ reportId: "pharmacy.reports.lotTrace.v1", format: "xlsx", locationId: location, threshold })
        });
      } catch {}
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const safeDate = new Date().toISOString().slice(0, 10);

      if (detail) {
        const filename = `pharmacy_lot_trace_${detail.lot.lotNumber}_${safeDate}.xlsx`;
        const metaAoA = [
          ["Pharmacy lot trace"],
          ["Exported at", new Date().toISOString()],
          ["Product", detail.lot.product.name],
          ["SKU", detail.lot.product.sku ?? ""],
          ["Lot", detail.lot.lotNumber],
          ["Expiry", detail.lot.expiryDate ? new Date(detail.lot.expiryDate).toISOString().slice(0, 10) : ""],
          ["Location", detail.lot.location.name],
          ["On hand", detail.lot.onHandQty],
          ["Received", detail.totals.received],
          ["Sold", detail.totals.sold],
          ["Refunded", detail.totals.refunded]
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metaAoA), "Summary");

        const receiptsHeader = ["Purchase #", "Supplier", "Qty", "Unit cost", "Created at"];
        const receiptsRows = detail.receipts.map((r) => [r.invoice.purchaseNumber, r.invoice.supplier?.name ?? "", r.quantity, r.unitCost, new Date(r.createdAt).toISOString()]);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([receiptsHeader, ...receiptsRows]), "Receipts");

        const allocHeader = ["Invoice #", "Kind", "Customer", "Qty", "Created at"];
        const allocRows = detail.allocations.map((a) => [a.invoice.invoiceNumber, a.invoice.kind, a.invoice.customer?.name ?? "", a.quantity, new Date(a.createdAt).toISOString()]);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([allocHeader, ...allocRows]), "Sales");

        XLSX.writeFile(wb, filename);
        return;
      }

      const filename = `pharmacy_lot_trace_${safeDate}.xlsx`;
      const metaAoA = [
        ["Pharmacy lot trace"],
        ["Exported at", new Date().toISOString()],
        ["Query", q.trim() || ""],
        ["Location", locationId === "all" ? t("common.all") : effectiveLocations.find((l) => l.id === locationId)?.name ?? locationId],
        ["Rows", String(items.length)]
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metaAoA), "Summary");

      const header = ["Product", "SKU", "Lot", "Expiry", "Location", "On hand", "Created at"];
      const rows = items.map((r) => [
        r.product.name,
        r.product.sku ?? "",
        r.lotNumber,
        r.expiryDate ? new Date(r.expiryDate).toISOString().slice(0, 10) : "",
        r.location.name,
        r.onHandQty,
        new Date(r.createdAt).toISOString()
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Lots");

      XLSX.writeFile(wb, filename);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setExportingXlsx(false);
      setExportMenuOpen(false);
    }
  }, [detail, effectiveLocations, items, locationId, q, selectedLotId, t, tenantId]);

  const search = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    setItems([]);
    setTotal(0);
    setSelectedLotId(null);
    setDetail(null);
    try {
      const params = new URLSearchParams();
      params.set("q", q.trim());
      if (locationId !== "all") params.set("locationId", locationId);
      params.set("page", "1");
      params.set("pageSize", "20");
      const res = await apiFetch(`/api/pharmacy/reports/lot-trace?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as LotSearchResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const data = (json as LotSearchResponse).data;
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [locationId, q, tenantId]);

  const loadDetail = useCallback(
    async (lotId: string) => {
      if (!tenantId) return;
      setSelectedLotId(lotId);
      setDetailLoading(true);
      setErrorKey(null);
      try {
        const res = await apiFetch(`/api/pharmacy/reports/lot-trace/${lotId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as LotDetailResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        setDetail((json as LotDetailResponse).data);
      } catch {
        setErrorKey("errors.internal");
      } finally {
        setDetailLoading(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadTenant() {
      setLoadingTenant(true);
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
        if (!cancelled) setLoadingTenant(false);
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
        const invRes = await apiFetch("/api/pharmacy/locations", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!invRes.ok) return;
        const invJson = (await invRes.json()) as LocationsResponse;
        if (!cancelled) {
          const locs = (invJson.data ?? []).filter((l) => l.isActive).map((l) => ({ id: l.id, name: l.name }));
          setLocations(locs);
        }
      } catch {
        if (!cancelled) setErrorKey("errors.internal");
      }
    }
    void loadLocations();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const detailTitle = useMemo(() => {
    if (!detail) return "";
    return `${detail.lot.product.name} · ${detail.lot.lotNumber}`;
  }, [detail]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Link className="text-sm font-medium text-gray-600 hover:text-gray-900" href={`/t/${props.tenantSlug}/pharmacy/reports`}>
                {t("app.pharmacy.reports.back")}
              </Link>
              <div className="text-sm text-gray-400">/</div>
              <div className="text-2xl font-semibold">{t("app.pharmacy.reports.lotTrace.title")}</div>
            </div>
            <div className="mt-2 text-gray-700">{t("app.pharmacy.reports.lotTrace.subtitle")}</div>
          </div>
          <div className="relative">
            <button
              type="button"
              disabled={loadingTenant || exportingXlsx || (!detail && items.length === 0)}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setExportMenuOpen((v) => !v)}
            >
              {exportingXlsx ? t("common.working") : t("app.shop.reports.export.button")}
            </button>
            {exportMenuOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50" onClick={() => void exportXlsx()}>
                  <span className="inline-block h-4 w-4 text-gray-600">
                    <svg viewBox="0 0 24 24" fill="none">
                      <path d="M7 3h10v18H7V3Zm2 4h6M9 11h6M9 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  {t("app.shop.reports.export.excel")}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.reports.lotTrace.filter.search")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("app.pharmacy.reports.lotTrace.filter.search.placeholder")} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.reports.lotTrace.filter.location")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={!effectiveLocations.length}>
              <option value="all">{t("common.all")}</option>
              {effectiveLocations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="button" className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60" onClick={() => void search()} disabled={loadingTenant || !q.trim()}>
              {loading ? t("common.working") : t("common.button.search")}
            </button>
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
          <div className="border-b border-gray-200 px-5 py-4">
            <div className="text-sm font-semibold text-gray-900">{t("app.pharmacy.reports.lotTrace.results.title")}</div>
            <div className="mt-1 text-xs text-gray-600">
              {t("app.pharmacy.reports.lotTrace.results.subtitle")} {total}
            </div>
          </div>
          <div className="divide-y divide-gray-100">
            {loading ? (
              <div className="px-5 py-4 text-sm text-gray-700">{t("common.loading")}</div>
            ) : items.length === 0 ? (
              <div className="px-5 py-4 text-sm text-gray-700">{t("app.pharmacy.reports.lotTrace.results.empty")}</div>
            ) : (
              items.map((r) => (
                <button key={r.id} type="button" className={["w-full px-5 py-4 text-left hover:bg-gray-50", selectedLotId === r.id ? "bg-gray-50" : ""].join(" ")} onClick={() => void loadDetail(r.id)}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">{r.product.name}</div>
                      <div className="mt-1 text-xs text-gray-600">
                        {t("app.pharmacy.reports.lotTrace.results.lot")}: {r.lotNumber} · {r.location.name}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] font-medium text-gray-600">{t("app.pharmacy.reports.lotTrace.results.onHand")}</div>
                      <div className="mt-1 text-sm font-semibold text-gray-900 tabular">{r.onHandQty}</div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
          <div className="border-b border-gray-200 px-5 py-4">
            <div className="text-sm font-semibold text-gray-900">{t("app.pharmacy.reports.lotTrace.detail.title")}</div>
            <div className="mt-1 text-xs text-gray-600">{detailTitle || t("app.pharmacy.reports.lotTrace.detail.subtitle")}</div>
          </div>

          {!selectedLotId ? (
            <div className="px-5 py-4 text-sm text-gray-700">{t("app.pharmacy.reports.lotTrace.detail.empty")}</div>
          ) : detailLoading ? (
            <div className="px-5 py-4 text-sm text-gray-700">{t("common.loading")}</div>
          ) : !detail ? (
            <div className="px-5 py-4 text-sm text-gray-700">{t("app.pharmacy.reports.lotTrace.detail.empty")}</div>
          ) : (
            <div className="px-5 py-4 space-y-5">
              <div className="grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="text-[11px] font-medium text-gray-600">{t("app.pharmacy.reports.lotTrace.totals.received")}</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900 tabular">{detail.totals.received}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="text-[11px] font-medium text-gray-600">{t("app.pharmacy.reports.lotTrace.totals.sold")}</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900 tabular">{detail.totals.sold}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="text-[11px] font-medium text-gray-600">{t("app.pharmacy.reports.lotTrace.totals.refunded")}</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900 tabular">{detail.totals.refunded}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="text-[11px] font-medium text-gray-600">{t("app.pharmacy.reports.lotTrace.totals.onHand")}</div>
                  <div className="mt-1 text-lg font-semibold text-gray-900 tabular">{detail.lot.onHandQty}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200">
                <div className="border-b border-gray-200 px-4 py-3">
                  <div className="text-sm font-semibold text-gray-900">{t("app.pharmacy.reports.lotTrace.section.receipts")}</div>
                </div>
                {detail.receipts.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-gray-700">{t("app.pharmacy.reports.lotTrace.section.empty")}</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {detail.receipts.map((r) => (
                      <div key={r.id} className="flex items-start justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900">{r.invoice.purchaseNumber}</div>
                          <div className="mt-1 text-xs text-gray-600">
                            {r.invoice.supplier ? r.invoice.supplier.name : "—"} · {new Date(r.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs text-gray-600">{t("app.pharmacy.reports.lotTrace.qty")}</div>
                          <div className="text-sm font-semibold text-gray-900 tabular">{r.quantity}</div>
                          <Link className="mt-1 inline-flex text-xs font-medium text-primary-700 hover:underline" href={`/t/${props.tenantSlug}/pharmacy/purchases/${r.invoice.id}`}>
                            {t("common.button.open")}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-gray-200">
                <div className="border-b border-gray-200 px-4 py-3">
                  <div className="text-sm font-semibold text-gray-900">{t("app.pharmacy.reports.lotTrace.section.allocations")}</div>
                </div>
                {detail.allocations.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-gray-700">{t("app.pharmacy.reports.lotTrace.section.empty")}</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {detail.allocations.map((a) => (
                      <div key={a.id} className="flex items-start justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900">
                            {a.invoice.invoiceNumber} · {a.invoice.kind === "sale" ? t("app.pharmacy.reports.lotTrace.kind.sale") : t("app.pharmacy.reports.lotTrace.kind.refund")}
                          </div>
                          <div className="mt-1 text-xs text-gray-600">
                            {a.invoice.customer ? a.invoice.customer.name : "—"} · {new Date(a.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs text-gray-600">{t("app.pharmacy.reports.lotTrace.qty")}</div>
                          <div className="text-sm font-semibold text-gray-900 tabular">{a.quantity}</div>
                          <Link className="mt-1 inline-flex text-xs font-medium text-primary-700 hover:underline" href={`/t/${props.tenantSlug}/pharmacy/orders/${a.invoice.id}`}>
                            {t("common.button.open")}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
