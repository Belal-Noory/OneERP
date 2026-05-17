"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type CustomerOption = { id: string; fullName: string; companyName: string | null; phone: string | null };

type Job = {
  id: string;
  jobNumber: string | null;
  status: string;
  priority: string;
  title: string | null;
  description: string | null;
  orderDate: string;
  deliveryDate: string | null;
  customerId: string | null;
  customer: { id: string; fullName: string } | null;
  createdAt: string;
  updatedAt: string;
};

type JobsResponse = { data: { items: Job[]; page: number; pageSize: number; total: number } };

const STATUSES = ["received", "designing", "customer_approval", "printing", "finishing", "packaging", "ready", "delivered", "cancelled"] as const;
const PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export function PrintPressJobsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [items, setItems] = useState<Job[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("");
  const [priority, setPriority] = useState<string>("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Job | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [editStatus, setEditStatus] = useState<(typeof STATUSES)[number]>("received");
  const [editPriority, setEditPriority] = useState<(typeof PRIORITIES)[number]>("normal");
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

  const loadJobs = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await apiFetch(`/api/printpress/jobs?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as JobsResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const data = (json as JobsResponse).data;
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? 1);
      setPageSize(data.pageSize ?? 20);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, priority, q, status, tenantId]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  function openCreate() {
    setEditing(null);
    setTitle("");
    setDescription("");
    setEditStatus("received");
    setEditPriority("normal");
    setCustomerQuery("");
    setCustomerOptions([]);
    setSelectedCustomer(null);
    setModalOpen(true);
  }

  function openEdit(j: Job) {
    setEditing(j);
    setTitle(j.title ?? "");
    setDescription(j.description ?? "");
    setEditStatus((STATUSES.includes(j.status as (typeof STATUSES)[number]) ? (j.status as (typeof STATUSES)[number]) : "received") as (typeof STATUSES)[number]);
    setEditPriority((PRIORITIES.includes(j.priority as (typeof PRIORITIES)[number]) ? (j.priority as (typeof PRIORITIES)[number]) : "normal") as (typeof PRIORITIES)[number]);
    setCustomerQuery("");
    setCustomerOptions([]);
    setSelectedCustomer(j.customer ? { id: j.customer.id, fullName: j.customer.fullName, companyName: null, phone: null } : null);
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

  async function save() {
    if (!tenantId) return;
    const payload = {
      customerId: selectedCustomer?.id ?? null,
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      status: editStatus,
      priority: editPriority
    };

    setSaving(true);
    setErrorKey(null);
    try {
      const res = editing
        ? await apiFetch(`/api/printpress/jobs/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify(payload) })
        : await apiFetch("/api/printpress/jobs", { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify(payload) });

      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      setModalOpen(false);
      await loadJobs();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.printpress.jobs.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.printpress.jobs.subtitle")}</div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            {t("app.printpress.jobs.action.create")}
          </button>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.jobs.filter.search")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder={t("app.printpress.jobs.filter.search.placeholder")}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.jobs.filter.status")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              <option value="">{t("app.printpress.jobs.filter.status.all")}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`app.printpress.jobs.status.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.jobs.filter.priority")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={priority}
              onChange={(e) => {
                setPage(1);
                setPriority(e.target.value);
              }}
            >
              <option value="">{t("app.printpress.jobs.filter.priority.all")}</option>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {t(`app.printpress.jobs.priority.${p}`)}
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
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.jobs.table.title")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.jobs.table.status")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.jobs.table.priority")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.jobs.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={4}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={4}>
                    {t("app.printpress.jobs.empty")}
                  </td>
                </tr>
              ) : (
                items.map((j) => (
                  <tr key={j.id}>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="font-medium text-gray-900">{j.title ?? t("app.printpress.jobs.untitled")}</div>
                      {j.description ? <div className="mt-1 text-xs text-gray-500">{j.description}</div> : null}
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{t(`app.printpress.jobs.status.${j.status}`)}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{t(`app.printpress.jobs.priority.${j.priority}`)}</td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <button
                        type="button"
                        className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                        onClick={() => openEdit(j)}
                      >
                        {t("common.button.edit")}
                      </button>
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
            <div className="text-xl font-semibold">{editing ? t("app.printpress.jobs.modal.edit") : t("app.printpress.jobs.modal.create")}</div>
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
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.jobs.field.customer")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              placeholder={t("app.printpress.jobs.field.customer.placeholder")}
            />

            {selectedCustomer ? (
              <div className="mt-2 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-gray-900">{selectedCustomer.fullName}</div>
                  <div className="mt-0.5 truncate text-xs text-gray-600">{[selectedCustomer.companyName, selectedCustomer.phone].filter(Boolean).join(" • ") || " "}</div>
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
                  <div className="px-3 py-3 text-sm text-gray-600">{t("app.printpress.jobs.field.customer.empty")}</div>
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

          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.jobs.field.title")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.jobs.field.description")}</label>
            <textarea
              className="mt-1 min-h-28 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.jobs.field.status")}</label>
              <select
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value as (typeof STATUSES)[number])}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`app.printpress.jobs.status.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.jobs.field.priority")}</label>
              <select
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value as (typeof PRIORITIES)[number])}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`app.printpress.jobs.priority.${p}`)}
                  </option>
                ))}
              </select>
            </div>
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
              disabled={!tenantId || saving}
              onClick={save}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
            >
              {saving ? t("common.loading") : t("common.button.save")}
            </button>
          </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
