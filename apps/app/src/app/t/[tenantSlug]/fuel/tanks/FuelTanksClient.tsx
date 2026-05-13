"use client";

import { useCallback, useEffect, useState } from "react";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";
import { apiFetch } from "@/lib/auth-fetch";
import Link from "next/link";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

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
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [newTank, setNewTank] = useState({ name: "", fuelType: "", capacity: "" });
  const [creating, setCreating] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const loadTanks = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const res = await apiFetch("/api/fuel/tanks", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      if (!res.ok) {
        try {
          const json = (await res.json()) as { error?: { message_key?: string } };
          setErrorKey(json.error?.message_key ?? "errors.internal");
        } catch {
          setErrorKey("errors.internal");
        }
        return;
      }
      const data = (await res.json()) as { data: Tank[] };
      setTanks(data.data);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

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
    void loadTanks();
  }, [loadTanks]);

  const handleCreateTank = async () => {
    if (!newTank.name || !newTank.fuelType || !newTank.capacity) return;

    setCreating(true);
    setErrorKey(null);
    try {
      const res = await apiFetch("/api/fuel/tanks", {
        method: "POST",
        headers: { "X-Tenant-Id": tenantId!, "Content-Type": "application/json" },
        body: JSON.stringify(newTank),
      });

      if (!res.ok) {
        const json = (await res.json()) as { error?: { message_key?: string } };
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }

      setModalOpen(false);
      setNewTank({ name: "", fuelType: "", capacity: "" });
      await loadTanks();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-lg font-semibold">{t("app.fuel.tanks.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.fuel.tanks.subtitle")}</div>
        <div className="mt-6 text-gray-500">{t("common.loading")}</div>
      </div>
    );
  }

  if (errorKey) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-lg font-semibold">{t("app.fuel.tanks.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.fuel.tanks.subtitle")}</div>
        <div className="mt-6 text-red-600">{t(errorKey)}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-lg font-semibold">{t("app.fuel.tanks.title")}</div>
          <div className="mt-2 text-gray-700">{t("app.fuel.tanks.subtitle")}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setExportMenuOpen((v) => !v)}
              disabled={exportingXlsx || tanks.length === 0}
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
                        ["Fuel tanks"],
                        ["Exported at", new Date().toISOString()],
                        ["Rows", String(tanks.length)]
                      ];
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");

                      const header = [
                        t("app.fuel.tanks.table.name"),
                        t("app.fuel.tanks.table.fuelType"),
                        t("app.fuel.tanks.table.currentVolume"),
                        t("app.fuel.tanks.table.capacity"),
                        t("common.status")
                      ];
                      const rows = tanks.map((tank) => [tank.name, tank.fuelType, tank.currentVolume, tank.capacity, tank.status]);
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Tanks");
                      const safeDate = new Date().toISOString().slice(0, 10);
                      XLSX.writeFile(wb, `fuel_tanks_${safeDate}.xlsx`);
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
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700"
          >
            {t("app.fuel.tanks.action.new")}
          </button>
        </div>
      </div>

      <div className="mt-6">
        {tanks.length === 0 ? (
          <div className="py-10 text-center text-gray-500">{t("app.fuel.tanks.empty")}</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.tanks.table.name")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.tanks.table.fuelType")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.tanks.table.currentVolume")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.tanks.table.capacity")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">%</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("common.status")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {tanks.map((tank) => {
                  const cap = Number(tank.capacity);
                  const cur = Number(tank.currentVolume);
                  const pct = cap > 0 && Number.isFinite(cur) ? (cur / cap) * 100 : 0;
                  return (
                    <tr key={tank.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        <Link href={`/t/${props.tenantSlug}/fuel/tanks/${tank.id}`} className="hover:underline">
                          {tank.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">{tank.fuelType}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{tank.currentVolume}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{tank.capacity}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{pct.toFixed(1)}%</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{tank.status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.fuel.tanks.modal.title.new")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.fuel.tanks.modal.subtitle")}</div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.tanks.field.name")}</label>
              <input
                type="text"
                value={newTank.name}
                onChange={(e) => setNewTank({ ...newTank, name: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.tanks.field.fuelType")}</label>
              <input
                type="text"
                value={newTank.fuelType}
                onChange={(e) => setNewTank({ ...newTank, fuelType: e.target.value })}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.tanks.field.capacity")}</label>
              <input
                type="number"
                value={newTank.capacity}
                onChange={(e) => setNewTank({ ...newTank, capacity: e.target.value })}
                placeholder="0"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleCreateTank}
              disabled={!newTank.name || !newTank.fuelType || !newTank.capacity}
              className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {creating ? t("common.working") : t("common.button.create")}
            </button>
            <button
              onClick={() => setModalOpen(false)}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              {t("common.button.cancel")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
