"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };
type Location = { id: string; name: string };
type LocationsResponse = { data: Array<{ id: string; name: string; isActive: boolean }> };

type LotRow = {
  id: string;
  lotNumber: string;
  expiryDate: string | null;
  onHandQty: string;
  daysToExpiry: number | null;
  status: "expired" | "near" | "ok" | "no_expiry";
  product: { id: string; name: string; sku: string | null };
  location: { id: string; name: string };
};

type LotsResponse = {
  data: {
    page: number;
    pageSize: number;
    total: number;
    nearDays: number;
    summary: { expired: number; near: number; ok: number; noExpiry: number };
    items: LotRow[];
  };
};

export function PharmacyExpiryReportClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(true);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<string>("all");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"near" | "expired">("near");
  const [nearDays, setNearDays] = useState("30");

  const [items, setItems] = useState<LotRow[]>([]);
  const [summary, setSummary] = useState<LotsResponse["data"]["summary"]>({ expired: 0, near: 0, ok: 0, noExpiry: 0 });
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [total, setTotal] = useState(0);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const exportXlsx = useCallback(async () => {
    if (!tenantId) return;
    setExportingXlsx(true);
    setErrorKey(null);
    try {
      try {
        const location = locationId !== "all" ? locationId : undefined;
        const threshold = `status=${status};nearDays=${nearDays.trim() || "30"};q=${q.trim() || ""}`;
        await apiFetch("/api/pharmacy/reports/export-log", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
          body: JSON.stringify({ reportId: "pharmacy.reports.expiry.v1", format: "xlsx", locationId: location, threshold })
        });
      } catch {}
      const XLSX = await import("xlsx");

      const maxRows = 5000;
      const exportPageSize = 500;
      const all: LotRow[] = [];

      for (let p = 1; p <= 100; p += 1) {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        if (locationId !== "all") params.set("locationId", locationId);
        params.set("status", status);
        params.set("nearDays", nearDays.trim() || "30");
        params.set("page", String(p));
        params.set("pageSize", String(exportPageSize));
        const res = await apiFetch(`/api/pharmacy/inventory/lots?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as LotsResponse;
        if (!res.ok) break;
        const batch = json.data.items ?? [];
        all.push(...batch);
        if (batch.length < exportPageSize) break;
        if (all.length >= maxRows) break;
      }

      const safeDate = new Date().toISOString().slice(0, 10);
      const filename = `pharmacy_expiry_${status}_${safeDate}.xlsx`;

      const wb = XLSX.utils.book_new();

      const locName = locationId === "all" ? t("common.all") : locations.find((l) => l.id === locationId)?.name ?? locationId;
      const summaryAoA = [
        ["Pharmacy expiry report"],
        ["Exported at", new Date().toISOString()],
        ["Status", status],
        ["Near days", nearDays.trim() || "30"],
        ["Location", locName],
        ["Query", q.trim() || ""],
        ["Rows", String(all.length)]
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");

      const header = [
        t("app.pharmacy.inventory.lots.table.product"),
        "SKU",
        t("app.pharmacy.inventory.lots.table.lot"),
        t("app.pharmacy.inventory.lots.table.expiry"),
        t("app.pharmacy.inventory.lots.filter.location"),
        t("app.pharmacy.inventory.lots.table.onHand"),
        t("app.pharmacy.inventory.lots.table.status"),
        "Days"
      ];
      const rows = all.slice(0, maxRows).map((r) => [
        r.product.name,
        r.product.sku ?? "",
        r.lotNumber,
        r.expiryDate ? new Date(r.expiryDate).toISOString().slice(0, 10) : "",
        r.location.name,
        r.onHandQty,
        r.status,
        r.daysToExpiry === null ? "" : String(r.daysToExpiry)
      ]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Lots");

      XLSX.writeFile(wb, filename);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setExportingXlsx(false);
      setExportMenuOpen(false);
    }
  }, [locations, locationId, nearDays, q, status, t, tenantId]);

  const loadLots = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (locationId !== "all") params.set("locationId", locationId);
      params.set("status", status);
      params.set("nearDays", nearDays.trim() || "30");
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await apiFetch(`/api/pharmacy/inventory/lots?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as LotsResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const data = (json as LotsResponse).data;
      setItems(data.items ?? []);
      setSummary(data.summary);
      setTotal(data.total);
      setPage(data.page);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [locationId, nearDays, page, pageSize, q, status, tenantId]);

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

  useEffect(() => {
    void loadLots();
  }, [loadLots]);

  function statusLabel(s: LotRow["status"]) {
    return t(`app.pharmacy.inventory.lots.status.${s}`);
  }

  function statusClass(s: LotRow["status"]) {
    if (s === "expired") return "border-red-200 bg-red-50 text-red-700";
    if (s === "near") return "border-amber-200 bg-amber-50 text-amber-800";
    if (s === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-800";
    return "border-gray-200 bg-gray-50 text-gray-700";
  }

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
              <div className="text-2xl font-semibold">{t("app.pharmacy.reports.expiry.title")}</div>
            </div>
            <div className="mt-2 text-gray-700">{t("app.pharmacy.reports.expiry.subtitle")}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                disabled={loadingTenant || exportingXlsx}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                onClick={() => setExportMenuOpen((v) => !v)}
              >
                {exportingXlsx ? t("common.working") : t("app.shop.reports.export.button")}
              </button>
              {exportMenuOpen ? (
                <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                    onClick={() => void exportXlsx()}
                  >
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
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => void loadLots()} disabled={loadingTenant}>
              {t("common.button.refresh")}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.inventory.lots.filter.search")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder={t("app.pharmacy.inventory.lots.filter.search.placeholder")}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.inventory.lots.filter.location")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
              value={locationId}
              onChange={(e) => {
                setPage(1);
                setLocationId(e.target.value);
              }}
            >
              <option value="all">{t("common.all")}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.inventory.lots.filter.status")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as "near" | "expired");
              }}
            >
              <option value="near">{t("app.pharmacy.inventory.lots.status.near")}</option>
              <option value="expired">{t("app.pharmacy.inventory.lots.status.expired")}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.inventory.lots.filter.nearDays")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm tabular" value={nearDays} onChange={(e) => setNearDays(e.target.value)} placeholder="30" />
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card">
          <div className="text-xs font-medium text-gray-600">{t("app.pharmacy.inventory.lots.summary.expired")}</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900 tabular">{summary.expired}</div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card">
          <div className="text-xs font-medium text-gray-600">{t("app.pharmacy.inventory.lots.summary.near")}</div>
          <div className="mt-1 text-2xl font-semibold text-gray-900 tabular">{summary.near}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.inventory.lots.table.product")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.inventory.lots.table.lot")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.inventory.lots.table.expiry")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.inventory.lots.filter.location")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.inventory.lots.table.onHand")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.inventory.lots.table.status")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={6}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={6}>
                    {t("app.pharmacy.inventory.lots.empty")}
                  </td>
                </tr>
              ) : (
                items.map((r) => (
                  <tr key={r.id}>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="font-medium text-gray-900">{r.product.name}</div>
                      <div className="mt-1 text-xs text-gray-500">{r.product.sku ?? "—"}</div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{r.lotNumber}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">
                      {r.expiryDate ? (
                        <div className="flex items-center gap-2">
                          <span className="tabular">{new Date(r.expiryDate).toLocaleDateString()}</span>
                          {r.daysToExpiry !== null ? <span className="text-xs text-gray-500">({r.daysToExpiry}d)</span> : null}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{r.location.name}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-900 tabular">{r.onHandQty}</td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <span className={["inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium", statusClass(r.status)].join(" ")}>{statusLabel(r.status)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 p-4">
          <div className="text-sm text-gray-700">
            {t("common.pagination.page")} {page} / {totalPages} · {t("common.pagination.items")} {total}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t("common.pagination.prev")}
            </button>
            <button type="button" disabled={page >= totalPages} className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              {t("common.pagination.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
