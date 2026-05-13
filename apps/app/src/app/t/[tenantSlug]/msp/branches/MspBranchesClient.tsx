"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };
type Branch = { id: string; name: string; code: string | null; address: string | null; isActive: boolean; updatedAt: string };
type BranchListResponse = { data: Branch[] };

export function MspBranchesClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [items, setItems] = useState<Branch[]>([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter((b) => {
      if (status === "active" && !b.isActive) return false;
      if (status === "inactive" && b.isActive) return false;
      if (!query) return true;
      return (b.name ?? "").toLowerCase().includes(query) || (b.code ?? "").toLowerCase().includes(query) || (b.address ?? "").toLowerCase().includes(query);
    });
  }, [items, q, status]);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; code: string; address: string; isActive: boolean }>({ name: "", code: "", address: "", isActive: true });

  const loadTenant = useCallback(async () => {
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
      setTenantId(membership.tenantId);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [props.tenantSlug]);

  const loadBranches = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const res = await apiFetch("/api/msp/branches", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as BranchListResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      setItems((json as BranchListResponse).data ?? []);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  useEffect(() => {
    void loadBranches();
  }, [loadBranches]);

  const openCreate = () => {
    setEditId(null);
    setForm({ name: "", code: "", address: "", isActive: true });
    setModalOpen(true);
  };

  const openEdit = (b: Branch) => {
    setEditId(b.id);
    setForm({ name: b.name ?? "", code: b.code ?? "", address: b.address ?? "", isActive: !!b.isActive });
    setModalOpen(true);
  };

  const save = async () => {
    if (!tenantId) return;
    setSaving(true);
    setErrorKey(null);
    try {
      const payload = { name: form.name, code: form.code, address: form.address, isActive: form.isActive };
      const res = await apiFetch(editId ? `/api/msp/branches/${encodeURIComponent(editId)}` : "/api/msp/branches", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setModalOpen(false);
      await loadBranches();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">{t("common.loading")}</div>;
  }
  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold">{t("app.msp.branches.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.msp.branches.subtitle")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => void loadBranches()}
            >
              {t("common.button.refresh")}
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800" onClick={openCreate}>
              {t("common.button.create")}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-5">
          <div className="md:col-span-3">
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.branches.filter.search")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("app.msp.branches.filter.search.placeholder")} />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.branches.filter.status")}</label>
            <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value as "all" | "active" | "inactive")}>
              <option value="all">{t("common.filter.all")}</option>
              <option value="active">{t("common.status.active")}</option>
              <option value="inactive">{t("common.status.inactive")}</option>
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">{t("app.msp.branches.table.name")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.branches.table.code")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.branches.table.address")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.branches.table.status")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.branches.table.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                  {t("app.msp.branches.empty")}
                </td>
              </tr>
            ) : (
              filtered.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">{b.name}</td>
                  <td className="px-4 py-3 text-gray-700">{b.code ?? ""}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="max-w-[420px] truncate">{b.address ?? ""}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{b.isActive ? t("common.status.active") : t("common.status.inactive")}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => openEdit(b)}>
                      {t("common.button.edit")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => (!saving ? setModalOpen(false) : null)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{editId ? t("app.msp.branches.modal.editTitle") : t("app.msp.branches.modal.createTitle")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.msp.branches.modal.subtitle")}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.branches.field.name")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} disabled={saving} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.branches.field.code")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} disabled={saving} />
            </div>
            <div className="flex items-end gap-2">
              <input id="msp_branch_active" type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} disabled={saving} />
              <label htmlFor="msp_branch_active" className="text-sm text-gray-700">
                {t("app.msp.branches.field.active")}
              </label>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.branches.field.address")}</label>
              <textarea className="mt-1 min-h-[90px] w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} disabled={saving} />
            </div>
          </div>

          {errorKey ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{t(errorKey)}</div> : null}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setModalOpen(false)} disabled={saving}>
              {t("common.button.cancel")}
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60" onClick={() => void save()} disabled={saving}>
              {saving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

