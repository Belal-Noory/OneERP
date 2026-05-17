"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { currencies } from "@/lib/currency-catalog";
import { Modal } from "@/components/Modal";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type CustomerOption = { id: string; fullName: string; companyName: string | null; phone: string | null };

type QuotationRow = {
  id: string;
  quotationNumber: string | null;
  status: string;
  currencyCode: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  createdAt: string;
  updatedAt: string;
  issuedAt: string | null;
  customer: { id: string; fullName: string } | null;
};

type ListResponse = { data: { items: QuotationRow[]; page: number; pageSize: number; total: number } };

const STATUSES = ["draft", "issued", "void"] as const;

type SettingsResponse = { data: { defaultCurrencyCode: string } };

export function PrintPressQuotationsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [items, setItems] = useState<QuotationRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const [modalOpen, setModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [defaultCurrencyCode, setDefaultCurrencyCode] = useState("USD");
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [notes, setNotes] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);

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

  const loadList = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await apiFetch(`/api/printpress/quotations?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as ListResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const data = (json as ListResponse).data;
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? 1);
      setPageSize(data.pageSize ?? 20);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, status, tenantId]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!tenantId) return;
    const tid = tenantId;
    let cancelled = false;
    async function loadSettings() {
      try {
        const res = await apiFetch("/api/printpress/settings", { cache: "no-store", headers: { "X-Tenant-Id": tid } });
        if (!res.ok) return;
        const json = (await res.json()) as SettingsResponse;
        const code = (json.data?.defaultCurrencyCode ?? "USD").trim().toUpperCase();
        if (!cancelled) setDefaultCurrencyCode(code || "USD");
      } catch {
        if (!cancelled) setDefaultCurrencyCode("USD");
      }
    }
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  function openCreate() {
    setCurrencyCode(defaultCurrencyCode || "USD");
    setDiscount("0");
    setTax("0");
    setNotes("");
    setCustomerQuery("");
    setCustomerOptions([]);
    setSelectedCustomer(null);
    setModalOpen(true);
  }

  useEffect(() => {
    if (!tenantId) return;
    if (!modalOpen) return;

    const q2 = customerQuery.trim();
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setCustomerLoading(true);
      try {
        const res = await apiFetch(`/api/printpress/customers/lookup?q=${encodeURIComponent(q2)}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json().catch(() => null)) as { data?: { items?: CustomerOption[] } } | null;
        if (!cancelled) setCustomerOptions(json?.data?.items ?? []);
      } catch {
        if (!cancelled) setCustomerOptions([]);
      } finally {
        if (!cancelled) setCustomerLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [customerQuery, modalOpen, tenantId]);

  async function create() {
    if (!tenantId) return;
    setCreating(true);
    setErrorKey(null);
    try {
      const res = await apiFetch("/api/printpress/quotations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({
          customerId: selectedCustomer?.id ?? undefined,
          currencyCode: currencyCode.trim() || defaultCurrencyCode || "USD",
          discount: discount.trim() || "0",
          tax: tax.trim() || "0",
          notes: notes.trim() || undefined
        })
      });
      const json = (await res.json().catch(() => null)) as { data?: { id?: string }; error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      const id = json?.data?.id ?? null;
      if (!id) {
        setErrorKey("errors.internal");
        return;
      }
      setModalOpen(false);
      window.location.href = `/t/${props.tenantSlug}/printpress/quotations/${id}`;
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.printpress.quotations.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.printpress.quotations.subtitle")}</div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            {t("app.printpress.quotations.action.create")}
          </button>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.quotations.filter.search")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder={t("app.printpress.quotations.filter.search.placeholder")}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.quotations.filter.status")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              <option value="">{t("app.printpress.quotations.filter.status.all")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`app.printpress.quotations.status.${s}`)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.quotations.table.quotation")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.quotations.table.customer")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.quotations.table.status")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.quotations.table.total")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.quotations.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={5}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={5}>
                    {t("app.printpress.quotations.empty")}
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id}>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="font-medium text-gray-900">{row.quotationNumber ?? t("app.printpress.quotations.noNumber")}</div>
                      <div className="mt-1 text-xs text-gray-500">{new Date(row.createdAt).toLocaleString()}</div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{row.customer?.fullName ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{t(`app.printpress.quotations.status.${row.status}`)}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">
                      {row.total} {row.currencyCode}
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <Link
                        href={`/t/${props.tenantSlug}/printpress/quotations/${row.id}`}
                        className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                      >
                        {t("common.button.open")}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-gray-600">
            {t("common.pagination.page")} {page} / {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("common.pagination.prev")}
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t("common.pagination.next")}
            </button>
          </div>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="text-xl font-semibold">{t("app.printpress.quotations.modal.create")}</div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setModalOpen(false)}
            >
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.quotations.field.customer")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder={t("app.printpress.quotations.field.customer.placeholder")}
              />

              {selectedCustomer ? (
                <div className="mt-2 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-900">{selectedCustomer.fullName}</div>
                    <div className="mt-0.5 truncate text-xs text-gray-600">
                      {[selectedCustomer.companyName, selectedCustomer.phone].filter(Boolean).join(" • ") || " "}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="ml-3 inline-flex h-9 shrink-0 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  >
                    {t("common.button.remove")}
                  </button>
                </div>
              ) : null}

              {!selectedCustomer ? (
                <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-gray-200">
                  {customerLoading ? (
                    <div className="px-3 py-3 text-sm text-gray-600">{t("common.loading")}</div>
                  ) : customerOptions.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-gray-600">{t("app.printpress.quotations.field.customer.empty")}</div>
                  ) : (
                    customerOptions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCustomer(c)}
                        className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        <div className="font-medium text-gray-900">{c.fullName}</div>
                        <div className="mt-0.5 text-xs text-gray-600">{[c.companyName, c.phone].filter(Boolean).join(" • ") || " "}</div>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.quotations.field.currency")}</label>
                <select
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value)}
                >
                  {!currencies.some((c) => c.code === currencyCode) ? <option value={currencyCode}>{currencyCode}</option> : null}
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.quotations.field.discount")}</label>
                <input
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.quotations.field.tax")}</label>
                <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={tax} onChange={(e) => setTax(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.quotations.field.notes")}</label>
              <textarea
                className="mt-1 min-h-28 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                {t("common.button.cancel")}
              </button>
              <button
                type="button"
                disabled={!tenantId || creating}
                onClick={create}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              >
                {creating ? t("common.loading") : t("common.button.create")}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
