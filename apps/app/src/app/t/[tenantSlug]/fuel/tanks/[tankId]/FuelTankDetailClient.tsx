"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import Link from "next/link";
import { Modal } from "@/components/Modal";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type SupplierRef = { id: string; name: string };

type Receiving = {
  id: string;
  receivedAt: string;
  volumeReceived: string;
  pricePerUnit: string;
  totalCost: string;
  supplier: SupplierRef | null;
  referenceNumber: string | null;
};

type Dip = {
  id: string;
  recordedAt: string;
  measuredVolume: string;
  systemVolume: string;
  difference: string;
  reason: string | null;
  recordedBy: { id: string; fullName: string } | null;
};

type Tank = {
  id: string;
  name: string;
  fuelType: string;
  capacity: string;
  currentVolume: string;
  receivings: Receiving[];
  dips: Dip[];
};

export function FuelTankDetailClient(props: { tenantSlug: string; tankId: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [tank, setTank] = useState<Tank | null>(null);
  const [activeTab, setActiveTab] = useState<"receivings" | "dips">("receivings");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const [receivingModalOpen, setReceivingModalOpen] = useState(false);
  const [receivingVolumeReceived, setReceivingVolumeReceived] = useState("");
  const [receivingPricePerUnit, setReceivingPricePerUnit] = useState("");
  const [receivingSupplierId, setReceivingSupplierId] = useState("");
  const [receivingReferenceNumber, setReceivingReferenceNumber] = useState("");

  const [dipModalOpen, setDipModalOpen] = useState(false);
  const [dipMeasuredVolume, setDipMeasuredVolume] = useState("");
  const [dipReason, setDipReason] = useState("");

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
    async function loadTank() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const res = await apiFetch(`/api/fuel/tanks/${props.tankId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as { data?: Tank; error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey(json.error?.message_key ?? "errors.internal");
          return;
        }
        const data = json as { data: Tank };
        if (!cancelled) setTank(data.data);
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadTank();
    return () => {
      cancelled = true;
    };
  }, [tenantId, props.tankId]);

  const reloadTank = async () => {
    if (!tenantId) return;
    try {
      const res = await apiFetch(`/api/fuel/tanks/${props.tankId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as { data?: Tank; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setTank((json as { data: Tank }).data);
    } catch {
      setErrorKey("errors.internal");
    }
  };

  const handleAddReceiving = async () => {
    if (!receivingVolumeReceived || !receivingPricePerUnit) return;
    if (!tenantId) return;

    try {
      const res = await apiFetch(`/api/fuel/tanks/${props.tankId}/receivings`, {
        method: "POST",
        headers: { "X-Tenant-Id": tenantId, "Content-Type": "application/json" },
        body: JSON.stringify({
          volumeReceived: parseFloat(receivingVolumeReceived),
          pricePerUnit: parseFloat(receivingPricePerUnit),
          supplierId: receivingSupplierId.trim() ? receivingSupplierId.trim() : undefined,
          referenceNumber: receivingReferenceNumber.trim() ? receivingReferenceNumber.trim() : undefined,
        }),
      });

      const json = (await res.json()) as { data?: { success: true }; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }

      await reloadTank();
      setReceivingModalOpen(false);
      setReceivingVolumeReceived("");
      setReceivingPricePerUnit("");
      setReceivingSupplierId("");
      setReceivingReferenceNumber("");
    } catch {
      setErrorKey("errors.internal");
    }
  };

  const handleAddDip = async () => {
    if (!dipMeasuredVolume) return;
    if (!tenantId) return;

    try {
      const res = await apiFetch(`/api/fuel/tanks/${props.tankId}/dips`, {
        method: "POST",
        headers: { "X-Tenant-Id": tenantId, "Content-Type": "application/json" },
        body: JSON.stringify({
          measuredVolume: parseFloat(dipMeasuredVolume),
          reason: dipReason.trim() ? dipReason.trim() : undefined,
        }),
      });

      const json = (await res.json()) as { data?: { success: true }; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }

      await reloadTank();
      setDipModalOpen(false);
      setDipMeasuredVolume("");
      setDipReason("");
    } catch {
      setErrorKey("errors.internal");
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-lg font-semibold">{t("app.fuel.tanks.detail.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.fuel.tanks.detail.subtitle")}</div>
        <div className="mt-6 text-gray-500">{t("common.loading")}</div>
      </div>
    );
  }

  if (errorKey) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-lg font-semibold">{t("app.fuel.tanks.detail.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.fuel.tanks.detail.subtitle")}</div>
        <div className="mt-6 text-red-600">{t(errorKey)}</div>
      </div>
    );
  }

  if (!tank) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-lg font-semibold">{t("app.fuel.tanks.detail.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.fuel.tanks.detail.subtitle")}</div>
        <div className="mt-6 text-red-600">{t("errors.notFound")}</div>
      </div>
    );
  }

  const capacity = Number.parseFloat(tank.capacity || "0") || 0;
  const currentVolume = Number.parseFloat(tank.currentVolume || "0") || 0;
  const currentLevelPct = capacity > 0 ? (currentVolume / capacity) * 100 : 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
      <div className="flex items-center gap-4">
        <Link
          href={`/t/${props.tenantSlug}/fuel/tanks`}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
        >
          ← {t("common.button.back")}
        </Link>
        <div>
          <div className="text-lg font-semibold">{tank.name}</div>
          <div className="text-gray-700">{tank.fuelType}</div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-600">{t("app.fuel.tanks.table.capacity")}</div>
          <div className="mt-1 text-2xl font-semibold">{tank.capacity}L</div>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-600">{t("app.fuel.tanks.table.currentVolume")}</div>
          <div className="mt-1 text-2xl font-semibold">{tank.currentVolume}L</div>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-600">{t("app.fuel.tanks.detail.level")}</div>
          <div className="mt-1 text-2xl font-semibold">{currentLevelPct.toFixed(1)}%</div>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-medium text-gray-900">{t("app.fuel.tanks.detail.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.fuel.tanks.detail.subtitle")}</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                onClick={() => setExportMenuOpen((v) => !v)}
                disabled={
                  exportingXlsx ||
                  (activeTab === "receivings" ? tank.receivings.length === 0 : tank.dips.length === 0)
                }
              >
                {exportingXlsx ? t("common.working") : t("app.shop.reports.export.button")}
              </button>
              {exportMenuOpen ? (
                <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                    onClick={async () => {
                      setExportingXlsx(true);
                      setErrorKey(null);
                      try {
                        const XLSX = await import("xlsx");
                        const wb = XLSX.utils.book_new();
                        const summaryAoA = [
                          ["Fuel tank detail"],
                          ["Exported at", new Date().toISOString()],
                          ["Tank", tank.name],
                          ["Fuel type", tank.fuelType],
                          ["Tab", activeTab]
                        ];
                        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");

                        if (activeTab === "receivings") {
                          const header = [
                            t("app.fuel.receivings.table.date"),
                            "Supplier",
                            t("app.fuel.receivings.table.volume"),
                            t("app.fuel.receivings.table.price"),
                            t("app.fuel.receivings.table.total"),
                            t("app.fuel.receivings.table.reference")
                          ];
                          const rows = tank.receivings.map((r) => [
                            new Date(r.receivedAt).toISOString(),
                            r.supplier?.name ?? "",
                            r.volumeReceived,
                            r.pricePerUnit,
                            r.totalCost,
                            r.referenceNumber ?? ""
                          ]);
                          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Receivings");
                        } else {
                          const header = [
                            t("app.fuel.dips.table.date"),
                            t("app.fuel.dips.table.system"),
                            t("app.fuel.dips.table.measured"),
                            t("app.fuel.dips.table.diff"),
                            t("app.fuel.dips.table.reason"),
                            t("app.fuel.dips.table.user")
                          ];
                          const rows = tank.dips.map((d) => [
                            new Date(d.recordedAt).toISOString(),
                            d.systemVolume,
                            d.measuredVolume,
                            d.difference,
                            d.reason ?? "",
                            d.recordedBy?.fullName ?? ""
                          ]);
                          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Dips");
                        }

                        const safeDate = new Date().toISOString().slice(0, 10);
                        const filename = `fuel_tank_${tank.name.replaceAll(" ", "_")}_${activeTab}_${safeDate}.xlsx`;
                        XLSX.writeFile(wb, filename);
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
              onClick={() => setReceivingModalOpen(true)}
              className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
            >
              {t("app.fuel.tanks.action.receive")}
            </button>
            <button
              onClick={() => setDipModalOpen(true)}
              className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              {t("app.fuel.tanks.action.dip")}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("receivings")}
            className={
              activeTab === "receivings"
                ? "rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
            }
          >
            {t("app.fuel.tanks.tabs.receivings")}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("dips")}
            className={
              activeTab === "dips"
                ? "rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-medium text-white"
                : "rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
            }
          >
            {t("app.fuel.tanks.tabs.dips")}
          </button>
        </div>
      </div>

      <div className="mt-3">
        {activeTab === "receivings" ? (
          tank.receivings.length === 0 ? (
            <div className="py-4 text-sm text-gray-600">{t("app.fuel.receivings.empty")}</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.receivings.table.date")}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Supplier</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.receivings.table.volume")}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.receivings.table.price")}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.receivings.table.total")}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.receivings.table.reference")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {tank.receivings.map((receiving) => (
                    <tr key={receiving.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-700">{new Date(receiving.receivedAt).toLocaleString()}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{receiving.supplier?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{receiving.volumeReceived}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{receiving.pricePerUnit}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold text-gray-900">{receiving.totalCost}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{receiving.referenceNumber ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tank.dips.length === 0 ? (
          <div className="py-4 text-sm text-gray-600">{t("app.fuel.dips.empty")}</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.dips.table.date")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.dips.table.system")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.dips.table.measured")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.dips.table.diff")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.dips.table.reason")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.dips.table.user")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {tank.dips.map((dip) => (
                  <tr key={dip.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-700">{new Date(dip.recordedAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{dip.systemVolume}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{dip.measuredVolume}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold text-gray-900">{dip.difference}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{dip.reason ?? ""}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{dip.recordedBy?.fullName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={receivingModalOpen} onClose={() => setReceivingModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.fuel.receivings.modal.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.fuel.receivings.modal.subtitle")}</div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.receivings.field.volume")}</label>
              <input
                type="number"
                value={receivingVolumeReceived}
                onChange={(e) => setReceivingVolumeReceived(e.target.value)}
                placeholder="0"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.receivings.field.price")}</label>
              <input
                type="number"
                step="0.01"
                value={receivingPricePerUnit}
                onChange={(e) => setReceivingPricePerUnit(e.target.value)}
                placeholder="0"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.receivings.field.supplier")}</label>
              <input
                type="text"
                value={receivingSupplierId}
                onChange={(e) => setReceivingSupplierId(e.target.value)}
                placeholder="Supplier ID"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.receivings.field.reference")}</label>
              <input
                type="text"
                value={receivingReferenceNumber}
                onChange={(e) => setReceivingReferenceNumber(e.target.value)}
                placeholder="INV-123"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleAddReceiving}
              disabled={!receivingVolumeReceived || !receivingPricePerUnit}
              className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {t("common.button.add")}
            </button>
            <button
              onClick={() => setReceivingModalOpen(false)}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              {t("common.button.cancel")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={dipModalOpen} onClose={() => setDipModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.fuel.dips.modal.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.fuel.dips.modal.subtitle")}</div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.dips.field.measured")}</label>
              <input
                type="number"
                value={dipMeasuredVolume}
                onChange={(e) => setDipMeasuredVolume(e.target.value)}
                placeholder="0"
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.dips.field.reason")}</label>
              <input
                type="text"
                value={dipReason}
                onChange={(e) => setDipReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleAddDip}
              disabled={!dipMeasuredVolume}
              className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {t("common.button.add")}
            </button>
            <button
              onClick={() => setDipModalOpen(false)}
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
