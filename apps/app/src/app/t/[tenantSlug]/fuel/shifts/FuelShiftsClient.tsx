"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string; role: { permissions: string[] } }[] } };
type Nozzle = { id: string; name: string; tankName: string; fuelType: string; status: string };
type ShiftReading = { id: string; nozzleId: string; nozzle: Nozzle; openingReading: string };
type Shift = { id: string; status: "open" | "closed"; openedAt: string; expectedRevenue: string; actualRevenue: string; difference: string; readings: ShiftReading[] };

export function FuelShiftsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [nozzles, setNozzles] = useState<Nozzle[]>([]);
  const [openModal, setOpenModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [selectedNozzleIds, setSelectedNozzleIds] = useState<string[]>([]);
  const [priceByNozzle, setPriceByNozzle] = useState<Record<string, string>>({});
  const [closingByNozzle, setClosingByNozzle] = useState<Record<string, string>>({});
  const [actualRevenue, setActualRevenue] = useState("0");
  const [saving, setSaving] = useState(false);

  const activeShift = useMemo(() => shifts.find((s) => s.status === "open") ?? null, [shifts]);

  useEffect(() => {
    void (async () => {
      try {
        const meRes = await apiFetch("/api/me", { cache: "no-store" });
        if (!meRes.ok) return setErrorKey("errors.unauthenticated");
        const me = (await meRes.json()) as MeResponse;
        const membership = me.data.memberships.find((m) => m.tenantSlug === props.tenantSlug) ?? null;
        if (!membership) return setErrorKey("errors.tenantAccessDenied");
        setTenantId(membership.tenantId);
        setCanManage(membership.role.permissions.includes("fuel.shifts.manage"));
      } catch {
        setErrorKey("errors.internal");
      }
    })();
  }, [props.tenantSlug]);

  async function loadData() {
    if (!tenantId) return;
    const [shiftsRes, pumpsRes] = await Promise.all([
      apiFetch("/api/fuel/shifts", { headers: { "X-Tenant-Id": tenantId }, cache: "no-store" }),
      apiFetch("/api/fuel/pumps", { headers: { "X-Tenant-Id": tenantId }, cache: "no-store" })
    ]);
    if (!shiftsRes.ok || !pumpsRes.ok) return setErrorKey("errors.internal");
    const shiftsJson = await shiftsRes.json();
    const pumpsJson = await pumpsRes.json();
    setShifts(shiftsJson.data);
    setNozzles((pumpsJson.data as { nozzles: Nozzle[] }[]).flatMap((p) => p.nozzles).filter((n) => n.status === "active"));
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function saveOpenShift() {
    setSaving(true);
    const res = await apiFetch("/api/fuel/shifts/open", {
      method: "POST",
      headers: { "X-Tenant-Id": tenantId! },
      body: JSON.stringify({ nozzles: selectedNozzleIds.map((id) => ({ nozzleId: id, pricePerUnit: Number(priceByNozzle[id] || "0") })) })
    });
    setSaving(false);
    if (!res.ok) return setErrorKey("errors.internal");
    setOpenModal(false);
    await loadData();
  }

  async function saveCloseShift() {
    if (!activeShift) return;
    setSaving(true);
    const res = await apiFetch(`/api/fuel/shifts/${activeShift.id}/close`, {
      method: "POST",
      headers: { "X-Tenant-Id": tenantId! },
      body: JSON.stringify({
        actualRevenue: Number(actualRevenue),
        nozzles: activeShift.readings.map((r) => ({ nozzleId: r.nozzleId, closingReading: Number(closingByNozzle[r.nozzleId] || "0") }))
      })
    });
    setSaving(false);
    if (!res.ok) return setErrorKey("errors.internal");
    setCloseModal(false);
    await loadData();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">{t("app.fuel.shifts.title")}</div>
          <div className="text-sm text-gray-500">{t("app.fuel.shifts.subtitle")}</div>
        </div>
        {canManage && (!activeShift ? (
          <button type="button" className="h-10 rounded-xl bg-primary-600 px-4 text-sm font-medium text-white" onClick={() => { setSelectedNozzleIds(nozzles.map((n) => n.id)); setPriceByNozzle(Object.fromEntries(nozzles.map((n) => [n.id, "0"]))); setOpenModal(true); }}>{t("app.fuel.shifts.action.open")}</button>
        ) : (
          <button type="button" className="h-10 rounded-xl bg-amber-600 px-4 text-sm font-medium text-white" onClick={() => { setActualRevenue(activeShift.expectedRevenue); setClosingByNozzle(Object.fromEntries(activeShift.readings.map((r) => [r.nozzleId, r.openingReading]))); setCloseModal(true); }}>{t("app.fuel.shifts.action.close")}</button>
        ))}
      </div>

      {errorKey && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{t(errorKey)}</div>}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-gray-600"><tr><th className="px-4 py-3">{t("app.fuel.shifts.table.status")}</th><th className="px-4 py-3">{t("app.fuel.shifts.table.openedAt")}</th><th className="px-4 py-3">{t("app.fuel.shifts.table.expected")}</th><th className="px-4 py-3">{t("app.fuel.shifts.table.actual")}</th><th className="px-4 py-3">{t("app.fuel.shifts.table.diff")}</th></tr></thead>
          <tbody className="divide-y divide-gray-100">
            {shifts.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">{t("app.fuel.shifts.empty")}</td></tr> : shifts.map((s) => (
              <tr key={s.id}><td className="px-4 py-3">{s.status}</td><td className="px-4 py-3">{new Date(s.openedAt).toLocaleString()}</td><td className="px-4 py-3">{s.expectedRevenue}</td><td className="px-4 py-3">{s.actualRevenue}</td><td className="px-4 py-3">{s.difference}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={openModal} onClose={() => setOpenModal(false)}><div className="w-full max-w-lg p-6"><div className="text-xl font-semibold">{t("app.fuel.shifts.modal.open.title")}</div><div className="mt-4 space-y-2">{nozzles.map((n) => (<div key={n.id} className="flex items-center gap-2"><input type="checkbox" checked={selectedNozzleIds.includes(n.id)} onChange={(e) => setSelectedNozzleIds((prev) => e.target.checked ? [...prev, n.id] : prev.filter((x) => x !== n.id))} /><div className="min-w-0 flex-1 text-sm">{n.name}</div><input type="number" className="h-9 w-28 rounded-lg border border-gray-200 px-2 text-sm" value={priceByNozzle[n.id] || "0"} onChange={(e) => setPriceByNozzle((prev) => ({ ...prev, [n.id]: e.target.value }))} /></div>))}</div><div className="mt-6 flex justify-end gap-2"><button type="button" className="h-10 px-4" onClick={() => setOpenModal(false)}>{t("common.button.cancel")}</button><button type="button" disabled={saving || selectedNozzleIds.length === 0} className="h-10 rounded-xl bg-primary-600 px-4 text-white disabled:opacity-50" onClick={saveOpenShift}>{t("common.button.save")}</button></div></div></Modal>

      <Modal open={closeModal} onClose={() => setCloseModal(false)}><div className="w-full max-w-lg p-6"><div className="text-xl font-semibold">{t("app.fuel.shifts.modal.close.title")}</div><div className="mt-4 space-y-2">{(activeShift?.readings ?? []).map((r) => (<div key={r.id} className="grid grid-cols-2 gap-2"><input disabled className="h-9 rounded-lg border border-gray-200 px-2" value={r.openingReading} /><input type="number" className="h-9 rounded-lg border border-gray-200 px-2" value={closingByNozzle[r.nozzleId] || "0"} onChange={(e) => setClosingByNozzle((prev) => ({ ...prev, [r.nozzleId]: e.target.value }))} /></div>))}</div><input type="number" className="mt-3 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={actualRevenue} onChange={(e) => setActualRevenue(e.target.value)} placeholder={t("app.fuel.shifts.field.actualRevenue")} /><div className="mt-6 flex justify-end gap-2"><button type="button" className="h-10 px-4" onClick={() => setCloseModal(false)}>{t("common.button.cancel")}</button><button type="button" disabled={saving} className="h-10 rounded-xl bg-amber-600 px-4 text-white disabled:opacity-50" onClick={saveCloseShift}>{t("common.button.save")}</button></div></div></Modal>
    </div>
  );
}
