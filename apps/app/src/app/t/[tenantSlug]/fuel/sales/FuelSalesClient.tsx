"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type Customer = { id: string; name: string; phone: string | null };
type FuelPrice = { fuelType: string; pricePerUnit: string };

type Nozzle = {
  id: string;
  name: string;
  tankId: string;
  tankName: string;
  fuelType: string;
  status: "active" | "maintenance" | "inactive";
};

type Pump = {
  id: string;
  name: string;
  status: "active" | "maintenance" | "inactive";
  nozzles: Nozzle[];
};

type Sale = {
  id: string;
  createdAt: string;
  nozzle: { name: string; tank: { fuelType: string } };
  volume: string;
  pricePerUnit: string;
  totalAmount: string;
  paymentMethod: string;
  customer?: { name: string };
  driverName: string | null;
  licensePlate: string | null;
};

export function FuelSalesClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pumps, setPumps] = useState<Pump[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [prices, setPrices] = useState<FuelPrice[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedNozzle, setSelectedNozzle] = useState<Nozzle | null>(null);
  const [saleMode, setSaleMode] = useState<"volume" | "amount">("volume");
  const [volume, setVolume] = useState("");
  const [amount, setAmount] = useState("");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customerId, setCustomerId] = useState("");
  const [driverName, setDriverName] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [saving, setSaving] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const paymentMethods = useMemo(
    () => [
      { value: "cash", label: t("app.fuel.sales.payment.cash") },
      { value: "card", label: t("app.fuel.sales.payment.card") },
      { value: "credit", label: t("app.fuel.sales.payment.credit") },
    ],
    [t]
  );

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

  const reload = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const [pumpsRes, customersRes, salesRes, pricesRes] = await Promise.all([
        apiFetch("/api/fuel/pumps", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/shop/customers?page=1&pageSize=50&status=active", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/fuel/sales", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/fuel/prices", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
      ]);

      if (!pumpsRes.ok || !salesRes.ok) {
        const bad = !pumpsRes.ok ? pumpsRes : salesRes;
        try {
          const json = (await bad.json()) as { error?: { message_key?: string } };
          setErrorKey(json.error?.message_key ?? "errors.internal");
        } catch {
          setErrorKey("errors.internal");
        }
        return;
      }

      const pumpsData = (await pumpsRes.json()) as { data: Pump[] };
      const salesData = (await salesRes.json()) as { data: Sale[] };
      const customersData = customersRes.ok
        ? ((await customersRes.json()) as { data: { items: Customer[] } })
        : ({ data: { items: [] as Customer[] } } as { data: { items: Customer[] } });
      const pricesData = pricesRes.ok ? ((await pricesRes.json()) as { data: FuelPrice[] }) : ({ data: [] as FuelPrice[] } as { data: FuelPrice[] });

      setPumps(pumpsData.data);
      setCustomers(customersData.data.items);
      setPrices(pricesData.data);
      setSales(salesData.data);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleCreateSale = async () => {
    const pricePerUnitNumber = Number(pricePerUnit);
    if (!selectedNozzle) return;
    if (!Number.isFinite(pricePerUnitNumber) || pricePerUnitNumber < 0) return;

    const volumeNumber =
      saleMode === "volume"
        ? Number(volume)
        : Number.isFinite(Number(amount)) && pricePerUnitNumber > 0
          ? Number((Number(amount) / pricePerUnitNumber).toFixed(2))
          : NaN;
    if (!Number.isFinite(volumeNumber) || volumeNumber <= 0) return;

    setSaving(true);
    setErrorKey(null);
    try {
      const normalizedCustomerId = customerId.trim() ? customerId.trim() : undefined;
      const normalizedDriverName = driverName.trim() ? driverName.trim() : undefined;
      const normalizedLicensePlate = licensePlate.trim() ? licensePlate.trim() : undefined;

      const res = await apiFetch("/api/fuel/sales", {
        method: "POST",
        headers: { "X-Tenant-Id": tenantId!, "Content-Type": "application/json" },
        body: JSON.stringify({
          nozzleId: selectedNozzle.id,
          volume: volumeNumber,
          pricePerUnit: pricePerUnitNumber,
          paymentMethod,
          customerId: normalizedCustomerId,
          driverName: normalizedDriverName,
          licensePlate: normalizedLicensePlate,
        }),
      });

      if (!res.ok) {
        try {
          const json = (await res.json()) as { error?: { message_key?: string } };
          setErrorKey(json.error?.message_key ?? "errors.internal");
        } catch {
          setErrorKey("errors.internal");
        }
        return;
      }

      await res.json();
      setModalOpen(false);
      setSelectedNozzle(null);
      setSaleMode("volume");
      setVolume("");
      setAmount("");
      setPricePerUnit("");
      setPaymentMethod("cash");
      setCustomerId("");
      setDriverName("");
      setLicensePlate("");
      await reload();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  };

  const computed = useMemo(() => {
    const p = Number(pricePerUnit);
    if (!Number.isFinite(p) || p <= 0) return null;
    if (saleMode === "volume") {
      const v = Number(volume);
      if (!Number.isFinite(v) || v <= 0) return null;
      return { volume: v.toFixed(2), amount: (v * p).toFixed(2) };
    }
    const a = Number(amount);
    if (!Number.isFinite(a) || a <= 0) return null;
    return { volume: (a / p).toFixed(2), amount: a.toFixed(2) };
  }, [amount, pricePerUnit, saleMode, volume]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-lg font-semibold">{t("app.fuel.sales.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.fuel.sales.subtitle")}</div>
        <div className="mt-6 text-gray-500">{t("common.loading")}</div>
      </div>
    );
  }

  if (errorKey) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-lg font-semibold">{t("app.fuel.sales.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.fuel.sales.subtitle")}</div>
        <div className="mt-6 text-red-600">{t(errorKey)}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-lg font-semibold">{t("app.fuel.sales.title")}</div>
          <div className="mt-2 text-gray-700">{t("app.fuel.sales.subtitle")}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setExportMenuOpen((v) => !v)}
              disabled={exportingXlsx || sales.length === 0}
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
                      const summaryAoA = [["Fuel sales"], ["Exported at", new Date().toISOString()], ["Rows", String(sales.length)]];
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");

                      const header = [
                        t("app.fuel.sales.table.date"),
                        t("app.fuel.sales.table.nozzle"),
                        "Fuel type",
                        t("app.fuel.sales.table.volume"),
                        "Price",
                        t("app.fuel.sales.table.total"),
                        t("app.fuel.sales.table.payment"),
                        "Customer",
                        "Driver",
                        "Plate"
                      ];
                      const rows = sales.map((s) => [
                        new Date(s.createdAt).toISOString(),
                        s.nozzle.name,
                        s.nozzle.tank.fuelType,
                        s.volume,
                        s.pricePerUnit,
                        s.totalAmount,
                        s.paymentMethod,
                        s.customer?.name ?? "",
                        s.driverName ?? "",
                        s.licensePlate ?? ""
                      ]);
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Sales");
                      const safeDate = new Date().toISOString().slice(0, 10);
                      XLSX.writeFile(wb, `fuel_sales_${safeDate}.xlsx`);
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
            {t("app.fuel.sales.action.new")}
          </button>
        </div>
      </div>

      <div className="mt-6">
        {sales.length === 0 ? (
          <div className="py-10 text-center text-gray-500">{t("app.fuel.sales.empty")}</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.sales.table.date")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.sales.table.nozzle")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.tanks.table.fuelType")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.sales.table.volume")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Price</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.sales.table.total")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.sales.table.payment")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Driver / Plate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-700">{new Date(sale.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{sale.nozzle.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{sale.nozzle.tank.fuelType}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{sale.volume}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{sale.pricePerUnit}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold text-gray-900">{sale.totalAmount}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{sale.paymentMethod}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{sale.customer?.name ?? ""}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{[sale.driverName, sale.licensePlate].filter(Boolean).join(" - ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.fuel.sales.modal.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.fuel.sales.modal.subtitle")}</div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.sales.table.nozzle")}</label>
              <select
                value={selectedNozzle?.id || ""}
                onChange={(e) => {
                  const nozzle = pumps.flatMap((p) => p.nozzles).find((n) => n.id === e.target.value);
                  setSelectedNozzle(nozzle || null);
                  if (nozzle && !pricePerUnit.trim()) {
                    const p = prices.find((x) => x.fuelType === nozzle.fuelType)?.pricePerUnit;
                    if (p) setPricePerUnit(p);
                  }
                }}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">{t("common.select")}</option>
                {pumps.map((pump) =>
                  pump.nozzles.map((nozzle) => (
                    <option key={nozzle.id} value={nozzle.id}>
                      {pump.name} - {nozzle.name} ({nozzle.fuelType})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.sales.field.mode")}</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSaleMode("volume")}
                  className={
                    saleMode === "volume"
                      ? "h-10 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white"
                      : "h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  }
                >
                  {t("app.fuel.sales.mode.volume")}
                </button>
                <button
                  type="button"
                  onClick={() => setSaleMode("amount")}
                  className={
                    saleMode === "amount"
                      ? "h-10 rounded-lg bg-gray-900 px-3 text-sm font-medium text-white"
                      : "h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  }
                >
                  {t("app.fuel.sales.mode.amount")}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900">
                  {saleMode === "volume" ? t("app.fuel.sales.field.volume") : t("app.fuel.sales.field.amount")}
                </label>
                {saleMode === "volume" ? (
                  <input
                    type="number"
                    step="0.01"
                    value={volume}
                    onChange={(e) => setVolume(e.target.value)}
                    placeholder="0"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                ) : (
                  <input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0"
                    className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900">{t("app.fuel.sales.field.price")}</label>
                <input
                  type="number"
                  step="0.01"
                  value={pricePerUnit}
                  onChange={(e) => setPricePerUnit(e.target.value)}
                  placeholder="0"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.fuel.sales.table.payment")}</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                {paymentMethods.map((method) => (
                  <option key={method.value} value={method.value}>
                    {method.label}
                  </option>
                ))}
              </select>
            </div>

            {paymentMethod === "credit" && (
              <div>
                <label className="block text-sm font-medium text-gray-900">{t("app.shop.pos.field.customer")}</label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="">{t("common.select")}</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-900">Driver name</label>
                <input
                  type="text"
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-900">License plate</label>
                <input
                  type="text"
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {computed !== null && (
            <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <div className="flex items-center justify-between">
                <span>{t("app.fuel.sales.summary.volume")}</span>
                <span className="tabular-nums">{computed.volume}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span>{t("app.fuel.sales.summary.total")}</span>
                <span className="tabular-nums font-semibold text-gray-900">{computed.amount}</span>
              </div>
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleCreateSale}
              disabled={saving || !selectedNozzle || !pricePerUnit || (saleMode === "volume" ? !volume : !amount)}
              className="flex-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? t("common.working") : t("common.button.create")}
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
