"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

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

type InvoicesResponse = { data: { items: InvoiceListItem[]; page: number; pageSize: number; total: number } };

export function PharmacySalesClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "draft" | "posted" | "void">("posted");
  const [items, setItems] = useState<InvoiceListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

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
        const res = await apiFetch(`/api/pharmacy/invoices?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
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
            <div className="text-xl font-semibold">{t("app.pharmacy.sales.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.pharmacy.sales.subtitle")}</div>
          </div>
          <Link className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700" href={`/t/${props.tenantSlug}/pharmacy/pos`}>
            {t("app.pharmacy.sales.action.newSale")}
          </Link>
          <div className="relative">
            <button
              type="button"
              disabled={!tenantId || loading || items.length === 0}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
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
                        const threshold = `q=${q.trim() || ""};status=${status}`;
                        await apiFetch("/api/pharmacy/reports/export-log", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                          body: JSON.stringify({ reportId: "pharmacy.sales.list.v1", format: "xlsx", threshold })
                        });
                      } catch {}
                      const XLSX = await import("xlsx");
                      const wb = XLSX.utils.book_new();
                      const summaryAoA = [["Pharmacy sales"], ["Exported at", new Date().toISOString()], ["Status", status], ["Query", q.trim() || ""]];
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");

                      const maxRows = 5000;
                      const exportPageSize = 500;
                      const all: InvoiceListItem[] = [];
                      for (let p = 1; p <= 100; p += 1) {
                        const params = new URLSearchParams();
                        if (q.trim()) params.set("q", q.trim());
                        params.set("status", status);
                        params.set("page", String(p));
                        params.set("pageSize", String(exportPageSize));
                        const res = await apiFetch(`/api/pharmacy/invoices?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
                        const json = (await res.json()) as InvoicesResponse;
                        if (!res.ok) break;
                        const batch = json.data.items ?? [];
                        all.push(...batch);
                        if (batch.length < exportPageSize) break;
                        if (all.length >= maxRows) break;
                      }

                      const header = ["Number", "Kind", "Status", "Subtotal", "Currency", "Customer", "Location", "Created at", "Posted at"];
                      const rows = all.slice(0, maxRows).map((inv) => [
                        inv.invoiceNumber ?? "",
                        inv.kind,
                        inv.status,
                        inv.subtotal,
                        inv.currencyCode,
                        inv.customer?.name ?? "",
                        inv.location?.name ?? "",
                        new Date(inv.createdAt).toISOString(),
                        inv.postedAt ? new Date(inv.postedAt).toISOString() : ""
                      ]);
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Sales");

                      const safeDate = new Date().toISOString().slice(0, 10);
                      const filename = `pharmacy_sales_${safeDate}.xlsx`;
                      XLSX.writeFile(wb, filename);
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
                  href={`/t/${props.tenantSlug}/pharmacy/sales/print?paper=a4&q=${encodeURIComponent(q.trim())}&status=${encodeURIComponent(status)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.reports.export.printView")}
                </a>
                <a
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/pharmacy/sales/print?paper=a4&download=pdf&q=${encodeURIComponent(q.trim())}&status=${encodeURIComponent(status)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.reports.export.pdfA4")}
                </a>
                <a
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/pharmacy/sales/print?paper=thermal80&download=pdf&q=${encodeURIComponent(q.trim())}&status=${encodeURIComponent(status)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.reports.export.pdf80")}
                </a>
                <a
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/pharmacy/sales/print?paper=thermal58&download=pdf&q=${encodeURIComponent(q.trim())}&status=${encodeURIComponent(status)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.reports.export.pdf58")}
                </a>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.sales.filter.search")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder={t("app.pharmacy.sales.filter.search.placeholder")}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.sales.filter.status")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as "all" | "draft" | "posted" | "void");
              }}
            >
              <option value="all">{t("app.pharmacy.sales.status.all")}</option>
              <option value="draft">{t("app.pharmacy.sales.status.draft")}</option>
              <option value="posted">{t("app.pharmacy.sales.status.posted")}</option>
              <option value="void">{t("app.pharmacy.sales.status.void")}</option>
            </select>
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="block lg:hidden">
          {loading ? (
            <div className="px-4 py-6 text-sm text-gray-600">{t("common.loading")}</div>
          ) : items.length === 0 ? (
            <div className="px-4 py-6 text-sm text-gray-600">{t("app.pharmacy.sales.empty")}</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {items.map((inv) => (
                <div key={inv.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">
                        {inv.invoiceNumber ?? (inv.kind === "refund" ? t("app.pharmacy.sales.refundDraft") : t("app.pharmacy.sales.draftNumber"))}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
                        <span>{t(`app.pharmacy.sales.kind.${inv.kind}`)}</span>
                        <span className="text-gray-300">•</span>
                        <span>{t(`app.pharmacy.sales.status.${inv.status}`)}</span>
                        {inv.kind === "refund" && inv.refundOf?.invoiceNumber ? (
                          <>
                            <span className="text-gray-300">•</span>
                            <span>
                              {t("app.pharmacy.sales.refundOf")} {inv.refundOf.invoiceNumber}
                            </span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-semibold text-gray-900">{formatMoney(inv.subtotal, inv.currencyCode)}</div>
                  </div>

                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                      <div className="text-[11px] font-medium text-gray-600">{t("app.pharmacy.sales.table.customer")}</div>
                      <div className="mt-1 truncate text-sm font-medium text-gray-900">{inv.customer?.name ?? "—"}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                      <div className="text-[11px] font-medium text-gray-600">{t("app.pharmacy.sales.table.location")}</div>
                      <div className="mt-1 truncate text-sm font-medium text-gray-900">{inv.location?.name ?? "—"}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <Link className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/sales/${inv.id}`}>
                      {t("app.pharmacy.sales.action.open")}
                    </Link>
                    <Link
                      className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
                      href={`/t/${props.tenantSlug}/pharmacy/orders/${inv.id}/print?paper=thermal80`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("app.pharmacy.sales.action.reprint")}
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
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.sales.table.number")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.sales.table.customer")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.sales.table.location")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.sales.table.subtotal")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.sales.table.status")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.sales.table.actions")}</th>
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
                    {t("app.pharmacy.sales.empty")}
                  </td>
                </tr>
              ) : (
                items.map((inv) => (
                  <tr key={inv.id}>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-900">
                      <div className="font-medium">{inv.invoiceNumber ?? (inv.kind === "refund" ? t("app.pharmacy.sales.refundDraft") : t("app.pharmacy.sales.draftNumber"))}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {t(`app.pharmacy.sales.kind.${inv.kind}`)}
                        {inv.kind === "refund" && inv.refundOf?.invoiceNumber ? ` · ${t("app.pharmacy.sales.refundOf")} ${inv.refundOf.invoiceNumber}` : ""}
                      </div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{inv.customer?.name ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{inv.location?.name ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{formatMoney(inv.subtotal, inv.currencyCode)}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{t(`app.pharmacy.sales.status.${inv.status}`)}</td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/sales/${inv.id}`}>
                          {t("app.pharmacy.sales.action.open")}
                        </Link>
                        <Link
                          className="inline-flex h-9 items-center rounded-xl bg-primary-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
                          href={`/t/${props.tenantSlug}/pharmacy/orders/${inv.id}/print?paper=thermal80`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("app.pharmacy.sales.action.reprint")}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 p-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-gray-700">
            {t("app.pharmacy.sales.pagination.total")}: {total}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t("app.pharmacy.sales.pagination.prev")}
            </button>
            <div className="text-sm text-gray-700">
              {t("app.pharmacy.sales.pagination.page")} {page} / {totalPages}
            </div>
            <button type="button" disabled={page >= totalPages} className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              {t("app.pharmacy.sales.pagination.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
