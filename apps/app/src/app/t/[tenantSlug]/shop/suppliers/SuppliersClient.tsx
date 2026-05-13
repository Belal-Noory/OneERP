"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type Supplier = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

type SuppliersResponse = { data: { items: Supplier[]; page: number; pageSize: number; total: number } };

export function SuppliersClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [items, setItems] = useState<Supplier[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"active" | "archived">("active");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    p.set("status", status);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    return p;
  }, [page, pageSize, q, status]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const res = await apiFetch(`/api/shop/suppliers?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as SuppliersResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const data = (json as SuppliersResponse).data;
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

  function openCreate() {
    setEditing(null);
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setNotes("");
    setModalOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setName(s.name);
    setPhone(s.phone ?? "");
    setEmail(s.email ?? "");
    setAddress(s.address ?? "");
    setNotes(s.notes ?? "");
    setModalOpen(true);
  }

  async function save() {
    if (!tenantId) return;
    setSaving(true);
    setErrorKey(null);
    try {
      const payload = { name: name.trim(), phone: phone.trim() || null, email: email.trim() || null, address: address.trim() || null, notes: notes.trim() || null };
      const res = await apiFetch(editing ? `/api/shop/suppliers/${editing.id}` : "/api/shop/suppliers", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setModalOpen(false);
      setEditing(null);
      setPage(1);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSupplier(id: string) {
    if (!tenantId) return;
    setDeletingId(id);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/shop/suppliers/${id}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setDeleteDialogOpen(false);
      setDeleteTargetId(null);
      setPage(1);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setDeletingId(null);
    }
  }

  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.shop.suppliers.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.shop.suppliers.subtitle")}</div>
          </div>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            onClick={openCreate}
            disabled={loading}
          >
            {t("app.shop.suppliers.action.create")}
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.suppliers.filter.search")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm disabled:opacity-60"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("app.shop.suppliers.filter.search.placeholder")}
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.suppliers.filter.status")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm disabled:opacity-60"
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              disabled={loading}
            >
              <option value="active">{t("app.shop.suppliers.status.active")}</option>
              <option value="archived">{t("app.shop.suppliers.status.archived")}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.suppliers.table.name")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.suppliers.table.phone")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.suppliers.table.email")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.suppliers.table.status")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.suppliers.table.actions")}</th>
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
                    {t("app.shop.suppliers.empty")}
                  </td>
                </tr>
              ) : (
                items.map((s) => (
                  <tr key={s.id}>
                    <td className="border-b border-gray-100 px-4 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{s.phone ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{s.email ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{t(`app.shop.suppliers.status.${s.status}`)}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Link className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/shop/suppliers/${s.id}/ledger`}>
                          {t("app.shop.suppliers.action.ledger")}
                        </Link>
                        <button type="button" className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50" onClick={() => openEdit(s)}>
                          {t("app.shop.suppliers.action.edit")}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-xl border border-red-200 bg-white px-3 text-sm text-red-700 hover:bg-red-50"
                          onClick={() => {
                            setDeleteTargetId(s.id);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          {t("app.shop.suppliers.action.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-gray-600">
            {t("app.shop.suppliers.pagination.total")}: {total} · {t("app.shop.suppliers.pagination.page")} {page} / {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <select className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
              {[10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t("app.shop.suppliers.pagination.prev")}
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              {t("app.shop.suppliers.pagination.next")}
            </button>
          </div>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{editing ? t("app.shop.suppliers.modal.editTitle") : t("app.shop.suppliers.modal.createTitle")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.shop.suppliers.modal.subtitle")}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.suppliers.field.name")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.suppliers.field.phone")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.suppliers.field.email")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.suppliers.field.address")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.suppliers.field.notes")}</label>
              <textarea className="mt-1 min-h-[90px] w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 md:flex-row md:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setModalOpen(false)} disabled={saving}>
              {t("common.button.cancel")}
            </button>
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60" onClick={save} disabled={saving || name.trim().length < 2}>
              {saving ? t("app.shop.suppliers.action.working") : t("common.button.submit")}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteDialogOpen}
        title={t("app.shop.suppliers.delete.title")}
        description={t("app.shop.suppliers.delete.desc")}
        confirmLabel={t("app.shop.suppliers.action.delete")}
        cancelLabel={t("common.button.cancel")}
        busy={Boolean(deleteTargetId && deletingId === deleteTargetId)}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setDeleteTargetId(null);
        }}
        onConfirm={() => {
          if (!deleteTargetId) return;
          void deleteSupplier(deleteTargetId);
        }}
      />
    </div>
  );
}
