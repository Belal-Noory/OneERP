"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Modal } from "@/components/Modal";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";

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
type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

export function PharmacySuppliersClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(true);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [items, setItems] = useState<Supplier[]>([]);
  const [total, setTotal] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteId, setDeleteId] = useState<string | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    p.set("status", status);
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    return p;
  }, [q, status, page, pageSize]);

  useEffect(() => {
    let cancelled = false;
    async function loadTenantId() {
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
    void loadTenantId();
    return () => {
      cancelled = true;
    };
  }, [props.tenantSlug]);

  useEffect(() => {
    let cancelled = false;
    async function loadSuppliers() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const res = await apiFetch(`/api/pharmacy/suppliers?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as SuppliersResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const data = (json as SuppliersResponse).data;
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
    void loadSuppliers();
    return () => {
      cancelled = true;
    };
  }, [tenantId, queryParams]);

  const openCreate = useCallback(() => {
    setEditing(null);
    setName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setNotes("");
    setErrorKey(null);
    setModalOpen(true);
  }, []);

  const openEdit = useCallback((s: Supplier) => {
    setEditing(s);
    setName(s.name);
    setPhone(s.phone ?? "");
    setEmail(s.email ?? "");
    setAddress(s.address ?? "");
    setNotes(s.notes ?? "");
    setErrorKey(null);
    setModalOpen(true);
  }, []);

  const submit = useCallback(async () => {
    if (!tenantId) return;
    const payload = { name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined, address: address.trim() || undefined, notes: notes.trim() || undefined };
    if (!payload.name || payload.name.length < 2) return;

    setSaving(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(editing ? `/api/pharmacy/suppliers/${editing.id}` : "/api/pharmacy/suppliers", {
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
      setQ("");
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  }, [tenantId, name, phone, email, address, notes, editing]);

  const doDelete = useCallback(async (id: string) => {
    if (!tenantId) return;
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/pharmacy/suppliers/${id}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setDeleteId(null);
      setPage(1);
    } catch {
      setErrorKey("errors.internal");
    }
  }, [tenantId]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.pharmacy.suppliers.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.pharmacy.suppliers.subtitle")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={loadingTenant} className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60" onClick={openCreate}>
              {t("app.pharmacy.suppliers.action.create")}
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
                          const threshold = `q=${q.trim() || ""};status=${status}`;
                          await apiFetch("/api/pharmacy/reports/export-log", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                            body: JSON.stringify({ reportId: "pharmacy.suppliers.list.v1", format: "xlsx", threshold })
                          });
                        } catch {}
                        const XLSX = await import("xlsx");
                        const wb = XLSX.utils.book_new();
                        const summaryAoA = [["Pharmacy suppliers"], ["Exported at", new Date().toISOString()], ["Status", status], ["Query", q.trim() || ""]];
                        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");

                        const maxRows = 5000;
                        const exportPageSize = 500;
                        const all: Supplier[] = [];
                        for (let p = 1; p <= 100; p += 1) {
                          const params = new URLSearchParams();
                          if (q.trim()) params.set("q", q.trim());
                          params.set("status", status);
                          params.set("page", String(p));
                          params.set("pageSize", String(exportPageSize));
                          const res = await apiFetch(`/api/pharmacy/suppliers?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
                          const json = (await res.json()) as SuppliersResponse;
                          if (!res.ok) break;
                          const batch = json.data.items ?? [];
                          all.push(...batch);
                          if (batch.length < exportPageSize) break;
                          if (all.length >= maxRows) break;
                        }

                        const header = ["Name", "Phone", "Email", "Status", "Address", "Notes", "Created at"];
                        const rows = all.slice(0, maxRows).map((s) => [s.name, s.phone ?? "", s.email ?? "", s.status, s.address ?? "", s.notes ?? "", new Date(s.createdAt).toISOString()]);
                        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Suppliers");

                        const safeDate = new Date().toISOString().slice(0, 10);
                        XLSX.writeFile(wb, `pharmacy_suppliers_${safeDate}.xlsx`);
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
                  <a className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/suppliers/print?paper=a4&q=${encodeURIComponent(q.trim())}&status=${encodeURIComponent(status)}`} target="_blank" rel="noreferrer">
                    {t("app.shop.reports.export.printView")}
                  </a>
                  <a className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/suppliers/print?paper=a4&download=pdf&q=${encodeURIComponent(q.trim())}&status=${encodeURIComponent(status)}`} target="_blank" rel="noreferrer">
                    {t("app.shop.reports.export.pdfA4")}
                  </a>
                  <a className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/suppliers/print?paper=thermal80&download=pdf&q=${encodeURIComponent(q.trim())}&status=${encodeURIComponent(status)}`} target="_blank" rel="noreferrer">
                    {t("app.shop.reports.export.pdf80")}
                  </a>
                  <a className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/suppliers/print?paper=thermal58&download=pdf&q=${encodeURIComponent(q.trim())}&status=${encodeURIComponent(status)}`} target="_blank" rel="noreferrer">
                    {t("app.shop.reports.export.pdf58")}
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.suppliers.filter.search")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={q}
              onChange={(e) => {
                setPage(1);
                setQ(e.target.value);
              }}
              placeholder={t("app.pharmacy.suppliers.filter.search.placeholder")}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.suppliers.filter.status")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value as "active" | "archived");
              }}
            >
              <option value="active">{t("app.pharmacy.suppliers.status.active")}</option>
              <option value="archived">{t("app.pharmacy.suppliers.status.archived")}</option>
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
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.suppliers.table.name")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.suppliers.table.phone")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.suppliers.table.email")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.suppliers.table.status")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.pharmacy.suppliers.table.actions")}</th>
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
                    {t("app.pharmacy.suppliers.empty")}
                  </td>
                </tr>
              ) : (
                items.map((s) => (
                  <tr key={s.id}>
                    <td className="border-b border-gray-100 px-4 py-3 font-medium text-gray-900">{s.name}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{s.phone ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{s.email ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{t(`app.pharmacy.suppliers.status.${s.status}`)}</td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/suppliers/${s.id}/ledger`}>
                          {t("app.pharmacy.suppliers.action.ledger")}
                        </Link>
                        <button type="button" className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => openEdit(s)}>
                          {t("app.pharmacy.suppliers.action.edit")}
                        </button>
                        <button type="button" className="inline-flex h-9 items-center rounded-xl border border-red-200 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50" onClick={() => setDeleteId(s.id)}>
                          {t("app.pharmacy.suppliers.action.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 p-4">
          <div className="text-sm text-gray-700">
            {t("app.pharmacy.suppliers.pagination.total")}: {total} · {t("app.pharmacy.suppliers.pagination.page")} {page} / {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1} className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t("app.pharmacy.suppliers.pagination.prev")}
            </button>
            <button type="button" disabled={page >= totalPages} className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              {t("app.pharmacy.suppliers.pagination.next")}
            </button>
          </div>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{editing ? t("app.pharmacy.suppliers.modal.editTitle") : t("app.pharmacy.suppliers.modal.createTitle")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.pharmacy.suppliers.modal.subtitle")}</div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.pharmacy.suppliers.field.name")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-900">{t("app.pharmacy.suppliers.field.phone")}</label>
                <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900">{t("app.pharmacy.suppliers.field.email")}</label>
                <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.pharmacy.suppliers.field.address")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.pharmacy.suppliers.field.notes")}</label>
              <textarea className="mt-1 min-h-[90px] w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button type="button" disabled={saving} className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setModalOpen(false)}>
              {t("common.button.cancel")}
            </button>
            <button type="button" disabled={saving || name.trim().length < 2} className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60" onClick={submit}>
              {saving ? t("app.pharmacy.suppliers.action.working") : t("common.button.submit")}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteId}
        onCancel={() => setDeleteId(null)}
        title={t("app.pharmacy.suppliers.delete.title")}
        description={t("app.pharmacy.suppliers.delete.desc")}
        confirmLabel={t("app.pharmacy.suppliers.action.delete")}
        onConfirm={() => {
          if (deleteId) void doDelete(deleteId);
        }}
      />
    </div>
  );
}
