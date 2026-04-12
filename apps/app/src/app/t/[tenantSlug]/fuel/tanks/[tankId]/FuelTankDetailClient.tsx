"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import Link from "next/link";
import { Modal } from "@/components/Modal";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string; role: { permissions: string[] } }[] } };
type Tank = {
  id: string;
  name: string;
  fuelType: string;
  capacity: string;
  currentVolume: string;
  status: string;
  receivings: { id: string; receivedAt: string; volumeReceived: string; pricePerUnit: string; totalCost: string; referenceNumber: string | null }[];
  dips: { id: string; recordedAt: string; measuredVolume: string; systemVolume: string; difference: string; reason: string | null; recordedBy: { fullName: string | null } | null }[];
};

export function FuelTankDetailClient(props: { tenantSlug: string; tankId: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [tank, setTank] = useState<Tank | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [dipOpen, setDipOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [volumeReceived, setVolumeReceived] = useState("0");
  const [pricePerUnit, setPricePerUnit] = useState("0");
  const [referenceNumber, setReferenceNumber] = useState("");

  const [measuredVolume, setMeasuredVolume] = useState("0");
  const [reason, setReason] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const meRes = await apiFetch("/api/me", { cache: "no-store" });
        if (!meRes.ok) return setErrorKey("errors.unauthenticated");
        const me = (await meRes.json()) as MeResponse;
        const membership = me.data.memberships.find((m) => m.tenantSlug === props.tenantSlug) ?? null;
        if (!membership) return setErrorKey("errors.tenantAccessDenied");
        setTenantId(membership.tenantId);
        setCanManage(membership.role.permissions.includes("fuel.tanks.manage"));
      } catch {
        setErrorKey("errors.internal");
      }
    })();
  }, [props.tenantSlug]);

  async function loadTank() {
    if (!tenantId) return;
    try {
      const res = await apiFetch(`/api/fuel/tanks/${props.tankId}`, { headers: { "X-Tenant-Id": tenantId }, cache: "no-store" });
      const json = await res.json();
      if (!res.ok) return setErrorKey(json.error?.message_key || "errors.internal");
      setTank(json.data);
    } catch {
      setErrorKey("errors.internal");
    }
  }

  useEffect(() => {
    void loadTank();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, props.tankId]);

  async function saveReceiving() {
    setSaving(true);
    const res = await apiFetch(`/api/fuel/tanks/${props.tankId}/receivings`, {
      method: "POST",
      headers: { "X-Tenant-Id": tenantId! },
      body: JSON.stringify({ volumeReceived: Number(volumeReceived), pricePerUnit: Number(pricePerUnit), referenceNumber: referenceNumber || undefined })
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) return setErrorKey(json.error?.message_key || "errors.internal");
    setReceiveOpen(false);
    await loadTank();
  }

  async function saveDip() {
    setSaving(true);
    const res = await apiFetch(`/api/fuel/tanks/${props.tankId}/dips`, {
      method: "POST",
      headers: { "X-Tenant-Id": tenantId! },
      body: JSON.stringify({ measuredVolume: Number(measuredVolume), reason: reason || undefined })
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) return setErrorKey(json.error?.message_key || "errors.internal");
    setDipOpen(false);
    await loadTank();
  }

  if (!tank) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-500">{t("common.loading")}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">{t("app.fuel.tanks.detail.title")}</div>
            <div className="text-sm text-gray-500">{tank.name} • {tank.fuelType}</div>
          </div>
          <Link href={`/t/${props.tenantSlug}/fuel/tanks`} className="inline-flex h-9 items-center rounded-xl border border-gray-200 px-3 text-sm text-gray-700 hover:bg-gray-50">{t("app.fuel.tab.tanks")}</Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Stat label={t("app.fuel.tanks.table.capacity")} value={tank.capacity} />
          <Stat label={t("app.fuel.tanks.table.currentVolume")} value={tank.currentVolume} />
          <Stat label={t("app.fuel.tanks.table.status")} value={tank.status} />
        </div>
        {canManage && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="h-10 rounded-xl bg-primary-600 px-4 text-sm font-medium text-white" onClick={() => setReceiveOpen(true)}>{t("app.fuel.tanks.action.receive")}</button>
            <button type="button" className="h-10 rounded-xl bg-amber-600 px-4 text-sm font-medium text-white" onClick={() => setDipOpen(true)}>{t("app.fuel.tanks.action.dip")}</button>
          </div>
        )}
      </div>

      {errorKey && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{t(errorKey)}</div>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("app.fuel.tanks.tabs.receivings")}
          table={<table className="w-full text-left text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-3 py-2">{t("app.fuel.receivings.table.date")}</th><th className="px-3 py-2">{t("app.fuel.receivings.table.volume")}</th><th className="px-3 py-2">{t("app.fuel.receivings.table.total")}</th></tr></thead><tbody className="divide-y divide-gray-100">{tank.receivings.length === 0 ? <tr><td colSpan={3} className="px-3 py-6 text-center text-gray-500">{t("app.fuel.receivings.empty")}</td></tr> : tank.receivings.map((r) => <tr key={r.id}><td className="px-3 py-2">{new Date(r.receivedAt).toLocaleString()}</td><td className="px-3 py-2">{r.volumeReceived}</td><td className="px-3 py-2">{r.totalCost}</td></tr>)}</tbody></table>}
        />
        <Panel title={t("app.fuel.tanks.tabs.dips")}
          table={<table className="w-full text-left text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-3 py-2">{t("app.fuel.dips.table.date")}</th><th className="px-3 py-2">{t("app.fuel.dips.table.system")}</th><th className="px-3 py-2">{t("app.fuel.dips.table.measured")}</th><th className="px-3 py-2">{t("app.fuel.dips.table.diff")}</th></tr></thead><tbody className="divide-y divide-gray-100">{tank.dips.length === 0 ? <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-500">{t("app.fuel.dips.empty")}</td></tr> : tank.dips.map((d) => <tr key={d.id}><td className="px-3 py-2">{new Date(d.recordedAt).toLocaleString()}</td><td className="px-3 py-2">{d.systemVolume}</td><td className="px-3 py-2">{d.measuredVolume}</td><td className="px-3 py-2">{d.difference}</td></tr>)}</tbody></table>}
        />
      </div>

      <Modal open={receiveOpen} onClose={() => setReceiveOpen(false)}>
        <div className="w-full max-w-md p-6"><div className="text-xl font-semibold">{t("app.fuel.receivings.modal.title")}</div><div className="mt-4 space-y-3"><input type="number" className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={volumeReceived} onChange={(e) => setVolumeReceived(e.target.value)} placeholder={t("app.fuel.receivings.field.volume")} /><input type="number" className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} placeholder={t("app.fuel.receivings.field.price")} /><input className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} placeholder={t("app.fuel.receivings.field.reference")} /></div><div className="mt-6 flex justify-end gap-2"><button type="button" className="h-10 px-4" onClick={() => setReceiveOpen(false)}>{t("common.button.cancel")}</button><button type="button" disabled={saving} className="h-10 rounded-xl bg-primary-600 px-4 text-white disabled:opacity-50" onClick={saveReceiving}>{t("common.button.save")}</button></div></div>
      </Modal>

      <Modal open={dipOpen} onClose={() => setDipOpen(false)}>
        <div className="w-full max-w-md p-6"><div className="text-xl font-semibold">{t("app.fuel.dips.modal.title")}</div><div className="mt-4 space-y-3"><input type="number" className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={measuredVolume} onChange={(e) => setMeasuredVolume(e.target.value)} placeholder={t("app.fuel.dips.field.measured")} /><input className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("app.fuel.dips.field.reason")} /></div><div className="mt-6 flex justify-end gap-2"><button type="button" className="h-10 px-4" onClick={() => setDipOpen(false)}>{t("common.button.cancel")}</button><button type="button" disabled={saving} className="h-10 rounded-xl bg-amber-600 px-4 text-white disabled:opacity-50" onClick={saveDip}>{t("common.button.save")}</button></div></div>
      </Modal>
    </div>
  );
}

function Panel(props: { title: string; table: React.ReactNode }) {
  return <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white"><div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">{props.title}</div><div className="overflow-x-auto">{props.table}</div></div>;
}

function Stat(props: { label: string; value: string }) {
  return <div className="rounded-xl border border-gray-200 bg-gray-50 p-3"><div className="text-xs text-gray-500">{props.label}</div><div className="mt-1 text-sm font-semibold text-gray-900">{props.value}</div></div>;
}
