"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { formatMoney } from "@/lib/currency-catalog";
import { Modal } from "@/components/Modal";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };
type LocationsResponse = { data: { id: string; name: string }[] };

type ProductMatch = { id: string; name: string; sku: string | null; sellPrice: string; costPrice: string | null; barcodes: string[] };
type ProductsResponse = { data: { items: ProductMatch[] } };

type PurchaseOrderResponse = {
  data: {
    id: string;
    status: "draft" | "approved" | "closed" | "void";
    orderNumber: string | null;
    currencyCode: string;
    notes: string | null;
    subtotal: string;
    createdAt: string;
    approvedAt: string | null;
    closedAt: string | null;
    supplier: { id: string; name: string } | null;
    location: { id: string; name: string };
    lines: { id: string; product: { id: string; name: string }; quantity: string; unitCost: string; lineTotal: string }[];
  };
};

type SuppliersResponse = { data: { items: { id: string; name: string }[] } };

function toMoneyString(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

function toQtyString(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(3).replace(/\.?0+$/, "");
}

export function PurchaseOrderClient(props: { tenantSlug: string; orderId: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [order, setOrder] = useState<PurchaseOrderResponse["data"] | null>(null);

  const isDraft = order?.status === "draft";

  const [locationId, setLocationId] = useState("");
  const [supplier, setSupplier] = useState<{ id: string; name: string } | null>(null);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierMatches, setSupplierMatches] = useState<{ id: string; name: string }[]>([]);
  const [notes, setNotes] = useState("");

  const [lines, setLines] = useState<{ tempId: string; productId: string; name: string; quantity: string; unitCost: string }[]>([]);

  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productMatches, setProductMatches] = useState<ProductMatch[]>([]);

  const subtotal = useMemo(() => {
    let s = 0;
    for (const l of lines) {
      const q = Number(l.quantity);
      const c = Number(l.unitCost);
      if (!Number.isFinite(q) || !Number.isFinite(c)) continue;
      s += q * c;
    }
    return toMoneyString(Math.max(0, s));
  }, [lines]);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    const [locRes, orderRes] = await Promise.all([
      apiFetch("/api/shop/locations", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
      apiFetch(`/api/shop/purchase-orders/${props.orderId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
    ]);
    const locJson = (await locRes.json()) as LocationsResponse;
    const orderJson = (await orderRes.json()) as PurchaseOrderResponse | { error?: { message_key?: string } };
    if (!orderRes.ok) {
      setErrorKey((orderJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
      return;
    }
    setLocations(locJson.data ?? []);
    const o = (orderJson as PurchaseOrderResponse).data;
    setOrder(o);
    setLocationId(o.location.id);
    setSupplier(o.supplier);
    setSupplierQuery("");
    setNotes(o.notes ?? "");
    setLines(
      o.lines.map((l) => ({
        tempId: l.id,
        productId: l.product.id,
        name: l.product.name,
        quantity: l.quantity,
        unitCost: l.unitCost
      }))
    );
  }, [props.orderId, tenantId]);

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

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    refresh()
      .catch(() => setErrorKey("errors.internal"))
      .finally(() => setLoading(false));
  }, [refresh, tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function searchSuppliers() {
      if (!tenantId) return;
      const q = supplierQuery.trim();
      if (!q || !isDraft) {
        setSupplierMatches([]);
        return;
      }
      try {
        const params = new URLSearchParams();
        params.set("q", q);
        params.set("status", "active");
        params.set("page", "1");
        params.set("pageSize", "8");
        const res = await apiFetch(`/api/shop/suppliers?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as SuppliersResponse;
        if (!cancelled) setSupplierMatches(json.data.items ?? []);
      } catch {}
    }
    const h = setTimeout(searchSuppliers, 250);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [isDraft, supplierQuery, tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function searchProducts() {
      if (!tenantId) return;
      const q = productQuery.trim();
      if (!q || !productModalOpen) {
        setProductMatches([]);
        return;
      }
      try {
        const params = new URLSearchParams();
        params.set("q", q);
        params.set("status", "active");
        params.set("page", "1");
        params.set("pageSize", "10");
        const res = await apiFetch(`/api/shop/products?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as ProductsResponse;
        if (!cancelled) setProductMatches(json.data.items ?? []);
      } catch {}
    }
    const h = setTimeout(searchProducts, 250);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [productModalOpen, productQuery, tenantId]);

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700">{t("common.loading")}</div>;
  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  if (!order) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700">{t("errors.notFound")}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link className="text-sm font-medium text-gray-600 hover:text-gray-900" href={`/t/${props.tenantSlug}/shop/purchase-orders`}>
                {t("app.shop.purchaseOrders.back")}
              </Link>
              <div className="text-sm text-gray-500">/</div>
              <div className="truncate text-2xl font-semibold text-gray-900">{order.orderNumber ?? t("app.shop.purchaseOrders.titleDraft")}</div>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">{t(`app.shop.purchaseOrders.status.${order.status}`)}</span>
            </div>
            <div className="mt-2 text-sm text-gray-700">
              {t("app.shop.purchaseOrders.meta.created")}: {new Date(order.createdAt).toLocaleString()}
              {order.approvedAt ? ` · ${t("app.shop.purchaseOrders.meta.approved")}: ${new Date(order.approvedAt).toLocaleString()}` : ""}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {order.status === "approved" ? (
              <button
                type="button"
                disabled={converting}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                onClick={async () => {
                  if (!tenantId) return;
                  setConverting(true);
                  setErrorKey(null);
                  try {
                    const res = await apiFetch(`/api/shop/purchase-orders/${order.id}/convert-to-purchase`, { method: "POST", headers: { "X-Tenant-Id": tenantId } });
                    const json = (await res.json()) as { data?: { purchaseInvoiceId: string }; error?: { message_key?: string } };
                    if (!res.ok || !json.data?.purchaseInvoiceId) {
                      setErrorKey(json.error?.message_key ?? "errors.internal");
                      return;
                    }
                    window.location.href = `/t/${props.tenantSlug}/shop/purchases/${json.data.purchaseInvoiceId}`;
                  } catch {
                    setErrorKey("errors.internal");
                  } finally {
                    setConverting(false);
                  }
                }}
              >
                {converting ? t("app.shop.purchaseOrders.action.working") : t("app.shop.purchaseOrders.action.convert")}
              </button>
            ) : null}
            {order.status === "draft" ? (
              <button
                type="button"
                disabled={approving || lines.length === 0}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                onClick={async () => {
                  if (!tenantId) return;
                  setApproving(true);
                  setErrorKey(null);
                  try {
                    const res = await apiFetch(`/api/shop/purchase-orders/${order.id}/approve`, { method: "POST", headers: { "X-Tenant-Id": tenantId } });
                    const json = (await res.json()) as { error?: { message_key?: string } };
                    if (!res.ok) {
                      setErrorKey(json.error?.message_key ?? "errors.internal");
                      return;
                    }
                    await refresh();
                  } catch {
                    setErrorKey("errors.internal");
                  } finally {
                    setApproving(false);
                  }
                }}
              >
                {approving ? t("app.shop.purchaseOrders.action.working") : t("app.shop.purchaseOrders.action.approve")}
              </button>
            ) : null}
            {order.status === "draft" ? (
              <button
                type="button"
                disabled={saving}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                onClick={async () => {
                  if (!tenantId) return;
                  setSaving(true);
                  setErrorKey(null);
                  try {
                    const payload = {
                      locationId,
                      supplierId: supplier?.id ?? null,
                      notes: notes.trim() ? notes.trim() : null,
                      lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost }))
                    };
                    const res = await apiFetch(`/api/shop/purchase-orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify(payload) });
                    const json = (await res.json()) as { error?: { message_key?: string } };
                    if (!res.ok) {
                      setErrorKey(json.error?.message_key ?? "errors.internal");
                      return;
                    }
                    await refresh();
                  } catch {
                    setErrorKey("errors.internal");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? t("app.shop.purchaseOrders.action.working") : t("common.button.save")}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.purchaseOrders.field.location")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm disabled:opacity-60" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={!isDraft}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.purchaseOrders.field.supplier")}</label>
            {isDraft ? (
              <>
                <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={supplier ? supplier.name : supplierQuery} onChange={(e) => { setSupplier(null); setSupplierQuery(e.target.value); }} placeholder={t("app.shop.purchaseOrders.field.supplier.placeholder")} />
                {supplierMatches.length ? (
                  <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white">
                    {supplierMatches.map((s) => (
                      <button key={s.id} type="button" className="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50" onClick={() => { setSupplier(s); setSupplierQuery(""); setSupplierMatches([]); }}>
                        {s.name}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="mt-2 text-sm text-gray-900">{supplier?.name ?? "—"}</div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.purchaseOrders.field.subtotal")}</label>
            <div className="mt-2 text-sm font-semibold text-gray-900 tabular">{formatMoney(subtotal, order.currencyCode)}</div>
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-xs font-medium text-gray-700">{t("app.shop.purchaseOrders.field.notes")}</label>
          <textarea className="mt-1 min-h-24 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm disabled:opacity-60" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!isDraft} placeholder={t("app.shop.purchaseOrders.field.notes.placeholder")} />
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg font-semibold">{t("app.shop.purchaseOrders.lines.title")}</div>
          {isDraft ? (
            <button type="button" className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50" onClick={() => { setProductQuery(""); setProductMatches([]); setProductModalOpen(true); }}>
              {t("app.shop.purchaseOrders.lines.add")}
            </button>
          ) : null}
        </div>

        {lines.length === 0 ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-700">{t("app.shop.purchaseOrders.lines.empty")}</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[900px] w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.purchaseOrders.lines.table.product")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.purchaseOrders.lines.table.qty")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.purchaseOrders.lines.table.unitCost")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.purchaseOrders.lines.table.total")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.purchaseOrders.lines.table.actions")}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {lines.map((l) => {
                  const q = Number(l.quantity);
                  const c = Number(l.unitCost);
                  const total = Number.isFinite(q) && Number.isFinite(c) ? toMoneyString(q * c) : "0.00";
                  return (
                    <tr key={l.tempId}>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{l.name}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right">
                        <input className="h-10 w-28 rounded-xl border border-gray-200 px-3 text-sm text-right tabular disabled:opacity-60" value={l.quantity} onChange={(e) => setLines((prev) => prev.map((x) => (x.tempId === l.tempId ? { ...x, quantity: e.target.value } : x)))} disabled={!isDraft} />
                      </td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right">
                        <input className="h-10 w-32 rounded-xl border border-gray-200 px-3 text-sm text-right tabular disabled:opacity-60" value={l.unitCost} onChange={(e) => setLines((prev) => prev.map((x) => (x.tempId === l.tempId ? { ...x, unitCost: e.target.value } : x)))} disabled={!isDraft} />
                      </td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900 tabular">{formatMoney(total, order.currencyCode)}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right">
                        {isDraft ? (
                          <button type="button" className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50" onClick={() => setLines((prev) => prev.filter((x) => x.tempId !== l.tempId))}>
                            {t("common.button.remove")}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={productModalOpen} onClose={() => setProductModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.shop.purchaseOrders.lines.addTitle")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.shop.purchaseOrders.lines.addSubtitle")}</div>

          <div className="mt-6">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.purchaseOrders.lines.search")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder={t("app.shop.purchaseOrders.lines.search.placeholder")} />
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200">
            {productMatches.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-700">{t("app.shop.purchaseOrders.lines.search.empty")}</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {productMatches.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50"
                    onClick={() => {
                      const id = (() => {
                        try {
                          return crypto.randomUUID();
                        } catch {
                          return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
                        }
                      })();
                      const unitCost = p.costPrice ?? "0.00";
                      setLines((prev) => [{ tempId: id, productId: p.id, name: p.name, quantity: toQtyString(1), unitCost }, ...prev]);
                      setProductModalOpen(false);
                      setProductQuery("");
                      setProductMatches([]);
                    }}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-900">{p.name}</div>
                      <div className="mt-1 text-xs text-gray-500">{p.sku ?? p.barcodes?.[0] ?? "—"}</div>
                    </div>
                    <div className="shrink-0 text-xs font-medium text-gray-700">{t("common.button.add")}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setProductModalOpen(false)}>
              {t("common.button.close")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
