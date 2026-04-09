"use client";

import { useEffect, useState } from "react";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";
import { apiFetch } from "@/lib/auth-fetch";
import Link from "next/link";

const PlusIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

const PencilIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.89 1.12l-3.122.78 1.185-3.122a4.5 4.5 0 011.12-1.89l12.737-12.737z" />
  </svg>
);

const TrashIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
  </svg>
);

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string; role: { permissions: string[] } }[] } };

type Tank = {
  id: string;
  name: string;
  fuelType: string;
  capacity: string;
  currentVolume: string;
  status: string;
};

export function FuelTanksClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [tanks, setTanks] = useState<Tank[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [fuelType, setFuelType] = useState("Regular");
  const [capacity, setCapacity] = useState("");
  const [status, setStatus] = useState("active");

  useEffect(() => {
    let cancelled = false;
    async function loadTenant() {
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
        if (!cancelled) {
          setTenantId(membership.tenantId);
          setCanManage(membership.role.permissions.includes("fuel.tanks.manage"));
        }
      } catch {
        setErrorKey("errors.internal");
      }
    }
    void loadTenant();
    return () => {
      cancelled = true;
    };
  }, [props.tenantSlug]);

  async function loadTanks() {
    if (!tenantId) return;
    try {
      const res = await apiFetch("/api/fuel/tanks", { headers: { "X-Tenant-Id": tenantId } });
      const json = await res.json();
      if (!res.ok) {
        setErrorKey(json.error?.message_key || "errors.internal");
        return;
      }
      setTanks(json.data);
    } catch {
      setErrorKey("errors.internal");
    }
  }

  useEffect(() => {
    void loadTanks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  function openNew() {
    setEditingId(null);
    setName("");
    setFuelType("Regular");
    setCapacity("");
    setStatus("active");
    setErrorKey(null);
    setModalOpen(true);
  }

  function openEdit(tank: Tank) {
    setEditingId(tank.id);
    setName(tank.name);
    setFuelType(tank.fuelType);
    setCapacity(tank.capacity);
    setStatus(tank.status);
    setErrorKey(null);
    setModalOpen(true);
  }

  async function save() {
    setSaving(true);
    setErrorKey(null);
    try {
      const url = editingId ? `/api/fuel/tanks/${editingId}` : `/api/fuel/tanks`;
      const method = editingId ? "PATCH" : "POST";
      const res = await apiFetch(url, {
        method,
        headers: { "X-Tenant-Id": tenantId! },
        body: JSON.stringify({ name, fuelType, capacity: Number(capacity), status })
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorKey(json.error?.message_key || "errors.internal");
        return;
      }
      setModalOpen(false);
      void loadTanks();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTank(id: string) {
    if (!window.confirm("Delete this tank?")) return;
    try {
      const res = await apiFetch(`/api/fuel/tanks/${id}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId! } });
      const json = await res.json();
      if (!res.ok) {
        alert(t(json.error?.message_key || "errors.internal"));
        return;
      }
      void loadTanks();
    } catch {
      alert(t("errors.internal"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">{t("app.fuel.tanks.title")}</div>
          <div className="text-sm text-gray-500">{t("app.fuel.tanks.subtitle")}</div>
        </div>
        {canManage && (
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
            onClick={openNew}
          >
            <PlusIcon className="h-4 w-4" />
            {t("app.fuel.tanks.action.new")}
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 font-medium">{t("app.fuel.tanks.table.name")}</th>
                <th className="px-4 py-3 font-medium">{t("app.fuel.tanks.table.fuelType")}</th>
                <th className="px-4 py-3 font-medium">{t("app.fuel.tanks.table.capacity")}</th>
                <th className="px-4 py-3 font-medium">{t("app.fuel.tanks.table.currentVolume")}</th>
                <th className="px-4 py-3 font-medium">{t("app.fuel.tanks.table.status")}</th>
                <th className="w-28 px-4 py-3 text-right font-medium">{t("app.fuel.tanks.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-900">
              {tanks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    {t("app.fuel.tanks.empty")}
                  </td>
                </tr>
              ) : (
                tanks.map((tank) => (
                  <tr key={tank.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{tank.name}</td>
                    <td className="px-4 py-3">{tank.fuelType}</td>
                    <td className="px-4 py-3">{tank.capacity}</td>
                    <td className="px-4 py-3">{tank.currentVolume}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tank.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                        {tank.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/t/${props.tenantSlug}/fuel/tanks/${tank.id}`} className="inline-flex h-8 items-center rounded-lg border border-gray-200 px-2 text-xs font-medium text-gray-700 hover:bg-gray-50">
                          {t("common.button.open")}
                        </Link>
                        {canManage && (
                          <>
                            <button type="button" className="p-1.5 text-gray-400 hover:text-gray-900" onClick={() => openEdit(tank)}>
                              <PencilIcon className="h-4 w-4" />
                            </button>
                            <button type="button" className="p-1.5 text-gray-400 hover:text-red-600" onClick={() => deleteTank(tank.id)}>
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="w-full max-w-md p-6">
          <div className="text-xl font-semibold">{editingId ? t("app.fuel.tanks.modal.title.edit") : t("app.fuel.tanks.modal.title.new")}</div>
          <div className="mt-1 text-sm text-gray-500">{t("app.fuel.tanks.modal.subtitle")}</div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.tanks.field.name")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.tanks.field.fuelType")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={fuelType} onChange={(e) => setFuelType(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.tanks.field.capacity")}</label>
              <input type="number" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm tabular" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.tanks.field.status")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {errorKey && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{t(errorKey)}</div>}

          <div className="mt-8 flex justify-end gap-3">
            <button type="button" className="h-10 rounded-xl px-4 text-sm font-medium text-gray-700 hover:bg-gray-100" onClick={() => setModalOpen(false)}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              disabled={saving || !name.trim() || !fuelType.trim() || !capacity}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              onClick={save}
            >
              {saving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
