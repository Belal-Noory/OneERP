"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { getApiBaseUrl } from "@/lib/api";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";

type MeResponse = {
  data: {
    memberships: { tenantId: string; tenantSlug: string }[];
  };
};

type Location = { id: string; name: string; isActive: boolean };
type LocationsResponse = { data: Location[] };

type InventoryResponse = {
  data: {
    locations: { id: string; name: string }[];
    locationId: string | null;
    items: {
      product: {
        id: string;
        name: string;
        sku: string | null;
        image: { id: string; url: string } | null;
        unit: { id: string; name: string; symbol: string | null } | null;
      };
      onHandQty: string;
    }[];
  };
};

type MovementsResponse = {
  data: {
    page: number;
    pageSize: number;
    total: number;
    items: {
      id: string;
      type: "receive" | "adjust" | "transfer_out" | "transfer_in";
      deltaQty: string;
      beforeQty: string;
      afterQty: string;
      note: string | null;
      createdAt: string;
      location: { id: string; name: string };
      relatedLocation: { id: string; name: string } | null;
      actor: { id: string; fullName: string | null } | null;
    }[];
  };
};

export function InventoryClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const apiBase = getApiBaseUrl();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [q, setQ] = useState("");
  const [scannerOpen, setScannerOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<InventoryResponse["data"]["items"]>([]);

  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [newLocationName, setNewLocationName] = useState("");
  const [savingLocation, setSavingLocation] = useState(false);

  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [movementProductName, setMovementProductName] = useState<string | null>(null);
  const [movements, setMovements] = useState<MovementsResponse["data"]["items"]>([]);
  const [movementLoading, setMovementLoading] = useState(false);

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [activeProductName, setActiveProductName] = useState<string | null>(null);

  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [adjustMode, setAdjustMode] = useState<"delta" | "set">("delta");
  const [toLocationId, setToLocationId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [blockerOpen, setBlockerOpen] = useState(false);
  const [needSecondLocationOpen, setNeedSecondLocationOpen] = useState(false);

  const filteredLocationOptions = useMemo(() => locations.filter((l) => l.isActive), [locations]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
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
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [props.tenantSlug]);

  useEffect(() => {
    let cancelled = false;
    async function loadLocations() {
      if (!tenantId) return;
      try {
        const res = await apiFetch("/api/shop/locations", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as LocationsResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const list = (json as LocationsResponse).data ?? [];
        if (!cancelled) {
          setLocations(list);
          setLocationId((prev) => prev || list[0]?.id || "");
        }
      } catch {
        setErrorKey("errors.internal");
      }
    }
    void loadLocations();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function loadInventory() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const params = new URLSearchParams();
        if (locationId) params.set("locationId", locationId);
        if (q.trim()) params.set("q", q.trim());

        const res = await apiFetch(`/api/shop/inventory?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as InventoryResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const data = (json as InventoryResponse).data;
        if (!cancelled) {
          setItems(data.items);
          if (!locationId && data.locationId) setLocationId(data.locationId);
        }
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadInventory();
    return () => {
      cancelled = true;
    };
  }, [tenantId, locationId, q]);

  function resetMovementInputs() {
    setQty("");
    setNote("");
    setAdjustMode("delta");
    setToLocationId("");
  }

  async function refreshInventory() {
    if (!tenantId) return;
    const params = new URLSearchParams();
    if (locationId) params.set("locationId", locationId);
    if (q.trim()) params.set("q", q.trim());
    const res = await apiFetch(`/api/shop/inventory?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
    if (!res.ok) return;
    const json = (await res.json()) as InventoryResponse;
    setItems(json.data.items);
  }

  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.shop.inventory.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.shop.inventory.subtitle")}</div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => {
                setNewLocationName("");
                setLocationModalOpen(true);
              }}
            >
              {t("app.shop.inventory.locations.add")}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.inventory.filter.location")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
            >
              {filteredLocationOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.inventory.filter.search")}</label>
            <div className="mt-1 flex gap-2">
              <input
                className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("app.shop.inventory.filter.search.placeholder")}
              />
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
                onClick={() => setScannerOpen(true)}
                aria-label={t("app.shop.products.scan.open")}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M7 7h2M7 17h2M15 7h2M15 17h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M6 10v4M18 10v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M9 6h6M9 18h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="block lg:hidden">
          {loading ? (
            <div className="px-4 py-6 text-sm text-gray-600">Loading…</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-600">{t("app.shop.inventory.empty")}</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {items.map((row) => (
                <div key={row.product.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
                        {row.product.image ? (
                          <Image alt="" src={`${apiBase}${row.product.image.url}`} unoptimized width={48} height={48} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
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
                      onClick={() => {
                        setActiveProductId(row.product.id);
                        setActiveProductName(row.product.name);
                        resetMovementInputs();
                        setToLocationId("");
                        const otherLocations = filteredLocationOptions.filter((l) => l.id !== locationId);
                        if (otherLocations.length === 0) {
                          setNeedSecondLocationOpen(true);
                          return;
                        }
                        setTransferOpen(true);
                      }}
                    >
                      {t("app.shop.inventory.action.transfer")}
                    </button>
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                      onClick={async () => {
                        if (!tenantId) return;
                        setMovementProductName(row.product.name);
                        setMovementModalOpen(true);
                        setMovementLoading(true);
                        try {
                          const params = new URLSearchParams();
                          params.set("productId", row.product.id);
                          if (locationId) params.set("locationId", locationId);
                          const res = await apiFetch(`/api/shop/inventory/movements?${params.toString()}`, {
                            cache: "no-store",
                            headers: { "X-Tenant-Id": tenantId }
                          });
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
                    Loading…
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
                        <div className="h-10 w-10 overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                          {row.product.image ? (
                            <Image alt="" src={`${apiBase}${row.product.image.url}`} unoptimized width={40} height={40} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
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
                          onClick={() => {
                            setActiveProductId(row.product.id);
                            setActiveProductName(row.product.name);
                            resetMovementInputs();
                            setToLocationId("");
                            const otherLocations = filteredLocationOptions.filter((l) => l.id !== locationId);
                            if (otherLocations.length === 0) {
                              setNeedSecondLocationOpen(true);
                              return;
                            }
                            setTransferOpen(true);
                          }}
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
                              const res = await apiFetch(`/api/shop/inventory/movements?${params.toString()}`, {
                                cache: "no-store",
                                headers: { "X-Tenant-Id": tenantId }
                              });
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
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setLocationModalOpen(false)}
            >
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-900">{t("app.shop.inventory.locations.field.name")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
              placeholder={t("app.shop.inventory.locations.field.name.placeholder")}
            />
          </div>

          <div className="mt-8 flex flex-col gap-3 md:flex-row md:justify-end">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => setLocationModalOpen(false)}
            >
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
                  const res = await apiFetch("/api/shop/locations", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                    body: JSON.stringify({ name: newLocationName.trim() })
                  });
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
              {savingLocation ? t("app.shop.products.action.working") : t("common.button.submit")}
            </button>
          </div>
        </div>
      </Modal>

      <MovementModal
        open={movementModalOpen}
        loading={movementLoading}
        title={movementProductName ? `${t("app.shop.inventory.history.title")}: ${movementProductName}` : t("app.shop.inventory.history.title")}
        movements={movements}
        onClose={() => {
          setMovementModalOpen(false);
          setMovements([]);
          setMovementProductName(null);
        }}
      />

      <StockActionModal
        open={receiveOpen}
        title={t("app.shop.inventory.receive.title")}
        subtitle={activeProductName ?? ""}
        mode="receive"
        locations={filteredLocationOptions}
        currentLocationId={locationId}
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
            const res = await apiFetch("/api/shop/inventory/receive", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
              body: JSON.stringify({ productId: activeProductId, locationId, qty, note: note.trim() || undefined })
            });
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
        currentLocationId={locationId}
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
            const res = await apiFetch("/api/shop/inventory/adjust", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
              body: JSON.stringify({ productId: activeProductId, locationId, mode: adjustMode, qty, note: note.trim() || undefined })
            });
            if (!res.ok) {
              const json = (await res.json()) as { error?: { message_key?: string } };
              if (json.error?.message_key) {
                setErrorKey(json.error.message_key);
              } else {
                setBlockerOpen(true);
              }
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
        currentLocationId={locationId}
        toLocationId={toLocationId}
        setToLocationId={setToLocationId}
        qty={qty}
        setQty={setQty}
        note={note}
        setNote={setNote}
        adjustMode={adjustMode}
        setAdjustMode={setAdjustMode}
        submitting={submitting}
        onClose={() => setTransferOpen(false)}
        onSubmit={async () => {
          if (!tenantId || !activeProductId || !locationId || !toLocationId) return;
          setSubmitting(true);
          setErrorKey(null);
          try {
            const res = await apiFetch("/api/shop/inventory/transfer", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
              body: JSON.stringify({ productId: activeProductId, fromLocationId: locationId, toLocationId, qty, note: note.trim() || undefined })
            });
            if (!res.ok) {
              const json = (await res.json()) as { error?: { message_key?: string } };
              if (json.error?.message_key) {
                setErrorKey(json.error.message_key);
              } else {
                setBlockerOpen(true);
              }
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
        onDetected={(code) => {
          const v = code.trim();
          if (!v) return;
          setQ(v);
        }}
      />
    </div>
  );
}

function MovementModal(props: { open: boolean; loading: boolean; title: string; movements: MovementsResponse["data"]["items"]; onClose: () => void }) {
  const { t } = useClientI18n();
  return (
    <Modal open={props.open} onClose={props.onClose}>
      <div className="p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">{props.title}</div>
            <div className="mt-2 text-sm text-gray-700">{t("app.shop.inventory.history.subtitle")}</div>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
            onClick={props.onClose}
          >
            {t("common.button.close")}
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200">
        <div className="block lg:hidden">
          {props.loading ? (
            <div className="px-4 py-6 text-sm text-gray-600">Loading…</div>
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
                      <div className="mt-1 text-sm font-medium text-gray-900">
                        {m.type === "transfer_out" || m.type === "transfer_in" ? `${m.location.name} → ${m.relatedLocation?.name ?? "—"}` : m.location.name}
                      </div>
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
                      Loading…
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
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-700">
                        {m.type === "transfer_out" || m.type === "transfer_in"
                          ? `${m.location.name} → ${m.relatedLocation?.name ?? "—"}`
                          : m.location.name}
                      </td>
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
  submitting: boolean;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const { t } = useClientI18n();
  return (
    <Modal open={props.open} onClose={props.onClose}>
      <div className="p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">{props.title}</div>
            <div className="mt-2 text-sm text-gray-700">{props.subtitle}</div>
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
            onClick={props.onClose}
          >
            {t("common.button.close")}
          </button>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {props.mode === "adjust" ? (
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.inventory.adjust.mode")}</label>
              <select
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={props.adjustMode}
                onChange={(e) => props.setAdjustMode(e.target.value as "delta" | "set")}
              >
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
              <select
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={props.toLocationId}
                onChange={(e) => props.setToLocationId(e.target.value)}
              >
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

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900">
              {props.mode === "adjust" && props.adjustMode === "delta" ? t("app.shop.inventory.field.qtyDelta") : t("app.shop.inventory.field.qty")}
            </label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={props.qty}
              onChange={(e) => props.setQty(e.target.value)}
              placeholder={props.mode === "adjust" && props.adjustMode === "delta" ? t("app.shop.inventory.field.qtyDelta.placeholder") : t("app.shop.inventory.field.qty.placeholder")}
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900">{t("app.shop.inventory.field.note")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={props.note}
              onChange={(e) => props.setNote(e.target.value)}
              placeholder={t("app.shop.inventory.field.note.placeholder")}
            />
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-3 md:flex-row md:justify-end">
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
            onClick={props.onClose}
          >
            {t("common.button.cancel")}
          </button>
          <button
            type="button"
            disabled={props.submitting || !props.qty.trim() || (props.mode === "transfer" && !props.toLocationId)}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
            onClick={props.onSubmit}
          >
            {props.submitting ? t("app.shop.products.action.working") : t("common.button.submit")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
