"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { apiFetch } from "@/lib/auth-fetch";
import { getApiBaseUrl } from "@/lib/api";
import { useClientI18n } from "@/lib/client-i18n";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type Location = { id: string; name: string };

type InventoryItem = {
  product: { id: string; name: string; sku: string | null; unit: { id: string; name: string; symbol: string | null } | null; image: { id: string; url: string } | null };
  onHandQty: string;
};

type InventoryResponse = { data: { locations: Location[]; locationId: string | null; items: InventoryItem[] } };

type LotPickRow = {
  id: string;
  lotNumber: string;
  expiryDate: string | null;
  onHandQty: string;
  status: "expired" | "near" | "ok" | "no_expiry";
  daysToExpiry: number | null;
};
type LotsResponse = {
  data: { items: LotPickRow[] };
};

type Movement = {
  id: string;
  type: "receive" | "adjust" | "transfer_in" | "transfer_out" | "sale" | "sale_refund" | "supplier_return";
  deltaQty: string;
  note: string | null;
  createdAt: string;
  location: { id: string; name: string };
  relatedLocation: { id: string; name: string } | null;
};
type MovementsResponse = { data: { items: Movement[] } };

export function PharmacyInventoryClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(true);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);

  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [needSecondLocationOpen, setNeedSecondLocationOpen] = useState(false);
  const [blockerOpen, setBlockerOpen] = useState(false);

  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [activeProductName, setActiveProductName] = useState<string | null>(null);
  const [toLocationId, setToLocationId] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [adjustMode, setAdjustMode] = useState<"delta" | "set">("delta");
  const [submitting, setSubmitting] = useState(false);

  const [transferTrackLots, setTransferTrackLots] = useState(false);
  const [transferLotsLoading, setTransferLotsLoading] = useState(false);
  const [transferLots, setTransferLots] = useState<LotPickRow[]>([]);
  const [transferLotQtys, setTransferLotQtys] = useState<Record<string, string>>({});

  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [movementLoading, setMovementLoading] = useState(false);
  const [movementProductId, setMovementProductId] = useState<string | null>(null);
  const [movementProductName, setMovementProductName] = useState<string | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const apiBase = getApiBaseUrl();

  const filteredLocationOptions = useMemo(() => locations.filter((l) => l.id !== ""), [locations]);

  const refreshInventory = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (locationId) params.set("locationId", locationId);
      const res = await apiFetch(`/api/pharmacy/inventory?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      if (!res.ok) return;
      const json = (await res.json()) as InventoryResponse;
      setLocations(json.data.locations ?? []);
      setLocationId(json.data.locationId);
      setItems(json.data.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [locationId, q, tenantId]);

  const resetMovementInputs = useCallback(() => {
    setQty("");
    setNote("");
    setAdjustMode("delta");
    setTransferLotQtys({});
  }, []);

  const transferSelectedTotal = useMemo(() => {
    let sum = 0;
    for (const raw of Object.values(transferLotQtys)) {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) sum += n;
    }
    return sum;
  }, [transferLotQtys]);

  const openTransfer = useCallback(
    async (productId: string, productName: string) => {
      if (!tenantId) return;
      if (!locationId) return;
      setActiveProductId(productId);
      setActiveProductName(productName);
      resetMovementInputs();
      setToLocationId("");
      setTransferTrackLots(false);
      setTransferLots([]);
      setTransferLotsLoading(true);
      setErrorKey(null);
      try {
        const profileRes = await apiFetch(`/api/pharmacy/products/${productId}/pharmacy-profile`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (profileRes.ok) {
          const json = (await profileRes.json()) as { data: { trackLots: boolean } };
          const track = Boolean(json.data.trackLots);
          setTransferTrackLots(track);
          if (track) {
            const params = new URLSearchParams();
            params.set("locationId", locationId);
            params.set("productId", productId);
            params.set("status", "all");
            params.set("page", "1");
            params.set("pageSize", "50");
            const lotsRes = await apiFetch(`/api/pharmacy/inventory/lots?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
            if (lotsRes.ok) {
              const lotsJson = (await lotsRes.json()) as LotsResponse;
              setTransferLots(lotsJson.data.items ?? []);
            }
          }
        }
      } catch {
        setErrorKey("errors.internal");
      } finally {
        setTransferLotsLoading(false);
      }

      const otherLocations = filteredLocationOptions.filter((l) => l.id !== locationId);
      if (otherLocations.length === 0) {
        setNeedSecondLocationOpen(true);
        return;
      }
      setTransferOpen(true);
    },
    [filteredLocationOptions, locationId, resetMovementInputs, tenantId]
  );

  useEffect(() => {
    let cancelled = false;
    async function loadTenantId() {
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
    void loadTenantId();
    return () => {
      cancelled = true;
    };
  }, [props.tenantSlug]);

  useEffect(() => {
    void refreshInventory();
  }, [refreshInventory]);

  const exportXlsx = useCallback(async () => {
    if (!tenantId) return;
    setExportingXlsx(true);
    setErrorKey(null);
    try {
      try {
        const threshold = `q=${q.trim() || ""};locationId=${locationId ?? ""}`;
        await apiFetch("/api/pharmacy/reports/export-log", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
          body: JSON.stringify({ reportId: "pharmacy.inventory.list.v1", format: "xlsx", locationId: locationId ?? undefined, threshold })
        });
      } catch {}
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const locName = locationId ? locations.find((l) => l.id === locationId)?.name ?? locationId : t("common.all");
      const metaAoA = [
        ["Pharmacy inventory"],
        ["Exported at", new Date().toISOString()],
        ["Location", locName],
        ["Query", q.trim() || ""],
        ["Rows", String(items.length)]
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(metaAoA), "Summary");
      const header = ["Product", "SKU", "Unit", "On hand"];
      const rows = items.map((row) => [row.product.name, row.product.sku ?? "", row.product.unit ? `${row.product.unit.name}${row.product.unit.symbol ? ` (${row.product.unit.symbol})` : ""}` : "", row.onHandQty]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Inventory");
      const safeDate = new Date().toISOString().slice(0, 10);
      const filename = `pharmacy_inventory_${safeDate}.xlsx`;
      XLSX.writeFile(wb, filename);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setExportingXlsx(false);
      setExportMenuOpen(false);
    }
  }, [items, locationId, locations, q, t, tenantId]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.shop.inventory.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.shop.inventory.subtitle")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setLocationModalOpen(true)} disabled={loadingTenant}>
              {t("app.shop.inventory.locations.add")}
            </button>
            <Link className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/inventory/lots`}>
              {t("app.pharmacy.inventory.lots.action.open")}
            </Link>
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setScannerOpen(true)}>
              {t("app.pharmacy.inventory.action.scan")}
            </button>
          <div className="relative">
            <button
              type="button"
              disabled={loadingTenant || exportingXlsx || items.length === 0}
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
                <a
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/pharmacy/inventory/print?paper=a4&q=${encodeURIComponent(q.trim())}&locationId=${encodeURIComponent(locationId ?? "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.reports.export.printView")}
                </a>
                <a
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/pharmacy/inventory/print?paper=a4&download=pdf&q=${encodeURIComponent(q.trim())}&locationId=${encodeURIComponent(locationId ?? "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.reports.export.pdfA4")}
                </a>
                <a
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/pharmacy/inventory/print?paper=thermal80&download=pdf&q=${encodeURIComponent(q.trim())}&locationId=${encodeURIComponent(locationId ?? "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.reports.export.pdf80")}
                </a>
                <a
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/pharmacy/inventory/print?paper=thermal58&download=pdf&q=${encodeURIComponent(q.trim())}&locationId=${encodeURIComponent(locationId ?? "")}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.reports.export.pdf58")}
                </a>
              </div>
            ) : null}
          </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.inventory.filter.search")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("app.shop.inventory.filter.search.placeholder")} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.inventory.filter.location")}</label>
            <div className="mt-1 flex items-center gap-2">
              <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={locationId ?? ""} onChange={(e) => setLocationId(e.target.value ? e.target.value : null)}>
                <option value="">{t("common.all")}</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50" onClick={() => void refreshInventory()}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M20 4v6h-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="block lg:hidden">
          {loading ? (
            <div className="px-4 py-6 text-sm text-gray-600">{t("common.loading")}</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-600">{t("app.shop.inventory.empty")}</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {items.map((row) => (
                <div key={row.product.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">{row.product.image ? <Image alt="" src={`${apiBase}${row.product.image.url}`} unoptimized width={48} height={48} className="h-full w-full object-cover" /> : null}</div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-900">{row.product.name}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
                          <span>{row.product.sku ?? "—"}</span>
                          {row.product.unit ? (
                            <>
                              <span className="text-gray-300">•</span>
                              <span>
                                {row.product.unit.name}
                                {row.product.unit.symbol ? ` (${row.product.unit.symbol})` : ""}
                              </span>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[11px] font-medium text-gray-600">{t("app.shop.inventory.table.onHand")}</div>
                      <div className="mt-1 text-lg font-semibold text-gray-900">{row.onHandQty}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700"
                      onClick={() => {
                        setActiveProductId(row.product.id);
                        setActiveProductName(row.product.name);
                        resetMovementInputs();
                        setReceiveOpen(true);
                      }}
                    >
                      {t("app.shop.inventory.action.receive")}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                      onClick={() => {
                        setActiveProductId(row.product.id);
                        setActiveProductName(row.product.name);
                        resetMovementInputs();
                        setAdjustOpen(true);
                      }}
                    >
                      {t("app.shop.inventory.action.adjust")}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                      onClick={() => void openTransfer(row.product.id, row.product.name)}
                    >
                      {t("app.shop.inventory.action.transfer")}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                      onClick={async () => {
                        if (!tenantId) return;
                        setMovementProductId(row.product.id);
                        setMovementProductName(row.product.name);
                        setMovementModalOpen(true);
                        setMovementLoading(true);
                        try {
                          const params = new URLSearchParams();
                          params.set("productId", row.product.id);
                          params.set("productId", row.product.id);
                          if (locationId) params.set("locationId", locationId);
                          const res = await apiFetch(`/api/pharmacy/inventory/movements?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
                          if (!res.ok) return;
                          const json = (await res.json()) as MovementsResponse;
                          setMovements(json.data.items ?? []);
                        } finally {
                          setMovementLoading(false);
                        }
                      }}
                    >
                      {t("app.shop.inventory.action.history")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.inventory.table.product")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.inventory.table.onHand")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.inventory.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={3}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={3}>
                    {t("app.shop.inventory.empty")}
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.product.id}>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">{row.product.image ? <Image alt="" src={`${apiBase}${row.product.image.url}`} unoptimized width={40} height={40} className="h-full w-full object-cover" /> : null}</div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-gray-900">{row.product.name}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            {row.product.sku ? `${t("app.shop.inventory.table.sku")}: ${row.product.sku}` : "—"}
                            {row.product.unit ? ` · ${t("app.shop.inventory.table.unit")}: ${row.product.unit.name}${row.product.unit.symbol ? ` (${row.product.unit.symbol})` : ""}` : ""}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-900">
                      <div className="text-lg font-semibold">{row.onHandQty}</div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-xl bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700"
                          onClick={() => {
                            setActiveProductId(row.product.id);
                            setActiveProductName(row.product.name);
                            resetMovementInputs();
                            setReceiveOpen(true);
                          }}
                        >
                          {t("app.shop.inventory.action.receive")}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                          onClick={() => {
                            setActiveProductId(row.product.id);
                            setActiveProductName(row.product.name);
                            resetMovementInputs();
                            setAdjustOpen(true);
                          }}
                        >
                          {t("app.shop.inventory.action.adjust")}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                          onClick={() => void openTransfer(row.product.id, row.product.name)}
                        >
                          {t("app.shop.inventory.action.transfer")}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                          onClick={async () => {
                            if (!tenantId) return;
                            setMovementProductName(row.product.name);
                            setMovementModalOpen(true);
                            setMovementLoading(true);
                            try {
                              const params = new URLSearchParams();
                              params.set("productId", row.product.id);
                              if (locationId) params.set("locationId", locationId);
                              const res = await apiFetch(`/api/pharmacy/inventory/movements?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
                              if (!res.ok) return;
                              const json = (await res.json()) as MovementsResponse;
                              setMovements(json.data.items ?? []);
                            } finally {
                              setMovementLoading(false);
                            }
                          }}
                        >
                          {t("app.shop.inventory.action.history")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={locationModalOpen} onClose={() => setLocationModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">{t("app.shop.inventory.locations.modal.title")}</div>
              <div className="mt-2 text-sm text-gray-700">{t("app.shop.inventory.locations.modal.subtitle")}</div>
            </div>
            <button type="button" className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setLocationModalOpen(false)}>
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-900">{t("app.shop.inventory.locations.field.name")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={newLocationName} onChange={(e) => setNewLocationName(e.target.value)} placeholder={t("app.shop.inventory.locations.field.name.placeholder")} />
          </div>

          <div className="mt-8 flex flex-col gap-3 md:flex-row md:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setLocationModalOpen(false)}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              disabled={!tenantId || savingLocation || newLocationName.trim().length < 2}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              onClick={async () => {
                if (!tenantId) return;
                setSavingLocation(true);
                setErrorKey(null);
                try {
                  const res = await apiFetch("/api/pharmacy/locations", { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify({ name: newLocationName.trim() }) });
                  const json = (await res.json()) as { data?: Location; error?: { message_key?: string } };
                  if (!res.ok || !json.data) {
                    setErrorKey(json.error?.message_key ?? "errors.internal");
                    return;
                  }
                  setLocations((prev) => [...prev, json.data!].sort((a, b) => a.name.localeCompare(b.name)));
                  setLocationId(json.data!.id);
                  setLocationModalOpen(false);
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setSavingLocation(false);
                }
              }}
            >
              {savingLocation ? t("common.working") : t("common.button.submit")}
            </button>
          </div>
        </div>
      </Modal>

      <MovementModal
        open={movementModalOpen}
        loading={movementLoading}
        title={movementProductName ? `${t("app.shop.inventory.history.title")}: ${movementProductName}` : t("app.shop.inventory.history.title")}
        movements={movements}
        tenantSlug={props.tenantSlug}
        tenantId={tenantId}
        productId={movementProductId}
        locationId={locationId}
        onClose={() => {
          setMovementModalOpen(false);
          setMovements([]);
          setMovementProductId(null);
          setMovementProductName(null);
        }}
      />

      <StockActionModal
        open={receiveOpen}
        title={t("app.shop.inventory.receive.title")}
        subtitle={activeProductName ?? ""}
        mode="receive"
        locations={filteredLocationOptions}
        currentLocationId={locationId ?? ""}
        toLocationId={toLocationId}
        setToLocationId={setToLocationId}
        qty={qty}
        setQty={setQty}
        note={note}
        setNote={setNote}
        adjustMode={adjustMode}
        setAdjustMode={setAdjustMode}
        submitting={submitting}
        onClose={() => setReceiveOpen(false)}
        onSubmit={async () => {
          if (!tenantId || !activeProductId || !locationId) return;
          setSubmitting(true);
          setErrorKey(null);
          try {
            const res = await apiFetch("/api/pharmacy/inventory/receive", { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify({ productId: activeProductId, locationId, qty, note: note.trim() || undefined }) });
            if (!res.ok) {
              const json = (await res.json()) as { error?: { message_key?: string } };
              setErrorKey(json.error?.message_key ?? "errors.internal");
              return;
            }
            setReceiveOpen(false);
            resetMovementInputs();
            await refreshInventory();
          } finally {
            setSubmitting(false);
          }
        }}
      />

      <StockActionModal
        open={adjustOpen}
        title={t("app.shop.inventory.adjust.title")}
        subtitle={activeProductName ?? ""}
        mode="adjust"
        locations={filteredLocationOptions}
        currentLocationId={locationId ?? ""}
        toLocationId={toLocationId}
        setToLocationId={setToLocationId}
        qty={qty}
        setQty={setQty}
        note={note}
        setNote={setNote}
        adjustMode={adjustMode}
        setAdjustMode={setAdjustMode}
        submitting={submitting}
        onClose={() => setAdjustOpen(false)}
        onSubmit={async () => {
          if (!tenantId || !activeProductId || !locationId) return;
          setSubmitting(true);
          setErrorKey(null);
          try {
            const res = await apiFetch("/api/pharmacy/inventory/adjust", { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify({ productId: activeProductId, locationId, mode: adjustMode, qty, note: note.trim() || undefined }) });
            if (!res.ok) {
              const json = (await res.json()) as { error?: { message_key?: string } };
              if (json.error?.message_key) setErrorKey(json.error.message_key);
              else setBlockerOpen(true);
              return;
            }
            setAdjustOpen(false);
            resetMovementInputs();
            await refreshInventory();
          } finally {
            setSubmitting(false);
          }
        }}
      />

      <StockActionModal
        open={transferOpen}
        title={t("app.shop.inventory.transfer.title")}
        subtitle={activeProductName ?? ""}
        mode="transfer"
        locations={filteredLocationOptions}
        currentLocationId={locationId ?? ""}
        toLocationId={toLocationId}
        setToLocationId={setToLocationId}
        qty={qty}
        setQty={setQty}
        note={note}
        setNote={setNote}
        adjustMode={adjustMode}
        setAdjustMode={setAdjustMode}
        transferTrackLots={transferTrackLots}
        transferLotsLoading={transferLotsLoading}
        transferLots={transferLots}
        transferLotQtys={transferLotQtys}
        setTransferLotQtys={setTransferLotQtys}
        transferSelectedTotal={transferSelectedTotal}
        submitting={submitting}
        onClose={() => setTransferOpen(false)}
        onSubmit={async () => {
          if (!tenantId || !activeProductId || !locationId || !toLocationId) return;
          setSubmitting(true);
          setErrorKey(null);
          try {
            const lots =
              transferTrackLots
                ? Object.entries(transferLotQtys)
                    .map(([lotId, rawQty]) => ({ lotId, qty: rawQty.trim() }))
                    .filter((x) => Number(x.qty) > 0)
                : [];
            const qtyTotal = transferTrackLots ? transferSelectedTotal.toFixed(3) : qty;
            const res = await apiFetch("/api/pharmacy/inventory/transfer", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
              body: JSON.stringify({
                productId: activeProductId,
                fromLocationId: locationId,
                toLocationId,
                qty: qtyTotal,
                lots: lots.length ? lots : undefined,
                note: note.trim() || undefined
              })
            });
            if (!res.ok) {
              const json = (await res.json()) as { error?: { message_key?: string } };
              if (json.error?.message_key) setErrorKey(json.error.message_key);
              else setBlockerOpen(true);
              return;
            }
            setTransferOpen(false);
            resetMovementInputs();
            await refreshInventory();
          } finally {
            setSubmitting(false);
          }
        }}
      />

      <ConfirmDialog
        open={blockerOpen}
        title={t("app.shop.inventory.blocked.title")}
        description={t("app.shop.inventory.blocked.desc")}
        confirmLabel={t("common.button.close")}
        cancelLabel={t("common.button.close")}
        confirmTone="primary"
        onConfirm={() => setBlockerOpen(false)}
        onCancel={() => setBlockerOpen(false)}
      />

      <ConfirmDialog
        open={needSecondLocationOpen}
        title={t("app.shop.inventory.transfer.needLocation.title")}
        description={t("app.shop.inventory.transfer.needLocation.desc")}
        confirmLabel={t("app.shop.inventory.locations.add")}
        cancelLabel={t("common.button.cancel")}
        confirmTone="primary"
        onConfirm={() => {
          setNeedSecondLocationOpen(false);
          setNewLocationName("");
          setLocationModalOpen(true);
        }}
        onCancel={() => setNeedSecondLocationOpen(false)}
      />

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={(code: string) => {
          const v = code.trim();
          if (!v) return;
          setQ(v);
        }}
      />
    </div>
  );
}

function MovementModal(props: {
  open: boolean;
  loading: boolean;
  title: string;
  movements: Movement[];
  tenantSlug: string;
  tenantId: string | null;
  productId: string | null;
  locationId: string | null;
  onClose: () => void;
}) {
  const { t } = useClientI18n();
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  return (
    <Modal open={props.open} onClose={props.onClose}>
      <div className="p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">{props.title}</div>
            <div className="mt-2 text-sm text-gray-700">{t("app.shop.inventory.history.subtitle")}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                disabled={!props.tenantId || !props.productId || exportingXlsx || props.movements.length === 0}
                className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                onClick={() => setExportMenuOpen((v) => !v)}
              >
                {exportingXlsx ? t("common.working") : t("app.shop.reports.export.button")}
              </button>
              {exportMenuOpen ? (
                <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                    onClick={async () => {
                      if (!props.tenantId) return;
                      if (!props.productId) return;
                      setExportingXlsx(true);
                      try {
                        try {
                          const threshold = `productId=${props.productId};locationId=${props.locationId ?? ""}`;
                          await apiFetch("/api/pharmacy/reports/export-log", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "X-Tenant-Id": props.tenantId },
                            body: JSON.stringify({ reportId: "pharmacy.inventory.movements.v1", format: "xlsx", locationId: props.locationId ?? undefined, threshold })
                          });
                        } catch {}
                        const XLSX = await import("xlsx");
                        const wb = XLSX.utils.book_new();
                        const summaryAoA = [["Pharmacy movements"], ["Exported at", new Date().toISOString()], ["Product", props.title], ["Rows", String(props.movements.length)]];
                        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");
                        const header = ["Time", "Type", "Qty", "Location", "Note"];
                        const rows = props.movements.map((m) => [
                          new Date(m.createdAt).toISOString(),
                          m.type,
                          m.deltaQty,
                          m.type === "transfer_out" || m.type === "transfer_in" ? `${m.location.name} -> ${m.relatedLocation?.name ?? ""}` : m.location.name,
                          m.note ?? ""
                        ]);
                        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Movements");
                        const safeDate = new Date().toISOString().slice(0, 10);
                        XLSX.writeFile(wb, `pharmacy_movements_${safeDate}.xlsx`);
                      } finally {
                        setExportingXlsx(false);
                        setExportMenuOpen(false);
                      }
                    }}
                  >
                    <span className="inline-block h-4 w-4 text-gray-600">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M7 3h10v18H7V3Zm2 4h6M9 11h6M9 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    {t("app.shop.reports.export.excel")}
                  </button>
                  <a
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                    href={`/t/${props.tenantSlug}/pharmacy/inventory/movements/print?paper=a4&productId=${encodeURIComponent(props.productId ?? "")}&locationId=${encodeURIComponent(props.locationId ?? "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("app.shop.reports.export.printView")}
                  </a>
                  <a
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                    href={`/t/${props.tenantSlug}/pharmacy/inventory/movements/print?paper=a4&download=pdf&productId=${encodeURIComponent(props.productId ?? "")}&locationId=${encodeURIComponent(props.locationId ?? "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("app.shop.reports.export.pdfA4")}
                  </a>
                  <a
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                    href={`/t/${props.tenantSlug}/pharmacy/inventory/movements/print?paper=thermal80&download=pdf&productId=${encodeURIComponent(props.productId ?? "")}&locationId=${encodeURIComponent(props.locationId ?? "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("app.shop.reports.export.pdf80")}
                  </a>
                  <a
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                    href={`/t/${props.tenantSlug}/pharmacy/inventory/movements/print?paper=thermal58&download=pdf&productId=${encodeURIComponent(props.productId ?? "")}&locationId=${encodeURIComponent(props.locationId ?? "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("app.shop.reports.export.pdf58")}
                  </a>
                </div>
              ) : null}
            </div>
            <button type="button" className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50" onClick={props.onClose}>
              {t("common.button.close")}
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200">
          <div className="block lg:hidden">
            {props.loading ? (
              <div className="px-4 py-6 text-sm text-gray-600">{t("common.loading")}</div>
            ) : props.movements.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-600">{t("app.shop.inventory.history.empty")}</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {props.movements.map((m) => (
                  <div key={m.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-900">{t(`app.shop.inventory.movement.${m.type}`)}</div>
                        <div className="mt-1 text-xs text-gray-600">{new Date(m.createdAt).toLocaleString()}</div>
                      </div>
                      <div className="shrink-0 text-right text-sm font-semibold text-gray-900">{m.deltaQty}</div>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                        <div className="text-[11px] font-medium text-gray-600">{t("app.shop.inventory.history.col.location")}</div>
                        <div className="mt-1 text-sm font-medium text-gray-900">{m.type === "transfer_out" || m.type === "transfer_in" ? `${m.location.name} → ${m.relatedLocation?.name ?? "—"}` : m.location.name}</div>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                        <div className="text-[11px] font-medium text-gray-600">{t("app.shop.inventory.history.col.note")}</div>
                        <div className="mt-1 text-sm font-medium text-gray-900">{m.note ?? "—"}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="min-w-[760px] w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.inventory.history.col.time")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.inventory.history.col.type")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.inventory.history.col.qty")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.inventory.history.col.location")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.inventory.history.col.note")}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {props.loading ? (
                  <tr>
                    <td className="px-4 py-6 text-gray-600" colSpan={5}>
                      {t("common.loading")}
                    </td>
                  </tr>
                ) : props.movements.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-gray-600" colSpan={5}>
                      {t("app.shop.inventory.history.empty")}
                    </td>
                  </tr>
                ) : (
                  props.movements.map((m) => (
                    <tr key={m.id}>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{new Date(m.createdAt).toLocaleString()}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{t(`app.shop.inventory.movement.${m.type}`)}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{m.deltaQty}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{m.type === "transfer_out" || m.type === "transfer_in" ? `${m.location.name} → ${m.relatedLocation?.name ?? "—"}` : m.location.name}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{m.note ?? "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function StockActionModal(props: {
  open: boolean;
  title: string;
  subtitle: string;
  mode: "receive" | "adjust" | "transfer";
  locations: Location[];
  currentLocationId: string;
  toLocationId: string;
  setToLocationId: (v: string) => void;
  qty: string;
  setQty: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  adjustMode: "delta" | "set";
  setAdjustMode: (v: "delta" | "set") => void;
  transferTrackLots?: boolean;
  transferLotsLoading?: boolean;
  transferLots?: LotPickRow[];
  transferLotQtys?: Record<string, string>;
  setTransferLotQtys?: (next: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  transferSelectedTotal?: number;
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { t } = useClientI18n();
  const transferLotsEnabled = props.mode === "transfer" && props.transferTrackLots;
  const transferLots = props.transferLots ?? [];
  const transferTotal = props.transferSelectedTotal ?? 0;
  return (
    <Modal open={props.open} onClose={props.onClose}>
      <div className="p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">{props.title}</div>
            <div className="mt-2 text-sm text-gray-700">{props.subtitle}</div>
          </div>
          <button type="button" className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50" onClick={props.onClose}>
            {t("common.button.close")}
          </button>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {props.mode === "adjust" ? (
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.inventory.adjust.mode")}</label>
              <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={props.adjustMode} onChange={(e) => props.setAdjustMode(e.target.value as "delta" | "set")}>
                <option value="delta">{t("app.shop.inventory.adjust.mode.delta")}</option>
                <option value="set">{t("app.shop.inventory.adjust.mode.set")}</option>
              </select>
            </div>
          ) : (
            <div />
          )}

          {props.mode === "transfer" ? (
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.inventory.transfer.to")}</label>
              <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={props.toLocationId} onChange={(e) => props.setToLocationId(e.target.value)}>
                <option value="">{t("app.shop.inventory.transfer.to.placeholder")}</option>
                {props.locations
                  .filter((l) => l.id !== props.currentLocationId)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </div>
          ) : (
            <div />
          )}

          {transferLotsEnabled ? (
            <div className="md:col-span-2">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-gray-900">{t("app.pharmacy.inventory.transfer.lots.title")}</div>
                  <div className="mt-1 text-xs text-gray-600">{t("app.pharmacy.inventory.transfer.lots.subtitle")}</div>
                </div>
                <div className="text-sm text-gray-700">
                  {t("app.pharmacy.inventory.transfer.lots.total")}: <span className="font-semibold text-gray-900 tabular">{transferTotal.toFixed(3)}</span>
                </div>
              </div>

              <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200">
                {props.transferLotsLoading ? (
                  <div className="px-4 py-4 text-sm text-gray-700">{t("common.loading")}</div>
                ) : transferLots.length === 0 ? (
                  <div className="px-4 py-4 text-sm text-gray-700">{t("app.pharmacy.inventory.transfer.lots.empty")}</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {transferLots.map((l) => {
                      const v = props.transferLotQtys?.[l.id] ?? "";
                      return (
                        <div key={l.id} className="grid grid-cols-12 items-center gap-2 px-4 py-3">
                          <div className="col-span-5 min-w-0">
                            <div className="truncate text-sm font-medium text-gray-900">{l.lotNumber}</div>
                            <div className="mt-1 text-xs text-gray-500">
                              {l.expiryDate ? new Date(l.expiryDate).toLocaleDateString() : "—"} · {t("app.pharmacy.inventory.transfer.lots.onHand")}: {l.onHandQty}
                            </div>
                          </div>
                          <div className="col-span-4 text-xs text-gray-600">
                            {l.status === "expired" ? t("app.pharmacy.inventory.lots.status.expired") : null}
                            {l.status === "near" ? t("app.pharmacy.inventory.lots.status.near") : null}
                            {l.status === "ok" ? t("app.pharmacy.inventory.lots.status.ok") : null}
                            {l.status === "no_expiry" ? t("app.pharmacy.inventory.lots.status.no_expiry") : null}
                            {l.daysToExpiry !== null ? <span className="ml-2 tabular">({l.daysToExpiry}d)</span> : null}
                          </div>
                          <div className="col-span-3">
                            <input
                              className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm tabular"
                              value={v}
                              onChange={(e) => {
                                const next = e.target.value;
                                props.setTransferLotQtys?.((prev) => ({ ...prev, [l.id]: next }));
                              }}
                              placeholder="0.000"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900">{props.mode === "adjust" && props.adjustMode === "delta" ? t("app.shop.inventory.field.qtyDelta") : t("app.shop.inventory.field.qty")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={props.qty} onChange={(e) => props.setQty(e.target.value)} placeholder={props.mode === "adjust" && props.adjustMode === "delta" ? t("app.shop.inventory.field.qtyDelta.placeholder") : t("app.shop.inventory.field.qty.placeholder")} />
            </div>
          )}

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900">{t("app.shop.inventory.field.note")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={props.note} onChange={(e) => props.setNote(e.target.value)} placeholder={t("app.shop.inventory.field.note.placeholder")} />
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 md:flex-row md:justify-end">
          <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={props.onClose}>
            {t("common.button.cancel")}
          </button>
          <button
            type="button"
            disabled={props.submitting || (transferLotsEnabled ? transferTotal <= 0 : !props.qty.trim()) || (props.mode === "transfer" && !props.toLocationId)}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
            onClick={props.onSubmit}
          >
            {props.submitting ? t("common.working") : t("common.button.submit")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
