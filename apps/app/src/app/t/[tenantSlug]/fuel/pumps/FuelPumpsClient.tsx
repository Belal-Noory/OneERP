"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type Tank = {
  id: string;
  name: string;
  fuelType: string;
};

type Nozzle = {
  id: string;
  name: string;
  tankId: string;
  tankName: string;
  fuelType: string;
  currentTotalizerReading: string;
  status: "active" | "maintenance" | "inactive";
};

type Pump = {
  id: string;
  name: string;
  status: "active" | "maintenance" | "inactive";
  nozzles: Nozzle[];
};

export function FuelPumpsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [pumps, setPumps] = useState<Pump[]>([]);
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  // Pump Modal
  const [pumpModalOpen, setPumpModalOpen] = useState(false);
  const [pumpSaving, setPumpSaving] = useState(false);
  const [editingPumpId, setEditingPumpId] = useState<string | null>(null);
  const [pumpName, setPumpName] = useState("");
  const [pumpStatus, setPumpStatus] = useState<Pump["status"]>("active");

  // Nozzle Modal
  const [nozzleModalOpen, setNozzleModalOpen] = useState(false);
  const [nozzleSaving, setNozzleSaving] = useState(false);
  const [editingNozzleId, setEditingNozzleId] = useState<string | null>(null);
  const [nozzlePumpId, setNozzlePumpId] = useState("");
  const [nozzleName, setNozzleName] = useState("");
  const [nozzleTankId, setNozzleTankId] = useState("");
  const [nozzleMeter, setNozzleMeter] = useState("0");
  const [nozzleStatus, setNozzleStatus] = useState<Nozzle["status"]>("active");

  useEffect(() => {
    let cancelled = false;
    async function loadTenant() {
      try {
        const meRes = await apiFetch("/api/me", { cache: "no-store" });
        if (!meRes.ok) {
          setErrorKey("errors.unauthenticated");
          return;
        }
        const me = (await meRes.json()) as MeResponse;
        const membership = me.data?.memberships?.find((m) => m.tenantSlug === props.tenantSlug) ?? null;
        if (!membership) {
          setErrorKey("errors.tenantAccessDenied");
          return;
        }
        if (!cancelled) {
          setTenantId(membership.tenantId);
          setCanManage(true);
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
    setLoading(true);
    try {
      const [pumpsRes, tanksRes] = await Promise.all([
        apiFetch("/api/fuel/pumps", { headers: { "X-Tenant-Id": tenantId }, cache: "no-store" }),
        apiFetch("/api/fuel/tanks", { headers: { "X-Tenant-Id": tenantId }, cache: "no-store" })
      ]);

      if (!pumpsRes.ok || !tanksRes.ok) {
        const bad = !pumpsRes.ok ? pumpsRes : tanksRes;
        try {
          const json = (await bad.json()) as { error?: { message_key?: string } };
          setErrorKey(json.error?.message_key ?? "errors.internal");
        } catch {
          setErrorKey("errors.internal");
        }
        return;
      }

      setPumps((await pumpsRes.json()).data);
      setTanks((await tanksRes.json()).data);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  // --- Pump Actions ---

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

  async function savePump() {
    setPumpSaving(true);
    setErrorKey(null);
    try {
      const url = editingPumpId ? `/api/fuel/pumps/${editingPumpId}` : "/api/fuel/pumps";
      const method = editingPumpId ? "PATCH" : "POST";
      const res = await apiFetch(url, {
        method,
        headers: { "X-Tenant-Id": tenantId!, "Content-Type": "application/json" },
        body: JSON.stringify({ name: pumpName, status: pumpStatus })
      });

      if (!res.ok) {
        const json = await res.json();
        setErrorKey(json.error?.message_key || "errors.internal");
        return;
      }

      setPumpModalOpen(false);
      void loadData();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setPumpSaving(false);
    }
  }

  async function removePump(id: string) {
    if (!window.confirm("Remove this pump and all its nozzles?")) return;
    try {
      const res = await apiFetch(`/api/fuel/pumps/${id}`, {
        method: "DELETE",
        headers: { "X-Tenant-Id": tenantId! }
      });
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

  // --- Nozzle Actions ---

  function openNewNozzle(pumpId: string) {
    setNozzlePumpId(pumpId);
    setEditingNozzleId(null);
    setNozzleName("");
    setNozzleTankId(tanks[0]?.id || "");
    setNozzleMeter("0");
    setNozzleStatus("active");
    setErrorKey(null);
    setNozzleModalOpen(true);
  }

  function openEditNozzle(pumpId: string, nozzle: Nozzle) {
    setNozzlePumpId(pumpId);
    setEditingNozzleId(nozzle.id);
    setNozzleName(nozzle.name);
    setNozzleTankId(nozzle.tankId);
    setNozzleMeter(nozzle.currentTotalizerReading);
    setNozzleStatus(nozzle.status);
    setErrorKey(null);
    setNozzleModalOpen(true);
  }

  async function saveNozzle() {
    setNozzleSaving(true);
    setErrorKey(null);
    try {
      const url = editingNozzleId ? `/api/fuel/nozzles/${editingNozzleId}` : "/api/fuel/nozzles";
      const method = editingNozzleId ? "PATCH" : "POST";
      const res = await apiFetch(url, {
        method,
        headers: { "X-Tenant-Id": tenantId!, "Content-Type": "application/json" },
        body: JSON.stringify({
          pumpId: nozzlePumpId,
          name: nozzleName,
          tankId: nozzleTankId,
          currentTotalizerReading: Number(nozzleMeter),
          status: nozzleStatus
        })
      });

      if (!res.ok) {
        const json = await res.json();
        setErrorKey(json.error?.message_key || "errors.internal");
        return;
      }

      setNozzleModalOpen(false);
      void loadData();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setNozzleSaving(false);
    }
  }

  async function removeNozzle(id: string) {
    if (!window.confirm("Remove this nozzle?")) return;
    try {
      const res = await apiFetch(`/api/fuel/nozzles/${id}`, {
        method: "DELETE",
        headers: { "X-Tenant-Id": tenantId! }
      });
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
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-lg font-semibold">{t("app.fuel.pumps.title")}</div>
          <div className="text-sm text-gray-500">{t("app.fuel.pumps.subtitle")}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setExportMenuOpen((v) => !v)}
              disabled={exportingXlsx || (pumps.length === 0 && tanks.length === 0)}
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
                      const XLSX = await import("xlsx");
                      const wb = XLSX.utils.book_new();
                      const summaryAoA = [
                        ["Fuel pumps"],
                        ["Exported at", new Date().toISOString()],
                        ["Pumps", String(pumps.length)]
                      ];
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");

                      const header = ["Pump", "Status", "Nozzles"];
                      const rows = pumps.map((p) => [p.name, p.status, String(p.nozzles.length)]);
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Pumps");
                      const safeDate = new Date().toISOString().slice(0, 10);
                      XLSX.writeFile(wb, `fuel_pumps_${safeDate}.xlsx`);
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
                  {t("app.shop.reports.export.excel")} (Pumps)
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  onClick={async () => {
                    if (!tenantId) return;
                    setExportingXlsx(true);
                    setErrorKey(null);
                    try {
                      const flat = pumps.flatMap((p) =>
                        p.nozzles.map((n) => ({
                          pumpName: p.name,
                          nozzleName: n.name,
                          tankName: n.tankName,
                          fuelType: n.fuelType,
                          totalizer: n.currentTotalizerReading,
                          status: n.status
                        }))
                      );
                      const XLSX = await import("xlsx");
                      const wb = XLSX.utils.book_new();
                      const summaryAoA = [
                        ["Fuel nozzles"],
                        ["Exported at", new Date().toISOString()],
                        ["Nozzles", String(flat.length)]
                      ];
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");

                      const header = ["Pump", "Nozzle", "Tank", "Fuel type", "Totalizer", "Status"];
                      const rows = flat.map((r) => [r.pumpName, r.nozzleName, r.tankName, r.fuelType, r.totalizer, r.status]);
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Nozzles");
                      const safeDate = new Date().toISOString().slice(0, 10);
                      XLSX.writeFile(wb, `fuel_nozzles_${safeDate}.xlsx`);
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
                  {t("app.shop.reports.export.excel")} (Nozzles)
                </button>
              </div>
            ) : null}
          </div>
          {canManage && (
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
              onClick={openNewPump}
            >
              {t("app.fuel.pumps.action.newPump")}
            </button>
          )}
        </div>
      </div>

      {errorKey && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{t(errorKey)}</div>}

      {loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-gray-500 shadow-card">{t("common.loading")}</div>
      ) : pumps.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-gray-500 shadow-card">{t("app.fuel.pumps.empty")}</div>
      ) : (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.pumps.table.name")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("common.status")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Nozzles</th>
                  {canManage ? <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("common.button.edit")}</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {pumps.map((pump) => (
                  <tr key={pump.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{pump.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{pump.status}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{pump.nozzles.length}</td>
                    {canManage ? (
                      <td className="px-4 py-3 text-right text-sm">
                        <div className="inline-flex items-center gap-1">
                          <button type="button" className="rounded-lg px-2 py-1 text-sm font-medium text-primary-700 hover:bg-primary-50" onClick={() => openNewNozzle(pump.id)}>
                            + {t("app.fuel.pumps.action.newNozzle")}
                          </button>
                          <button type="button" className="rounded-lg px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100" onClick={() => openEditPump(pump)}>
                            {t("common.button.edit")}
                          </button>
                          <button type="button" className="rounded-lg px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50" onClick={() => removePump(pump.id)}>
                            {t("common.button.remove")}
                          </button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Pump</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.nozzles.field.name")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.nozzles.field.tankId")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.tanks.table.fuelType")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.nozzles.field.totalizer")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("common.status")}</th>
                  {canManage ? <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("common.button.edit")}</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {pumps.flatMap((pump) =>
                  pump.nozzles.map((nozzle) => (
                    <tr key={nozzle.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{pump.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{nozzle.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{nozzle.tankName}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{nozzle.fuelType}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums font-mono text-gray-700">{nozzle.currentTotalizerReading}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{nozzle.status}</td>
                      {canManage ? (
                        <td className="px-4 py-3 text-right text-sm">
                          <div className="inline-flex items-center gap-1">
                            <button type="button" className="rounded-lg px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100" onClick={() => openEditNozzle(pump.id, nozzle)}>
                              {t("common.button.edit")}
                            </button>
                            <button type="button" className="rounded-lg px-2 py-1 text-sm font-medium text-red-700 hover:bg-red-50" onClick={() => removeNozzle(nozzle.id)}>
                              {t("common.button.remove")}
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pump Modal */}
      <Modal open={pumpModalOpen} onClose={() => setPumpModalOpen(false)}>
        <div className="w-full max-w-md p-6 md:p-8">
          <div className="text-xl font-semibold">
            {editingPumpId ? t("app.fuel.pumps.modal.title.edit") : t("app.fuel.pumps.modal.title.new")}
          </div>
          <div className="mt-1 text-sm text-gray-500">{t("app.fuel.pumps.modal.subtitle")}</div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider">{t("app.fuel.pumps.field.name")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={pumpName} onChange={(e) => setPumpName(e.target.value)} placeholder="e.g. Island 1" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider">{t("app.fuel.pumps.field.status")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={pumpStatus} onChange={(e) => setPumpStatus(e.target.value as Pump["status"])}>
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <button type="button" className="h-10 rounded-xl px-4 text-sm font-medium text-gray-700 hover:bg-gray-100" onClick={() => setPumpModalOpen(false)}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              disabled={pumpSaving || !pumpName}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-6 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              onClick={savePump}
            >
              {pumpSaving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Nozzle Modal */}
      <Modal open={nozzleModalOpen} onClose={() => setNozzleModalOpen(false)}>
        <div className="w-full max-w-md p-6 md:p-8">
          <div className="text-xl font-semibold">
            {editingNozzleId ? t("app.fuel.nozzles.modal.title.edit") : t("app.fuel.nozzles.modal.title.new")}
          </div>
          <div className="mt-1 text-sm text-gray-500">{t("app.fuel.nozzles.modal.subtitle")}</div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider">{t("app.fuel.nozzles.field.name")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={nozzleName} onChange={(e) => setNozzleName(e.target.value)} placeholder="e.g. Nozzle A" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider">{t("app.fuel.nozzles.field.tankId")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={nozzleTankId} onChange={(e) => setNozzleTankId(e.target.value)}>
                <option value="">Select Tank</option>
                {tanks.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} ({t.fuelType})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider">{t("app.fuel.nozzles.field.totalizer")}</label>
              <input type="number" step="0.01" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm tabular font-mono" value={nozzleMeter} onChange={(e) => setNozzleMeter(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wider">{t("app.fuel.nozzles.field.status")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={nozzleStatus} onChange={(e) => setNozzleStatus(e.target.value as Nozzle["status"])}>
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <button type="button" className="h-10 rounded-xl px-4 text-sm font-medium text-gray-700 hover:bg-gray-100" onClick={() => setNozzleModalOpen(false)}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              disabled={nozzleSaving || !nozzleName || !nozzleTankId}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-6 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              onClick={saveNozzle}
            >
              {nozzleSaving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
