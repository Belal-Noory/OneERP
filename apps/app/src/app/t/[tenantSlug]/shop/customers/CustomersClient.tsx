"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type MeResponse = {
  data: {
    memberships: { tenantId: string; tenantSlug: string }[];
  };
};

type Customer = {
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

type CustomersResponse = {
  data: {
    items: Customer[];
    page: number;
    pageSize: number;
    total: number;
  };
};

export function CustomersClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [items, setItems] = useState<Customer[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"active" | "archived">("active");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    async function loadCustomers() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const params = new URLSearchParams();
        if (q.trim()) params.set("q", q.trim());
        params.set("status", status);
        params.set("page", String(page));
        params.set("pageSize", String(pageSize));

        const res = await apiFetch(`/api/shop/customers?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as CustomersResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const data = (json as CustomersResponse).data;
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
    void loadCustomers();
    return () => {
      cancelled = true;
    };
  }, [tenantId, q, status, page, pageSize]);

  function openCreate() {
    setEditing(null);
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setNotes("");
    setModalOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setName(c.name);
    setPhone(c.phone ?? "");
    setEmail(c.email ?? "");
    setAddress(c.address ?? "");
    setNotes(c.notes ?? "");
    setModalOpen(true);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.shop.customers.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.shop.customers.subtitle")}</div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            {t("app.shop.customers.action.create")}
          </button>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.customers.filter.search")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder={t("app.shop.customers.filter.search.placeholder")}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.customers.filter.status")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as "active" | "archived");
              }}
            >
              <option value="active">{t("app.shop.customers.status.active")}</option>
              <option value="archived">{t("app.shop.customers.status.archived")}</option>
            </select>
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.customers.table.name")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.customers.table.phone")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.customers.table.email")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.customers.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={4}>
                    Loading…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={4}>
                    {t("app.shop.customers.empty")}
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr key={c.id}>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="font-medium text-gray-900">{c.name}</div>
                      {c.address ? <div className="mt-1 text-xs text-gray-500">{c.address}</div> : null}
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{c.phone ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{c.email ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                          href={`/t/${props.tenantSlug}/shop/customers/${c.id}`}
                        >
                          {t("app.shop.customers.action.ledger")}
                        </Link>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                          onClick={() => openEdit(c)}
                        >
                          {t("app.shop.customers.action.edit")}
                        </button>
                        {c.status === "active" ? (
                          <button
                            type="button"
                            disabled={!tenantId || deletingId === c.id}
                            className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                            onClick={() => {
                              setDeleteTargetId(c.id);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            {deletingId === c.id ? t("app.shop.customers.action.working") : t("app.shop.customers.action.delete")}
                          </button>
                        ) : null}
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
            {t("app.shop.customers.pagination.total")}: {total}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("app.shop.customers.pagination.prev")}
            </button>
            <div className="text-sm text-gray-700">
              {t("app.shop.customers.pagination.page")} {page} / {totalPages}
            </div>
            <button
              type="button"
              disabled={page >= totalPages}
              className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t("app.shop.customers.pagination.next")}
            </button>
          </div>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
      >
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">{editing ? t("app.shop.customers.modal.editTitle") : t("app.shop.customers.modal.createTitle")}</div>
              <div className="mt-2 text-sm text-gray-700">{t("app.shop.customers.modal.subtitle")}</div>
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setModalOpen(false)}
            >
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Field label={t("app.shop.customers.field.name")} value={name} onChange={setName} />
            <Field label={t("app.shop.customers.field.phone")} value={phone} onChange={setPhone} />
            <Field label={t("app.shop.customers.field.email")} value={email} onChange={setEmail} />
            <Field label={t("app.shop.customers.field.address")} value={address} onChange={setAddress} />
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.customers.field.notes")}</label>
              <textarea
                className="mt-1 min-h-[90px] w-full rounded-xl border border-gray-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("app.shop.customers.field.notes.placeholder")}
              />
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => setModalOpen(false)}
            >
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              disabled={!tenantId || saving || name.trim().length < 2}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              onClick={async () => {
                if (!tenantId) return;
                setSaving(true);
                setErrorKey(null);
                try {
                  const payload = {
                    name: name.trim(),
                    phone: phone.trim() || undefined,
                    email: email.trim() || undefined,
                    address: address.trim() || undefined,
                    notes: notes.trim() || undefined
                  };

                  if (editing) {
                    const res = await apiFetch(`/api/shop/customers/${editing.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                      body: JSON.stringify({
                        name: payload.name,
                        phone: phone.trim() ? phone.trim() : null,
                        email: email.trim() ? email.trim() : null,
                        address: address.trim() ? address.trim() : null,
                        notes: notes.trim() ? notes.trim() : null
                      })
                    });
                    if (!res.ok) {
                      const json = (await res.json()) as { error?: { message_key?: string } };
                      setErrorKey(json.error?.message_key ?? "errors.internal");
                      return;
                    }
                    setItems((prev) =>
                      prev.map((c) => (c.id === editing.id ? { ...c, ...payload, phone: payload.phone ?? null, email: payload.email ?? null, address: payload.address ?? null, notes: payload.notes ?? null } : c))
                    );
                    setModalOpen(false);
                  } else {
                    const res = await apiFetch(`/api/shop/customers`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                      body: JSON.stringify(payload)
                    });
                    const json = (await res.json()) as { data?: Customer; error?: { message_key?: string } };
                    if (!res.ok || !json.data) {
                      setErrorKey(json.error?.message_key ?? "errors.internal");
                      return;
                    }
                    setItems((prev) => [json.data as Customer, ...prev]);
                    setTotal((v) => v + 1);
                    setModalOpen(false);
                  }
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? t("app.shop.customers.action.working") : t("common.button.submit")}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteDialogOpen}
        title={t("app.shop.customers.delete.title")}
        description={t("app.shop.customers.delete.confirm")}
        confirmLabel={t("app.shop.customers.action.delete")}
        cancelLabel={t("common.button.cancel")}
        confirmTone="danger"
        busy={!!(deleteTargetId && deletingId === deleteTargetId)}
        onCancel={() => {
          setDeleteDialogOpen(false);
          setDeleteTargetId(null);
        }}
        onConfirm={async () => {
          if (!tenantId || !deleteTargetId) return;
          setDeletingId(deleteTargetId);
          try {
            const res = await apiFetch(`/api/shop/customers/${deleteTargetId}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId } });
            if (!res.ok) return;
            setItems((prev) => prev.filter((c) => c.id !== deleteTargetId));
            setTotal((v) => Math.max(0, v - 1));
            setDeleteDialogOpen(false);
            setDeleteTargetId(null);
          } finally {
            setDeletingId(null);
          }
        }}
      />
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-900">{props.label}</label>
      <input
        className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
      />
    </div>
  );
}
