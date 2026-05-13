"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };
type LocationsResponse = { data: { id: string; name: string }[] };

type PurchaseOrderListItem = {
  id: string;
  status: "draft" | "approved" | "closed" | "void";
  orderNumber: string | null;
  currencyCode: string;
  subtotal: string;
  createdAt: string;
  approvedAt: string | null;
  supplier: { id: string; name: string } | null;
  location: { id: string; name: string };
};

type PurchaseOrdersResponse = { data: { items: PurchaseOrderListItem[]; page: number; pageSize: number; total: number } };

export function PurchaseOrdersClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "draft" | "approved" | "closed" | "void">("all");
  const [locationId, setLocationId] = useState("");
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);

  const [items, setItems] = useState<PurchaseOrderListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [creating, setCreating] = useState(false);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

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
    let cancelled = false;
    async function loadLocations() {
      if (!tenantId) return;
      try {
        const res = await apiFetch("/api/shop/locations", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as LocationsResponse;
        if (!cancelled) {
          setLocations(json.data ?? []);
          setLocationId((prev) => prev || json.data?.[0]?.id || "");
        }
      } catch {}
    }
    void loadLocations();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    p.set("status", status);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (locationId) p.set("locationId", locationId);
    return p;
  }, [locationId, page, pageSize, q, status]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const res = await apiFetch(`/api/shop/purchase-orders?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as PurchaseOrdersResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const data = (json as PurchaseOrdersResponse).data;
        if (!cancelled) {
          setItems(data.items ?? []);
          setTotal(data.total ?? 0);
        }
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [queryParams, tenantId]);

  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.shop.purchaseOrders.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.shop.purchaseOrders.subtitle")}</div>
          </div>
          <button
            type="button"
            disabled={!tenantId || !locationId || creating || loading}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
            onClick={async () => {
              if (!tenantId || !locationId) return;
              setCreating(true);
              setErrorKey(null);
              try {
                const res = await apiFetch("/api/shop/purchase-orders", { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify({ locationId }) });
                const json = (await res.json()) as { data?: { id: string }; error?: { message_key?: string } };
                if (!res.ok || !json.data?.id) {
                  setErrorKey(json.error?.message_key ?? "errors.internal");
                  return;
                }
                window.location.href = `/t/${props.tenantSlug}/shop/purchase-orders/${json.data.id}`;
              } catch {
                setErrorKey("errors.internal");
              } finally {
                setCreating(false);
              }
            }}
          >
            {creating ? t("app.shop.purchaseOrders.action.working") : t("app.shop.purchaseOrders.action.create")}
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.purchaseOrders.filter.search")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm disabled:opacity-60" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("app.shop.purchaseOrders.filter.search.placeholder")} disabled={loading} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.purchaseOrders.filter.status")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm disabled:opacity-60" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} disabled={loading}>
              <option value="all">{t("app.shop.purchaseOrders.filter.status.all")}</option>
              <option value="draft">{t("app.shop.purchaseOrders.status.draft")}</option>
              <option value="approved">{t("app.shop.purchaseOrders.status.approved")}</option>
              <option value="closed">{t("app.shop.purchaseOrders.status.closed")}</option>
              <option value="void">{t("app.shop.purchaseOrders.status.void")}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.purchaseOrders.filter.location")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm disabled:opacity-60" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={locations.length === 0 || loading}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.purchaseOrders.table.number")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.purchaseOrders.table.supplier")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.purchaseOrders.table.location")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.purchaseOrders.table.status")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.purchaseOrders.table.total")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.purchaseOrders.table.date")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.purchaseOrders.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={7}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={7}>
                    {t("app.shop.purchaseOrders.empty")}
                  </td>
                </tr>
              ) : (
                items.map((o) => (
                  <tr key={o.id}>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{o.orderNumber ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{o.supplier?.name ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{o.location.name}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{t(`app.shop.purchaseOrders.status.${o.status}`)}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900 tabular">{formatMoney(o.subtotal, o.currencyCode)}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{new Date(o.createdAt).toLocaleString()}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right">
                      <Link className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/shop/purchase-orders/${o.id}`}>
                        {t("common.button.open")}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 p-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-gray-700">
            {t("common.pagination.page")} {page} / {totalPages} · {total} {t("common.pagination.items")}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select className="h-9 rounded-xl border border-gray-200 bg-white px-3 text-sm" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} disabled={loading}>
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button type="button" className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t("common.pagination.prev")}
            </button>
            <button type="button" className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              {t("common.pagination.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

