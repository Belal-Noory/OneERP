"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = {
  data: {
    memberships: { tenantId: string; tenantSlug: string }[];
  };
};

type InvoiceListItem = {
  id: string;
  kind: "sale" | "refund";
  status: "draft" | "posted" | "void";
  invoiceNumber: string | null;
  refundOf: { id: string; invoiceNumber: string | null } | null;
  currencyCode: string;
  subtotal: string;
  createdAt: string;
  postedAt: string | null;
  customer: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
};

type InvoicesResponse = {
  data: {
    items: InvoiceListItem[];
    page: number;
    pageSize: number;
    total: number;
  };
};

export function OrdersClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "draft" | "posted" | "void">("all");
  const [items, setItems] = useState<InvoiceListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

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
    async function loadInvoices() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        params.set("status", status);
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));
        const res = await apiFetch(`/api/shop/invoices?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as InvoicesResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const data = (json as InvoicesResponse).data;
        if (!cancelled) {
          setItems(data.items);
          setTotal(data.total);
          setPage(data.page);
          setPageSize(data.pageSize);
        }
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadInvoices();
    return () => {
      cancelled = true;
    };
  }, [tenantId, q, status, page, pageSize]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.shop.orders.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.shop.orders.subtitle")}</div>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
            href={`/t/${props.tenantSlug}/shop/orders/new`}
          >
            {t("app.shop.orders.action.newInvoice")}
          </Link>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.orders.filter.search")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder={t("app.shop.orders.filter.search.placeholder")}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.orders.filter.status")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as "all" | "draft" | "posted" | "void");
              }}
            >
              <option value="all">{t("app.shop.orders.status.all")}</option>
              <option value="draft">{t("app.shop.orders.status.draft")}</option>
              <option value="posted">{t("app.shop.orders.status.posted")}</option>
              <option value="void">{t("app.shop.orders.status.void")}</option>
            </select>
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="block lg:hidden">
          {loading ? (
            <div className="px-4 py-6 text-sm text-gray-600">Loading…</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-600">{t("app.shop.orders.empty")}</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {items.map((inv) => (
                <div key={inv.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">
                        {inv.invoiceNumber ?? (inv.kind === "refund" ? t("app.shop.orders.refundDraft") : t("app.shop.orders.draftNumber"))}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
                        <span>{t(`app.shop.orders.kind.${inv.kind}`)}</span>
                        <span className="text-gray-300">•</span>
                        <span>{t(`app.shop.orders.status.${inv.status}`)}</span>
                        {inv.kind === "refund" && inv.refundOf?.invoiceNumber ? (
                          <>
                            <span className="text-gray-300">•</span>
                            <span>
                              {t("app.shop.orders.refundOf")} {inv.refundOf.invoiceNumber}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-semibold text-gray-900">
                      {formatMoney(inv.subtotal, inv.currencyCode)}
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                      <div className="text-[11px] font-medium text-gray-600">{t("app.shop.orders.table.customer")}</div>
                      <div className="mt-1 truncate text-sm font-medium text-gray-900">{inv.customer?.name ?? "—"}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                      <div className="text-[11px] font-medium text-gray-600">{t("app.shop.orders.table.location")}</div>
                      <div className="mt-1 truncate text-sm font-medium text-gray-900">{inv.location?.name ?? "—"}</div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <Link
                      className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
                      href={`/t/${props.tenantSlug}/shop/orders/${inv.id}`}
                    >
                      {t("app.shop.orders.action.open")}
                    </Link>
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
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.orders.table.number")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.orders.table.customer")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.orders.table.location")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.orders.table.subtotal")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.orders.table.status")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.orders.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={6}>
                    Loading…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={6}>
                    {t("app.shop.orders.empty")}
                  </td>
                </tr>
              ) : (
                items.map((inv) => (
                  <tr key={inv.id}>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-900">
                      <div className="font-medium">
                        {inv.invoiceNumber ?? (inv.kind === "refund" ? t("app.shop.orders.refundDraft") : t("app.shop.orders.draftNumber"))}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {t(`app.shop.orders.kind.${inv.kind}`)}
                        {inv.kind === "refund" && inv.refundOf?.invoiceNumber ? ` · ${t("app.shop.orders.refundOf")} ${inv.refundOf.invoiceNumber}` : ""}
                      </div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{inv.customer?.name ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{inv.location?.name ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{formatMoney(inv.subtotal, inv.currencyCode)}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{t(`app.shop.orders.status.${inv.status}`)}</td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <Link
                        className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                        href={`/t/${props.tenantSlug}/shop/orders/${inv.id}`}
                      >
                        {t("app.shop.orders.action.open")}
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
            {t("app.shop.orders.pagination.total")}: {total}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("app.shop.orders.pagination.prev")}
            </button>
            <div className="text-sm text-gray-700">
              {t("app.shop.orders.pagination.page")} {page} / {totalPages}
            </div>
            <button
              type="button"
              disabled={page >= totalPages}
              className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t("app.shop.orders.pagination.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
