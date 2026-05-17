"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type Customer = {
  id: string;
  fullName: string;
  companyName: string | null;
  customerType: "individual" | "business" | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxNumber: string | null;
  notes: string | null;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

type CustomersResponse = { data: { items: Customer[]; page: number; pageSize: number; total: number } };

type Attachment = {
  id: string;
  fileId: string;
  fileUrl: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
};

type AttachmentsResponse = { data: { items: Attachment[] } };

export function PrintPressCustomersClient(props: { tenantSlug: string }) {
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

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [customerType, setCustomerType] = useState<"" | "individual" | "business">("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [removingAttachmentId, setRemovingAttachmentId] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"archive" | "restore">("archive");
  const [confirmTargetId, setConfirmTargetId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

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

  const loadCustomers = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      params.set("status", status);
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      const res = await apiFetch(`/api/printpress/customers?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as CustomersResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const data = (json as CustomersResponse).data;
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
    void loadCustomers();
  }, [loadCustomers]);

  function openCreate() {
    setEditing(null);
    setFullName("");
    setCompanyName("");
    setCustomerType("");
    setPhone("");
    setEmail("");
    setAddress("");
    setTaxNumber("");
    setNotes("");
    setAttachments([]);
    setModalOpen(true);
  }

  const loadAttachments = useCallback(
    async (customerId: string) => {
      if (!tenantId) return;
      setAttachmentsLoading(true);
      try {
        const res = await apiFetch(`/api/printpress/customers/${customerId}/attachments`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json().catch(() => null)) as AttachmentsResponse | { error?: { message_key?: string } } | null;
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } } | null)?.error?.message_key ?? "errors.internal");
          return;
        }
        setAttachments((json as AttachmentsResponse).data.items ?? []);
      } catch {
        setAttachments([]);
      } finally {
        setAttachmentsLoading(false);
      }
    },
    [tenantId]
  );

  function openEdit(c: Customer) {
    setEditing(c);
    setFullName(c.fullName);
    setCompanyName(c.companyName ?? "");
    setCustomerType(c.customerType ?? "");
    setPhone(c.phone ?? "");
    setEmail(c.email ?? "");
    setAddress(c.address ?? "");
    setTaxNumber(c.taxNumber ?? "");
    setNotes(c.notes ?? "");
    setAttachments([]);
    void loadAttachments(c.id);
    setModalOpen(true);
  }

  async function uploadAttachment(file: File) {
    if (!tenantId) return;
    if (!editing) return;
    setUploadingAttachment(true);
    setErrorKey(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await apiFetch("/api/files?purpose=printpress_customer_attachment", { method: "POST", headers: { "X-Tenant-Id": tenantId }, body: form });
      const uploadJson = (await uploadRes.json().catch(() => null)) as { data?: { id?: string } } | { error?: { message_key?: string } } | null;
      if (!uploadRes.ok) {
        setErrorKey((uploadJson as { error?: { message_key?: string } } | null)?.error?.message_key ?? "errors.internal");
        return;
      }
      const fileId = (uploadJson as { data?: { id?: string } }).data?.id ?? null;
      if (!fileId) {
        setErrorKey("errors.internal");
        return;
      }

      const linkRes = await apiFetch(`/api/printpress/customers/${editing.id}/attachments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({ fileId })
      });
      const linkJson = (await linkRes.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!linkRes.ok) {
        setErrorKey(linkJson?.error?.message_key ?? "errors.internal");
        return;
      }

      await loadAttachments(editing.id);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setUploadingAttachment(false);
    }
  }

  async function removeAttachment(attachmentId: string) {
    if (!tenantId) return;
    if (!editing) return;
    setRemovingAttachmentId(attachmentId);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/printpress/customers/${editing.id}/attachments/${attachmentId}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      await loadAttachments(editing.id);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setRemovingAttachmentId(null);
    }
  }

  async function save() {
    if (!tenantId) return;
    const name = fullName.trim();
    if (name.length < 2) {
      setErrorKey("errors.validation");
      return;
    }
    setSaving(true);
    setErrorKey(null);
    try {
      const payload = {
        fullName: name,
        companyName: companyName.trim() || undefined,
        customerType: customerType || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        taxNumber: taxNumber.trim() || undefined,
        notes: notes.trim() || undefined
      };

      const res = editing
        ? await apiFetch(`/api/printpress/customers/${editing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
            body: JSON.stringify(payload)
          })
        : await apiFetch("/api/printpress/customers", { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify(payload) });

      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      setModalOpen(false);
      await loadCustomers();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  }

  async function confirmAction() {
    if (!tenantId) return;
    if (!confirmTargetId) return;
    setConfirming(true);
    setErrorKey(null);
    try {
      const res =
        confirmMode === "archive"
          ? await apiFetch(`/api/printpress/customers/${confirmTargetId}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId } })
          : await apiFetch(`/api/printpress/customers/${confirmTargetId}/restore`, { method: "POST", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      setConfirmOpen(false);
      await loadCustomers();
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
            <div className="text-xl font-semibold">{t("app.printpress.customers.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.printpress.customers.subtitle")}</div>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            {t("app.printpress.customers.action.create")}
          </button>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.customers.filter.search")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder={t("app.printpress.customers.filter.search.placeholder")}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.customers.filter.status")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as "active" | "archived");
              }}
            >
              <option value="active">{t("app.printpress.customers.status.active")}</option>
              <option value="archived">{t("app.printpress.customers.status.archived")}</option>
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
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.customers.table.fullName")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.customers.table.company")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.customers.table.phone")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.customers.table.email")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.customers.table.actions")}</th>
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
                    {t("app.printpress.customers.empty")}
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr key={c.id}>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="font-medium text-gray-900">{c.fullName}</div>
                      {c.address ? <div className="mt-1 text-xs text-gray-500">{c.address}</div> : null}
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{c.companyName ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{c.phone ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{c.email ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/t/${props.tenantSlug}/printpress/customers/${c.id}/ledger`}
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                        >
                          {t("app.printpress.customers.action.ledger")}
                        </Link>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                          onClick={() => openEdit(c)}
                        >
                          {t("common.button.edit")}
                        </button>
                        {c.status === "active" ? (
                          <button
                            type="button"
                            disabled={!tenantId || confirming}
                            className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                            onClick={() => {
                              setConfirmMode("archive");
                              setConfirmTargetId(c.id);
                              setConfirmOpen(true);
                            }}
                          >
                            {t("app.printpress.customers.action.archive")}
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={!tenantId || confirming}
                            className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                            onClick={() => {
                              setConfirmMode("restore");
                              setConfirmTargetId(c.id);
                              setConfirmOpen(true);
                            }}
                          >
                            {t("app.printpress.customers.action.restore")}
                          </button>
                        )}
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
            <div className="text-xl font-semibold">{editing ? t("app.printpress.customers.modal.edit") : t("app.printpress.customers.modal.create")}</div>
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
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.customers.field.fullName")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.customers.field.companyName")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.customers.field.phone")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.customers.field.email")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.customers.field.customerType")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={customerType}
              onChange={(e) => setCustomerType(e.target.value as "" | "individual" | "business")}
            >
              <option value="">{t("common.optional")}</option>
              <option value="individual">{t("app.printpress.customers.type.individual")}</option>
              <option value="business">{t("app.printpress.customers.type.business")}</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.customers.field.address")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.customers.field.taxNumber")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.customers.field.notes")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          {editing ? (
            <div>
              <div className="flex items-center justify-between gap-4">
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.customers.attachments.title")}</label>
                <input
                  type="file"
                  disabled={!tenantId || uploadingAttachment}
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    e.target.value = "";
                    if (!f) return;
                    void uploadAttachment(f);
                  }}
                  className="block w-[260px] text-xs text-gray-700 file:mr-2 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-xs file:font-medium file:text-gray-900 hover:file:bg-gray-200 disabled:opacity-60"
                />
              </div>

              {attachmentsLoading ? (
                <div className="mt-3 text-sm text-gray-600">{t("common.loading")}</div>
              ) : attachments.length === 0 ? (
                <div className="mt-3 text-sm text-gray-600">{t("app.printpress.customers.attachments.empty")}</div>
              ) : (
                <div className="mt-3 space-y-2">
                  {attachments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2">
                      <a href={a.fileUrl} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm font-medium text-primary-700 hover:underline">
                        {a.originalName}
                      </a>
                      <button
                        type="button"
                        disabled={removingAttachmentId === a.id}
                        onClick={() => void removeAttachment(a.id)}
                        className="inline-flex h-8 items-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                      >
                        {t("common.button.remove")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

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
        title={confirmMode === "archive" ? t("app.printpress.customers.confirm.archive.title") : t("app.printpress.customers.confirm.restore.title")}
        description={confirmMode === "archive" ? t("app.printpress.customers.confirm.archive.description") : t("app.printpress.customers.confirm.restore.description")}
        confirmLabel={confirmMode === "archive" ? t("app.printpress.customers.action.archive") : t("app.printpress.customers.action.restore")}
        cancelLabel={t("common.button.cancel")}
        confirmTone={confirmMode === "archive" ? "danger" : "primary"}
        busy={confirming}
        onConfirm={confirmAction}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
