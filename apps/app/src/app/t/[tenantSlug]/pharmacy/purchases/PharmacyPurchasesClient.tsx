"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type Location = { id: string; name: string };
type LocationsResponse = { data: Location[] };

type PurchaseListItem = {
  id: string;
  kind: "purchase" | "refund";
  status: "draft" | "posted" | "void";
  purchaseNumber: string | null;
  refundOf: { id: string; purchaseNumber: string | null } | null;
  currencyCode: string;
  subtotal: string;
  paidTotal: string;
  createdAt: string;
  postedAt: string | null;
  supplier: { id: string; name: string } | null;
  location: { id: string; name: string };
};

type PurchasesResponse = { data: { items: PurchaseListItem[]; page: number; pageSize: number; total: number } };

export function PharmacyPurchasesClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(true);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "draft" | "posted" | "void">("all");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);

  const [items, setItems] = useState<PurchaseListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createLocationId, setCreateLocationId] = useState<string>("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    p.set("status", status);
    if (locationId) p.set("locationId", locationId);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    return p;
  }, [q, status, locationId, page, pageSize]);

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
        const res = await apiFetch("/api/pharmacy/locations", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as LocationsResponse;
        if (!cancelled) {
          setLocations(json.data);
          if (!createLocationId && json.data.length) setCreateLocationId(json.data[0].id);
        }
      } catch {
        if (!cancelled) setErrorKey("errors.internal");
      }
    }
    void loadLocations();
    return () => {
      cancelled = true;
    };
  }, [tenantId, createLocationId]);

  useEffect(() => {
    let cancelled = false;
    async function loadPurchases() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const res = await apiFetch(`/api/pharmacy/purchases?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as PurchasesResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const data = (json as PurchasesResponse).data;
        if (!cancelled) {
          setItems(data.items);
          setTotal(data.total);
          setPage(data.page);
        }
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadPurchases();
    return () => {
      cancelled = true;
    };
  }, [tenantId, queryParams]);

  async function createPurchase() {
    if (!tenantId) return;
    if (!createLocationId) return;
    setCreating(true);
    setErrorKey(null);
    try {
      const res = await apiFetch("/api/pharmacy/purchases", { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify({ locationId: createLocationId }) });
      const json = (await res.json()) as { data?: { id: string }; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      const id = json.data?.id ?? null;
      if (!id) {
        setErrorKey("errors.internal");
        return;
      }
      window.location.href = `/t/${props.tenantSlug}/pharmacy/purchases/${id}`;
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setCreating(false);
      setCreateOpen(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.pharmacy.purchases.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.pharmacy.purchases.subtitle")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={loadingTenant} className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60" onClick={() => setCreateOpen(true)}>
              {creating ? t("app.pharmacy.purchases.action.working") : t("app.pharmacy.purchases.action.create")}
            </button>
            <div className="relative">
              <button
                type="button"
                disabled={!tenantId || loadingTenant || exportingXlsx || items.length === 0}
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
                    onClick={async () => {
                      if (!tenantId) return;
                      setExportingXlsx(true);
                      setErrorKey(null);
                      try {
                        try {
                          const threshold = `q=${q.trim() || ""};status=${status};locationId=${locationId ?? ""}`;
                          await apiFetch("/api/pharmacy/reports/export-log", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                            body: JSON.stringify({ reportId: "pharmacy.purchases.list.v1", format: "xlsx", locationId: locationId ?? undefined, threshold })
                          });
                        } catch {}
                        const XLSX = await import("xlsx");
                        const wb = XLSX.utils.book_new();
                        const summaryAoA = [
                          ["Pharmacy purchases"],
                          ["Exported at", new Date().toISOString()],
                          ["Status", status],
                          ["Location", locationId ? locations.find((l) => l.id === locationId)?.name ?? locationId : t("common.all")],
                          ["Query", q.trim() || ""]
                        ];
                        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");

                        const maxRows = 5000;
                        const exportPageSize = 500;
                        const all: PurchaseListItem[] = [];
                        for (let p = 1; p <= 100; p += 1) {
                          const params = new URLSearchParams();
                          if (q.trim()) params.set("q", q.trim());
                          params.set("status", status);
                          if (locationId) params.set("locationId", locationId);
                          params.set("page", String(p));
                          params.set("pageSize", String(exportPageSize));
                          const res = await apiFetch(`/api/pharmacy/purchases?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
                          const json = (await res.json()) as PurchasesResponse;
                          if (!res.ok) break;
                          const batch = json.data.items ?? [];
                          all.push(...batch);
                          if (batch.length < exportPageSize) break;
                          if (all.length >= maxRows) break;
                        }

                        const header = ["Number", "Kind", "Status", "Supplier", "Location", "Subtotal", "Paid", "Balance", "Currency", "Created at", "Posted at"];
                        const rows = all.slice(0, maxRows).map((p) => [
                          p.purchaseNumber ?? "",
                          p.kind,
                          p.status,
                          p.supplier?.name ?? "",
                          p.location.name,
                          p.subtotal,
                          p.paidTotal,
                          (Number(p.subtotal) - Number(p.paidTotal)).toFixed(2),
                          p.currencyCode,
                          new Date(p.createdAt).toISOString(),
                          p.postedAt ? new Date(p.postedAt).toISOString() : ""
                        ]);
                        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Purchases");

                        const safeDate = new Date().toISOString().slice(0, 10);
                        XLSX.writeFile(wb, `pharmacy_purchases_${safeDate}.xlsx`);
                      } catch {
                        setErrorKey("errors.internal");
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
                    href={`/t/${props.tenantSlug}/pharmacy/purchases/print?paper=a4&q=${encodeURIComponent(q.trim())}&status=${encodeURIComponent(status)}&locationId=${encodeURIComponent(locationId ?? "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("app.shop.reports.export.printView")}
                  </a>
                  <a
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                    href={`/t/${props.tenantSlug}/pharmacy/purchases/print?paper=a4&download=pdf&q=${encodeURIComponent(q.trim())}&status=${encodeURIComponent(status)}&locationId=${encodeURIComponent(locationId ?? "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("app.shop.reports.export.pdfA4")}
                  </a>
                  <a
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                    href={`/t/${props.tenantSlug}/pharmacy/purchases/print?paper=thermal80&download=pdf&q=${encodeURIComponent(q.trim())}&status=${encodeURIComponent(status)}&locationId=${encodeURIComponent(locationId ?? "")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("app.shop.reports.export.pdf80")}
                  </a>
                  <a
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                    href={`/t/${props.tenantSlug}/pharmacy/purchases/print?paper=thermal58&download=pdf&q=${encodeURIComponent(q.trim())}&status=${encodeURIComponent(status)}&locationId=${encodeURIComponent(locationId ?? "")}`}
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
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.purchases.filter.search")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder={t("app.pharmacy.purchases.filter.search.placeholder")}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.purchases.filter.status")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as "all" | "draft" | "posted" | "void");
              }}
            >
              <option value="all">{t("app.pharmacy.purchases.filter.status.all")}</option>
              <option value="draft">{t("app.pharmacy.purchases.status.draft")}</option>
              <option value="posted">{t("app.pharmacy.purchases.status.posted")}</option>
              <option value="void">{t("app.pharmacy.purchases.status.void")}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.purchases.filter.location")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={locationId ?? ""} onChange={(e) => setLocationId(e.target.value ? e.target.value : null)}>
              <option value="">{t("common.all")}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.purchases.table.number")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.purchases.table.type")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.purchases.table.supplier")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.purchases.table.location")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.purchases.table.status")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.pharmacy.purchases.table.total")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.pharmacy.purchases.table.balance")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.purchases.table.date")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.pharmacy.purchases.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={9}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={9}>
                    {t("app.pharmacy.purchases.empty")}
                  </td>
                </tr>
              ) : (
                items.map((p) => {
                  const balance = String(Number(p.subtotal) - Number(p.paidTotal));
                  return (
                    <tr key={p.id}>
                      <td className="border-b border-gray-100 px-4 py-3">
                        <div className="font-medium text-gray-900">{p.purchaseNumber ?? (p.kind === "refund" ? t("app.pharmacy.purchaseRefund.titleDraft") : t("app.pharmacy.purchase.titleDraft"))}</div>
                        {p.refundOf?.purchaseNumber ? <div className="text-xs text-gray-500">{t("app.pharmacy.purchases.refundOf")}: {p.refundOf.purchaseNumber}</div> : null}
                      </td>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{p.kind === "refund" ? t("app.pharmacy.purchases.type.refund") : t("app.pharmacy.purchases.type.purchase")}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{p.supplier?.name ?? "—"}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{p.location.name}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{t(`app.pharmacy.purchases.status.${p.status}`)}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900 tabular">{formatMoney(p.subtotal, p.currencyCode)}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900 tabular">{formatMoney(balance, p.currencyCode)}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{new Date(p.createdAt).toLocaleString()}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right">
                        <Link className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/purchases/${p.id}`}>
                          {t("app.pharmacy.purchases.action.open")}
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 p-4">
          <div className="text-sm text-gray-700">
            {t("app.pharmacy.purchases.pagination.total")}: {total} · {t("app.pharmacy.purchases.pagination.page")} {page} / {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t("app.pharmacy.purchases.pagination.prev")}
            </button>
            <button type="button" disabled={page >= totalPages} className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              {t("app.pharmacy.purchases.pagination.next")}
            </button>
          </div>
        </div>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold text-gray-900">{t("app.pharmacy.purchases.create.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.pharmacy.purchases.create.subtitle")}</div>

          <div className="mt-6">
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.purchases.create.location")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={createLocationId} onChange={(e) => setCreateLocationId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setCreateOpen(false)} disabled={creating}>
              {t("common.button.cancel")}
            </button>
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60" onClick={createPurchase} disabled={creating || !createLocationId}>
              {creating ? t("app.pharmacy.purchases.action.working") : t("app.pharmacy.purchases.action.create")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
