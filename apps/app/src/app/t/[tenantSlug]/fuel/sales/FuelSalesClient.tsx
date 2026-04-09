"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string; role: { permissions: string[] } }[] } };
type Sale = { id: string; createdAt: string; nozzle: { name: string }; volume: string; totalAmount: string; paymentMethod: string };
type Nozzle = { id: string; name: string; tankName: string; status: string };

export function FuelSalesClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [sales, setSales] = useState<Sale[]>([]);
  const [nozzles, setNozzles] = useState<Nozzle[]>([]);
  const [openShiftId, setOpenShiftId] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [nozzleId, setNozzleId] = useState("");
  const [volume, setVolume] = useState("0");
  const [pricePerUnit, setPricePerUnit] = useState("0");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const meRes = await apiFetch("/api/me", { cache: "no-store" });
        if (!meRes.ok) return setErrorKey("errors.unauthenticated");
        const me = (await meRes.json()) as MeResponse;
        const membership = me.data.memberships.find((m) => m.tenantSlug === props.tenantSlug) ?? null;
        if (!membership) return setErrorKey("errors.tenantAccessDenied");
        setTenantId(membership.tenantId);
        setCanCreate(membership.role.permissions.includes("fuel.sales.create"));
      } catch {
        setErrorKey("errors.internal");
      }
    })();
  }, [props.tenantSlug]);

  async function loadData() {
    if (!tenantId) return;
    const [salesRes, pumpsRes, shiftsRes] = await Promise.all([
      apiFetch("/api/fuel/sales", { headers: { "X-Tenant-Id": tenantId }, cache: "no-store" }),
      apiFetch("/api/fuel/pumps", { headers: { "X-Tenant-Id": tenantId }, cache: "no-store" }),
      apiFetch("/api/fuel/shifts", { headers: { "X-Tenant-Id": tenantId }, cache: "no-store" })
    ]);
    if (!salesRes.ok || !pumpsRes.ok || !shiftsRes.ok) return setErrorKey("errors.internal");
    const salesJson = await salesRes.json();
    const pumpsJson = await pumpsRes.json();
    const shiftsJson = await shiftsRes.json();
    setSales(salesJson.data);
    setNozzles((pumpsJson.data as { nozzles: Nozzle[] }[]).flatMap((p) => p.nozzles).filter((n) => n.status === "active"));
    setOpenShiftId(((shiftsJson.data as { id: string; status: string }[]).find((x) => x.status === "open")?.id) ?? null);
  }

  useEffect(() => {
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function saveSale() {
    setSaving(true);
    const res = await apiFetch("/api/fuel/sales", {
      method: "POST",
      headers: { "X-Tenant-Id": tenantId! },
      body: JSON.stringify({ shiftId: openShiftId, nozzleId, volume: Number(volume), pricePerUnit: Number(pricePerUnit), paymentMethod })
    });
    setSaving(false);
    if (!res.ok) return setErrorKey("errors.internal");
    setModalOpen(false);
    await loadData();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><div className="text-lg font-semibold">{t("app.fuel.sales.title")}</div><div className="text-sm text-gray-500">{t("app.fuel.sales.subtitle")}</div></div>
        {canCreate && <button type="button" className="h-10 rounded-xl bg-primary-600 px-4 text-sm font-medium text-white" onClick={() => { setNozzleId(nozzles[0]?.id || ""); setModalOpen(true); }}>{t("app.fuel.sales.action.new")}</button>}
      </div>
      {errorKey && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{t(errorKey)}</div>}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm"><thead className="bg-gray-50 text-gray-600"><tr><th className="px-4 py-3">{t("app.fuel.sales.table.date")}</th><th className="px-4 py-3">{t("app.fuel.sales.table.nozzle")}</th><th className="px-4 py-3">{t("app.fuel.sales.table.volume")}</th><th className="px-4 py-3">{t("app.fuel.sales.table.total")}</th><th className="px-4 py-3">{t("app.fuel.sales.table.payment")}</th></tr></thead><tbody className="divide-y divide-gray-100">{sales.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">{t("app.fuel.sales.empty")}</td></tr> : sales.map((s) => <tr key={s.id}><td className="px-4 py-3">{new Date(s.createdAt).toLocaleString()}</td><td className="px-4 py-3">{s.nozzle.name}</td><td className="px-4 py-3">{s.volume}</td><td className="px-4 py-3">{s.totalAmount}</td><td className="px-4 py-3">{s.paymentMethod}</td></tr>)}</tbody></table>
      </div>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)}><div className="w-full max-w-md p-6"><div className="text-xl font-semibold">{t("app.fuel.sales.modal.title")}</div><div className="mt-1 text-sm text-gray-500">{t("app.fuel.sales.modal.subtitle")}</div><div className="mt-4 space-y-3"><select className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={nozzleId} onChange={(e) => setNozzleId(e.target.value)}><option value="">{t("desktop.select")}</option>{nozzles.map((n) => <option key={n.id} value={n.id}>{n.name} ({n.tankName})</option>)}</select><input type="number" className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={volume} onChange={(e) => setVolume(e.target.value)} placeholder={t("app.fuel.sales.field.volume")} /><input type="number" className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} placeholder={t("app.fuel.sales.field.price")} /><select className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}><option value="cash">{t("app.fuel.sales.payment.cash")}</option><option value="card">{t("app.fuel.sales.payment.card")}</option><option value="credit">{t("app.fuel.sales.payment.credit")}</option></select></div><div className="mt-6 flex justify-end gap-2"><button type="button" className="h-10 px-4" onClick={() => setModalOpen(false)}>{t("common.button.cancel")}</button><button type="button" disabled={saving || !nozzleId} className="h-10 rounded-xl bg-primary-600 px-4 text-white disabled:opacity-50" onClick={saveSale}>{t("common.button.save")}</button></div></div></Modal>
    </div>
  );
}
