"use client";

import { useEffect, useState } from "react";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";
import { apiFetch } from "@/lib/auth-fetch";

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

type Nozzle = {
  id: string;
  name: string;
  tankId: string;
  tankName: string;
  fuelType: string;
  currentTotalizerReading: string;
  status: string;
};

type Pump = {
  id: string;
  name: string;
  status: string;
  nozzles: Nozzle[];
};

export function FuelPumpsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [pumps, setPumps] = useState<Pump[]>([]);
  const [activeTanks, setActiveTanks] = useState<{ id: string; name: string; fuelType: string }[]>([]);

  const [pumpModalOpen, setPumpModalOpen] = useState(false);
  const [nozzleModalOpen, setNozzleModalOpen] = useState(false);

  const [editingPumpId, setEditingPumpId] = useState<string | null>(null);
  const [editingNozzleId, setEditingNozzleId] = useState<string | null>(null);
  const [targetPumpIdForNozzle, setTargetPumpIdForNozzle] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);

  // Pump form
  const [pumpName, setPumpName] = useState("");
  const [pumpStatus, setPumpStatus] = useState("active");

  // Nozzle form
  const [nozzleName, setNozzleName] = useState("");
  const [nozzleTankId, setNozzleTankId] = useState("");
  const [nozzleTotalizer, setNozzleTotalizer] = useState("0");
  const [nozzleStatus, setNozzleStatus] = useState("active");

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
          setCanManage(membership.role.permissions.includes("fuel.pumps.manage"));
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

  async function loadData() {
    if (!tenantId) return;
    try {
      const [pumpsRes, tanksRes] = await Promise.all([
        apiFetch("/api/fuel/pumps", { headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/fuel/tanks", { headers: { "X-Tenant-Id": tenantId } })
      ]);
      if (pumpsRes.ok && tanksRes.ok) {
        const pJson = await pumpsRes.json();
        const tJson = await tanksRes.json();
        setPumps(pJson.data);
        setActiveTanks(tJson.data.filter((t: { status: string }) => t.status === "active"));
      } else {
        setErrorKey("errors.internal");
      }
    } catch {
      setErrorKey("errors.internal");
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  function openNewPump() {
    setEditingPumpId(null);
    setPumpName("");
    setPumpStatus("active");
    setErrorKey(null);
    setPumpModalOpen(true);
  }

  function openEditPump(pump: Pump) {
    setEditingPumpId(pump.id);
    setPumpName(pump.name);
    setPumpStatus(pump.status);
    setErrorKey(null);
    setPumpModalOpen(true);
  }

  function openNewNozzle(pumpId: string) {
    setTargetPumpIdForNozzle(pumpId);
    setEditingNozzleId(null);
    setNozzleName("");
    setNozzleTankId(activeTanks[0]?.id || "");
    setNozzleTotalizer("0");
    setNozzleStatus("active");
    setErrorKey(null);
    setNozzleModalOpen(true);
  }

  function openEditNozzle(nozzle: Nozzle, pumpId: string) {
    setTargetPumpIdForNozzle(pumpId);
    setEditingNozzleId(nozzle.id);
    setNozzleName(nozzle.name);
    setNozzleTankId(nozzle.tankId);
    setNozzleTotalizer(nozzle.currentTotalizerReading);
    setNozzleStatus(nozzle.status);
    setErrorKey(null);
    setNozzleModalOpen(true);
  }

  async function savePump() {
    setSaving(true);
    setErrorKey(null);
    try {
      const url = editingPumpId ? `/api/fuel/pumps/${editingPumpId}` : `/api/fuel/pumps`;
      const method = editingPumpId ? "PATCH" : "POST";
      const res = await apiFetch(url, {
        method,
        headers: { "X-Tenant-Id": tenantId! },
        body: JSON.stringify({ name: pumpName, status: pumpStatus })
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorKey(json.error?.message_key || "errors.internal");
        return;
      }
      setPumpModalOpen(false);
      void loadData();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  }

  async function deletePump(id: string) {
    if (!window.confirm("Delete this pump? All associated nozzles will be deleted.")) return;
    try {
      const res = await apiFetch(`/api/fuel/pumps/${id}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId! } });
      if (!res.ok) {
        const json = await res.json();
        alert(t(json.error?.message_key || "errors.internal"));
        return;
      }
      void loadData();
    } catch {
      alert(t("errors.internal"));
    }
  }

  async function saveNozzle() {
    setSaving(true);
    setErrorKey(null);
    try {
      const url = editingNozzleId ? `/api/fuel/nozzles/${editingNozzleId}` : `/api/fuel/nozzles`;
      const method = editingNozzleId ? "PATCH" : "POST";
      const res = await apiFetch(url, {
        method,
        headers: { "X-Tenant-Id": tenantId! },
        body: JSON.stringify({
          pumpId: targetPumpIdForNozzle,
          tankId: nozzleTankId,
          name: nozzleName,
          currentTotalizerReading: Number(nozzleTotalizer),
          status: nozzleStatus
        })
      });
      const json = await res.json();
      if (!res.ok) {
        setErrorKey(json.error?.message_key || "errors.internal");
        return;
      }
      setNozzleModalOpen(false);
      void loadData();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  }

  async function deleteNozzle(id: string) {
    if (!window.confirm("Delete this nozzle?")) return;
    try {
      const res = await apiFetch(`/api/fuel/nozzles/${id}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId! } });
      if (!res.ok) {
        const json = await res.json();
        alert(t(json.error?.message_key || "errors.internal"));
        return;
      }
      void loadData();
    } catch {
      alert(t("errors.internal"));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">{t("app.fuel.pumps.title")}</div>
          <div className="text-sm text-gray-500">{t("app.fuel.pumps.subtitle")}</div>
        </div>
        {canManage && (
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
            onClick={openNewPump}
          >
            <PlusIcon className="h-4 w-4" />
            {t("app.fuel.pumps.action.newPump")}
          </button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {pumps.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">
            {t("app.fuel.pumps.empty")}
          </div>
        ) : (
          pumps.map((pump) => (
            <div key={pump.id} className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-gray-100 p-4">
                <div className="flex items-center gap-3">
                  <div className="text-base font-semibold text-gray-900">{pump.name}</div>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${pump.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}`}>
                    {pump.status}
                  </span>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <button type="button" className="p-1.5 text-gray-400 hover:text-gray-900" onClick={() => openEditPump(pump)}>
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button type="button" className="p-1.5 text-gray-400 hover:text-red-600" onClick={() => deletePump(pump.id)}>
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
              <div className="flex-1 p-4">
                <div className="space-y-3">
                  {pump.nozzles.length === 0 ? (
                    <div className="text-sm text-gray-500">{t("app.fuel.pumps.nozzle.empty")}</div>
                  ) : (
                    pump.nozzles.map((nozzle) => (
                      <div key={nozzle.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50 p-3">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{nozzle.name}</div>
                          <div className="text-xs text-gray-500">{nozzle.fuelType} • Tank: {nozzle.tankName}</div>
                          <div className="mt-1 text-xs font-medium text-gray-600 font-mono">Total: {nozzle.currentTotalizerReading}</div>
                        </div>
                        {canManage && (
                          <div className="flex items-center gap-1">
                            <button type="button" className="p-1.5 text-gray-400 hover:text-gray-900" onClick={() => openEditNozzle(nozzle, pump.id)}>
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" className="p-1.5 text-gray-400 hover:text-red-600" onClick={() => deleteNozzle(nozzle.id)}>
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
              {canManage && (
                <div className="border-t border-gray-100 p-4">
                  <button
                    type="button"
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gray-50 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
                    onClick={() => openNewNozzle(pump.id)}
                  >
                    <PlusIcon className="h-4 w-4" />
                    {t("app.fuel.pumps.action.newNozzle")}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pump Modal */}
      <Modal open={pumpModalOpen} onClose={() => setPumpModalOpen(false)}>
        <div className="w-full max-w-md p-6">
          <div className="text-xl font-semibold">{editingPumpId ? t("app.fuel.pumps.modal.title.edit") : t("app.fuel.pumps.modal.title.new")}</div>
          <div className="mt-1 text-sm text-gray-500">{t("app.fuel.pumps.modal.subtitle")}</div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.pumps.field.name")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={pumpName} onChange={(e) => setPumpName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.pumps.field.status")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={pumpStatus} onChange={(e) => setPumpStatus(e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {errorKey && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{t(errorKey)}</div>}

          <div className="mt-8 flex justify-end gap-3">
            <button type="button" className="h-10 rounded-xl px-4 text-sm font-medium text-gray-700 hover:bg-gray-100" onClick={() => setPumpModalOpen(false)}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              disabled={saving || !pumpName.trim()}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              onClick={savePump}
            >
              {saving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Nozzle Modal */}
      <Modal open={nozzleModalOpen} onClose={() => setNozzleModalOpen(false)}>
        <div className="w-full max-w-md p-6">
          <div className="text-xl font-semibold">{editingNozzleId ? t("app.fuel.nozzles.modal.title.edit") : t("app.fuel.nozzles.modal.title.new")}</div>
          <div className="mt-1 text-sm text-gray-500">{t("app.fuel.nozzles.modal.subtitle")}</div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.nozzles.field.name")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={nozzleName} onChange={(e) => setNozzleName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.nozzles.field.tankId")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={nozzleTankId} onChange={(e) => setNozzleTankId(e.target.value)}>
                <option value="">{t("desktop.select")}</option>
                {activeTanks.map((tank) => (
                  <option key={tank.id} value={tank.id}>
                    {tank.name} ({tank.fuelType})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.nozzles.field.totalizer")}</label>
              <input type="number" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm tabular font-mono" value={nozzleTotalizer} onChange={(e) => setNozzleTotalizer(e.target.value)} disabled={!!editingNozzleId} />
              {!!editingNozzleId && <div className="mt-1 text-xs text-gray-500">Totalizer reading cannot be modified directly after creation.</div>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.nozzles.field.status")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={nozzleStatus} onChange={(e) => setNozzleStatus(e.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {errorKey && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{t(errorKey)}</div>}

          <div className="mt-8 flex justify-end gap-3">
            <button type="button" className="h-10 rounded-xl px-4 text-sm font-medium text-gray-700 hover:bg-gray-100" onClick={() => setNozzleModalOpen(false)}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              disabled={saving || !nozzleName.trim() || !nozzleTankId}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              onClick={saveNozzle}
            >
              {saving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
