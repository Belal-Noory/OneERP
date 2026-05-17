"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type IncomeRow = {
  id: string;
  incomeDate: string;
  category: string;
  description: string | null;
  amount: string;
  createdAt: string;
  updatedAt: string;
};

type ListResponse = { data: { items: IncomeRow[]; page: number; pageSize: number; total: number } };

export function PrintPressIncomeClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [items, setItems] = useState<IncomeRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<IncomeRow | null>(null);
  const [saving, setSaving] = useState(false);

  const [incomeDate, setIncomeDate] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

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
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));

      const res = await apiFetch(`/api/printpress/income?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
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
  }, [from, page, pageSize, q, tenantId, to]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  function openCreate() {
    setEditing(null);
    setIncomeDate(new Date().toISOString().slice(0, 10));
    setCategory("");
    setDescription("");
    setAmount("");
    setModalOpen(true);
  }

  function openEdit(row: IncomeRow) {
    setEditing(row);
    setIncomeDate(new Date(row.incomeDate).toISOString().slice(0, 10));
    setCategory(row.category);
    setDescription(row.description ?? "");
    setAmount(row.amount);
    setModalOpen(true);
  }

  async function save() {
    if (!tenantId) return;
    const cat = category.trim();
    const amt = amount.trim();
    if (!cat || !amt) {
      setErrorKey("errors.validation");
      return;
    }
    setSaving(true);
    setErrorKey(null);
    try {
      const payload = {
        incomeDate: incomeDate ? new Date(incomeDate).toISOString() : undefined,
        category: cat,
        description: description.trim() || undefined,
        amount: amt
      };
      const res = editing
        ? await apiFetch(`/api/printpress/income/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
            body: JSON.stringify(payload)
          })
        : await apiFetch("/api/printpress/income", { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify(payload) });

      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      setModalOpen(false);
      await loadList();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  }

  function askDelete(id: string) {
    setDeleteId(id);
    setConfirmOpen(true);
  }

  async function confirmDelete() {
    if (!tenantId || !deleteId) return;
    setConfirming(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/printpress/income/${deleteId}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      setConfirmOpen(false);
      await loadList();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.printpress.income.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.printpress.income.subtitle")}</div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            {t("app.printpress.income.action.create")}
          </button>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.income.filter.search")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder={t("app.printpress.income.filter.search.placeholder")}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.income.filter.from")}</label>
            <input
              type="date"
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={from}
              onChange={(e) => {
                setPage(1);
                setFrom(e.target.value);
              }}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.income.filter.to")}</label>
            <input
              type="date"
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={to}
              onChange={(e) => {
                setPage(1);
                setTo(e.target.value);
              }}
            />
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.income.table.date")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.income.table.category")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.income.table.description")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.income.table.amount")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.income.table.actions")}</th>
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
                    {t("app.printpress.income.empty")}
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.id}>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{new Date(row.incomeDate).toLocaleDateString()}</td>
                    <td className="border-b border-gray-100 px-4 py-3 font-medium text-gray-900">{row.category}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{row.description ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{row.amount}</td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                          onClick={() => openEdit(row)}
                        >
                          {t("common.button.edit")}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                          onClick={() => askDelete(row.id)}
                        >
                          {t("common.button.remove")}
                        </button>
                      </div>
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
            <div className="text-xl font-semibold">{editing ? t("app.printpress.income.modal.edit") : t("app.printpress.income.modal.create")}</div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setModalOpen(false)}
            >
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.income.field.date")}</label>
                <input
                  type="date"
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={incomeDate}
                  onChange={(e) => setIncomeDate(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.income.field.amount")}</label>
                <input
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.income.field.category")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.income.field.description")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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

      <ConfirmDialog
        open={confirmOpen}
        title={t("app.printpress.income.confirm.delete.title")}
        description={t("app.printpress.income.confirm.delete.description")}
        confirmLabel={t("common.button.remove")}
        cancelLabel={t("common.button.cancel")}
        confirmTone="danger"
        busy={confirming}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

