"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

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

type FuelPrice = { fuelType: string; pricePerUnit: string };

type ShiftReading = {
  id: string;
  nozzleId: string;
  openingReading: string;
  closingReading: string | null;
  totalVolume: string;
  pricePerUnit: string;
  totalAmount: string;
  nozzle: { id: string; name: string; currentTotalizerReading: string; tank: { id: string; name: string; fuelType: string } };
};

type Shift = {
  id: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  expectedRevenue: string;
  actualRevenue: string;
  difference: string;
  note: string | null;
  readings: ShiftReading[];
};

type ShiftReport = {
  shift: {
    id: string;
    status: "open" | "closed";
    openedAt: string;
    closedAt: string | null;
    expectedRevenue: string;
    actualRevenue: string;
    difference: string;
    note: string | null;
    openedBy: { id: string; fullName: string } | null;
    closedBy: { id: string; fullName: string } | null;
  };
  totals: { salesCount: number; volume: string; totalAmount: string };
  byPaymentMethod: { paymentMethod: string; salesCount: number; volume: string; totalAmount: string }[];
  byNozzle: { nozzleId: string; nozzleName: string; tankName: string | null; fuelType: string | null; salesCount: number; volume: string; totalAmount: string }[];
  readings: ShiftReading[];
  sales: {
    id: string;
    createdAt: string;
    nozzleId: string;
    volume: string;
    pricePerUnit: string;
    totalAmount: string;
    paymentMethod: string;
    driverName: string | null;
    licensePlate: string | null;
    customer: { id: string; name: string } | null;
    nozzle: { name: string; tank: { fuelType: string } };
  }[];
};

export function FuelShiftsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [pumps, setPumps] = useState<Pump[]>([]);
  const [prices, setPrices] = useState<FuelPrice[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  const [openModalOpen, setOpenModalOpen] = useState(false);
  const [openNote, setOpenNote] = useState("");
  const [selectedNozzleIds, setSelectedNozzleIds] = useState<string[]>([]);
  const [openPricesByNozzle, setOpenPricesByNozzle] = useState<Record<string, string>>({});
  const [openingShift, setOpeningShift] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [report, setReport] = useState<ShiftReport | null>(null);
  const [reportExportingXlsx, setReportExportingXlsx] = useState(false);

  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closingShift, setClosingShift] = useState<Shift | null>(null);
  const [closingReadings, setClosingReadings] = useState<Record<string, string>>({});
  const [actualRevenue, setActualRevenue] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [closing, setClosing] = useState(false);

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
      const [pumpsRes, shiftsRes, pricesRes] = await Promise.all([
        apiFetch("/api/fuel/pumps", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/fuel/shifts", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/fuel/prices", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
      ]);
      if (!pumpsRes.ok || !shiftsRes.ok) {
        const bad = !pumpsRes.ok ? pumpsRes : shiftsRes;
        try {
          const json = (await bad.json()) as { error?: { message_key?: string } };
          setErrorKey(json.error?.message_key ?? "errors.internal");
        } catch {
          setErrorKey("errors.internal");
        }
        return;
      }
      const pumpsData = (await pumpsRes.json()) as { data: Pump[] };
      const shiftsData = (await shiftsRes.json()) as { data: Shift[] };
      const pricesData = pricesRes.ok ? ((await pricesRes.json()) as { data: FuelPrice[] }) : { data: [] as FuelPrice[] };
      setPumps(pumpsData.data);
      setShifts(shiftsData.data);
      setPrices(pricesData.data);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const flatNozzles = useMemo(() => {
    const out: { pumpId: string; pumpName: string; nozzle: Nozzle }[] = [];
    for (const p of pumps) {
      for (const n of p.nozzles) out.push({ pumpId: p.id, pumpName: p.name, nozzle: n });
    }
    return out;
  }, [pumps]);

  const priceByFuelType = useMemo(() => new Map(prices.map((p) => [p.fuelType, p.pricePerUnit])), [prices]);
  const openShift = useMemo(() => shifts.find((s) => s.status === "open") ?? null, [shifts]);

  function openOpenShiftModal() {
    setErrorKey(null);
    setOpenNote("");
    setSelectedNozzleIds([]);
    const next: Record<string, string> = {};
    for (const item of flatNozzles) {
      const defaultPrice = priceByFuelType.get(item.nozzle.fuelType);
      if (defaultPrice) next[item.nozzle.id] = defaultPrice;
    }
    setOpenPricesByNozzle(next);
    setOpenModalOpen(true);
  }

  async function submitOpenShift() {
    const selected = selectedNozzleIds;
    if (selected.length === 0) {
      setErrorKey("errors.validationError");
      return;
    }
    const nozzles = selected.map((nozzleId) => ({
      nozzleId,
      pricePerUnit: Number(openPricesByNozzle[nozzleId] ?? ""),
    }));
    if (!nozzles.every((x) => Number.isFinite(x.pricePerUnit) && x.pricePerUnit >= 0)) {
      setErrorKey("errors.validationError");
      return;
    }

    setOpeningShift(true);
    setErrorKey(null);
    try {
      const res = await apiFetch("/api/fuel/shifts/open", {
        method: "POST",
        headers: { "X-Tenant-Id": tenantId!, "Content-Type": "application/json" },
        body: JSON.stringify({ note: openNote.trim() || undefined, nozzles }),
      });
      const json = (await res.json()) as { data?: unknown; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setOpenModalOpen(false);
      await reload();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setOpeningShift(false);
    }
  }

  function openCloseShiftModal(shift: Shift) {
    setErrorKey(null);
    setClosingShift(shift);
    const next: Record<string, string> = {};
    for (const r of shift.readings) next[r.nozzleId] = r.nozzle.currentTotalizerReading || r.closingReading || r.openingReading;
    setClosingReadings(next);
    setActualRevenue("");
    setCloseNote(shift.note ?? "");
    setCloseModalOpen(true);
  }

  async function submitCloseShift() {
    if (!closingShift) return;
    const actual = Number(actualRevenue);
    if (!Number.isFinite(actual) || actual < 0) {
      setErrorKey("errors.validationError");
      return;
    }
    const nozzles = closingShift.readings.map((r) => ({
      nozzleId: r.nozzleId,
      closingReading: Number(closingReadings[r.nozzleId]),
    }));
    if (!nozzles.every((n) => Number.isFinite(n.closingReading) && n.closingReading >= 0)) {
      setErrorKey("errors.validationError");
      return;
    }

    setClosing(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/fuel/shifts/${closingShift.id}/close`, {
        method: "POST",
        headers: { "X-Tenant-Id": tenantId!, "Content-Type": "application/json" },
        body: JSON.stringify({ actualRevenue: actual, note: closeNote.trim() || undefined, nozzles }),
      });
      const json = (await res.json()) as { data?: unknown; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setCloseModalOpen(false);
      setClosingShift(null);
      await reload();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setClosing(false);
    }
  }

  async function openShiftReport(shiftId: string) {
    if (!tenantId) return;
    setReportModalOpen(true);
    setReportLoading(true);
    setErrorKey(null);
    setReport(null);
    try {
      const res = await apiFetch(`/api/fuel/shifts/${shiftId}/report`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as { data?: ShiftReport; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        setReportModalOpen(false);
        return;
      }
      setReport((json as { data: ShiftReport }).data);
    } catch {
      setErrorKey("errors.internal");
      setReportModalOpen(false);
    } finally {
      setReportLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-lg font-semibold">{t("app.fuel.shifts.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.fuel.shifts.subtitle")}</div>
        <div className="mt-6 text-gray-500">{t("common.loading")}</div>
      </div>
    );
  }

  if (errorKey) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-lg font-semibold">{t("app.fuel.shifts.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.fuel.shifts.subtitle")}</div>
        <div className="mt-6 text-red-600">{t(errorKey)}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-lg font-semibold">{t("app.fuel.shifts.title")}</div>
          <div className="mt-2 text-gray-700">{t("app.fuel.shifts.subtitle")}</div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setExportMenuOpen((v) => !v)}
              disabled={exportingXlsx || shifts.length === 0}
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
                      const summaryAoA = [["Fuel shifts"], ["Exported at", new Date().toISOString()], ["Rows", String(shifts.length)]];
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");

                      const header = [
                        t("app.fuel.shifts.table.status"),
                        t("app.fuel.shifts.table.openedAt"),
                        t("app.fuel.shifts.table.expected"),
                        t("app.fuel.shifts.table.actual"),
                        t("app.fuel.shifts.table.diff")
                      ];
                      const rows = shifts.map((s) => [s.status, new Date(s.openedAt).toISOString(), s.expectedRevenue, s.actualRevenue, s.difference]);
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Shifts");

                      const readingHeader = ["ShiftId", "Nozzle", "Tank", "Fuel type", "Opening", "Closing", "Total volume", "Price", "Total amount"];
                      const readingRows = shifts.flatMap((s) =>
                        s.readings.map((r) => [
                          s.id,
                          r.nozzle.name,
                          r.nozzle.tank.name,
                          r.nozzle.tank.fuelType,
                          r.openingReading,
                          r.closingReading ?? "",
                          r.totalVolume,
                          r.pricePerUnit,
                          r.totalAmount
                        ])
                      );
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([readingHeader, ...readingRows]), "Readings");

                      const safeDate = new Date().toISOString().slice(0, 10);
                      XLSX.writeFile(wb, `fuel_shifts_${safeDate}.xlsx`);
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
            onClick={() => void reload()}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            {t("common.button.refresh")}
          </button>
          <button
            type="button"
            onClick={openOpenShiftModal}
            disabled={!!openShift}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {t("app.fuel.shifts.action.open")}
          </button>
          {openShift && (
            <button
              type="button"
              onClick={() => openCloseShiftModal(openShift)}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              {t("app.fuel.shifts.action.close")}
            </button>
          )}
        </div>
      </div>

      <div className="mt-6">
        {shifts.length === 0 ? (
          <div className="py-10 text-center text-gray-500">{t("app.fuel.shifts.empty")}</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">{t("app.fuel.shifts.table.status")}</th>
                  <th className="px-4 py-3 text-left font-medium">{t("app.fuel.shifts.table.openedAt")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("app.fuel.shifts.table.expected")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("app.fuel.shifts.table.actual")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("app.fuel.shifts.table.diff")}</th>
                  <th className="px-4 py-3 text-right font-medium">{t("common.button.open")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {shifts.map((s) => (
                  <tr key={s.id} className="bg-white">
                    <td className="px-4 py-3">{s.status}</td>
                    <td className="px-4 py-3">{new Date(s.openedAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.expectedRevenue}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.actualRevenue}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{s.difference}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
                        onClick={() => void openShiftReport(s.id)}
                      >
                        Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={reportModalOpen} onClose={() => setReportModalOpen(false)}>
        <div className="w-full max-w-4xl p-6 md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xl font-semibold">Shift report</div>
              {report ? <div className="mt-1 text-sm text-gray-600">{new Date(report.shift.openedAt).toLocaleString()}</div> : null}
            </div>
            <button
              type="button"
              disabled={!report || reportExportingXlsx}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={async () => {
                if (!report) return;
                setReportExportingXlsx(true);
                setErrorKey(null);
                try {
                  const XLSX = await import("xlsx");
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(
                    wb,
                    XLSX.utils.aoa_to_sheet([
                      ["Fuel shift report"],
                      ["ShiftId", report.shift.id],
                      ["Status", report.shift.status],
                      ["Opened at", new Date(report.shift.openedAt).toISOString()],
                      ["Closed at", report.shift.closedAt ? new Date(report.shift.closedAt).toISOString() : ""],
                      ["Sales count", String(report.totals.salesCount)],
                      ["Total volume", report.totals.volume],
                      ["Total amount", report.totals.totalAmount]
                    ]),
                    "Summary"
                  );

                  XLSX.utils.book_append_sheet(
                    wb,
                    XLSX.utils.aoa_to_sheet([
                      ["Payment method", "Sales", "Volume", "Total"],
                      ...report.byPaymentMethod.map((p) => [p.paymentMethod, String(p.salesCount), p.volume, p.totalAmount])
                    ]),
                    "Payments"
                  );

                  XLSX.utils.book_append_sheet(
                    wb,
                    XLSX.utils.aoa_to_sheet([
                      ["Nozzle", "Tank", "Fuel", "Sales", "Volume", "Total"],
                      ...report.byNozzle.map((n) => [n.nozzleName, n.tankName ?? "", n.fuelType ?? "", String(n.salesCount), n.volume, n.totalAmount])
                    ]),
                    "Nozzles"
                  );

                  XLSX.utils.book_append_sheet(
                    wb,
                    XLSX.utils.aoa_to_sheet([
                      ["Time", "Nozzle", "Fuel", "Volume", "Price", "Total", "Payment", "Customer", "Driver", "Plate"],
                      ...report.sales.map((s) => [
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
                      ])
                    ]),
                    "Sales"
                  );

                  const safeDate = new Date().toISOString().slice(0, 10);
                  XLSX.writeFile(wb, `fuel_shift_${report.shift.id}_${safeDate}.xlsx`);
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setReportExportingXlsx(false);
                }
              }}
            >
              {reportExportingXlsx ? t("common.working") : t("app.shop.reports.export.excel")}
            </button>
          </div>

          {reportLoading ? (
            <div className="mt-6 text-gray-500">{t("common.loading")}</div>
          ) : !report ? (
            <div className="mt-6 text-gray-500">{t("errors.notFound")}</div>
          ) : (
            <div className="mt-6 space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Sales</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{report.totals.salesCount}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total volume</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{report.totals.volume}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">Total amount</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{report.totals.totalAmount}</div>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Payment</th>
                      <th className="px-4 py-3 text-right font-medium">Sales</th>
                      <th className="px-4 py-3 text-right font-medium">Volume</th>
                      <th className="px-4 py-3 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {report.byPaymentMethod.map((p) => (
                      <tr key={p.paymentMethod}>
                        <td className="px-4 py-3">{p.paymentMethod}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{p.salesCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{p.volume}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">{p.totalAmount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Nozzle</th>
                      <th className="px-4 py-3 text-left font-medium">Tank</th>
                      <th className="px-4 py-3 text-left font-medium">Fuel</th>
                      <th className="px-4 py-3 text-right font-medium">Sales</th>
                      <th className="px-4 py-3 text-right font-medium">Volume</th>
                      <th className="px-4 py-3 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {report.byNozzle.map((n) => (
                      <tr key={n.nozzleId}>
                        <td className="px-4 py-3">{n.nozzleName}</td>
                        <td className="px-4 py-3">{n.tankName ?? ""}</td>
                        <td className="px-4 py-3">{n.fuelType ?? ""}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{n.salesCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{n.volume}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">{n.totalAmount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={openModalOpen} onClose={() => setOpenModalOpen(false)}>
        <div className="w-full max-w-2xl p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.fuel.shifts.modal.open.title")}</div>
          <div className="mt-1 text-sm text-gray-600">{t("app.fuel.shifts.subtitle")}</div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900">Note</label>
              <input
                value={openNote}
                onChange={(e) => setOpenNote(e.target.value)}
                className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
              />
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Select</th>
                    <th className="px-4 py-3 text-left font-medium">{t("app.fuel.sales.table.nozzle")}</th>
                    <th className="px-4 py-3 text-left font-medium">{t("app.fuel.tanks.table.fuelType")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("app.fuel.sales.field.price")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {flatNozzles.map((item) => {
                    const isSelected = selectedNozzleIds.includes(item.nozzle.id);
                    const disabled = item.nozzle.status !== "active";
                    return (
                      <tr key={item.nozzle.id} className={disabled ? "opacity-60" : ""}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={disabled}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setSelectedNozzleIds((prev) => {
                                if (checked) return Array.from(new Set([...prev, item.nozzle.id]));
                                return prev.filter((id) => id !== item.nozzle.id);
                              });
                              if (checked && openPricesByNozzle[item.nozzle.id] === undefined) {
                                const defaultPrice = priceByFuelType.get(item.nozzle.fuelType) ?? "";
                                setOpenPricesByNozzle((prev) => ({ ...prev, [item.nozzle.id]: defaultPrice }));
                              }
                            }}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{item.nozzle.name}</div>
                          <div className="text-xs text-gray-500">
                            {item.pumpName} • {item.nozzle.tankName}
                          </div>
                        </td>
                        <td className="px-4 py-3">{item.nozzle.fuelType}</td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            step="0.01"
                            disabled={!isSelected}
                            value={openPricesByNozzle[item.nozzle.id] ?? ""}
                            onChange={(e) => setOpenPricesByNozzle((prev) => ({ ...prev, [item.nozzle.id]: e.target.value }))}
                            className="h-9 w-28 rounded-lg border border-gray-200 px-2 text-right text-sm tabular-nums disabled:bg-gray-50"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setOpenModalOpen(false)}
              className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              disabled={openingShift || selectedNozzleIds.length === 0}
              onClick={() => void submitOpenShift()}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-primary-600 px-6 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {openingShift ? t("common.working") : t("app.fuel.shifts.action.open")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={closeModalOpen} onClose={() => setCloseModalOpen(false)}>
        <div className="w-full max-w-2xl p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.fuel.shifts.modal.close.title")}</div>
          <div className="mt-1 text-sm text-gray-600">{t("app.fuel.shifts.subtitle")}</div>

          {closingShift && (
            <div className="mt-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-900">{t("app.fuel.shifts.field.actualRevenue")}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={actualRevenue}
                    onChange={(e) => setActualRevenue(e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900">Note</label>
                  <input
                    value={closeNote}
                    onChange={(e) => setCloseNote(e.target.value)}
                    className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm"
                  />
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">{t("app.fuel.sales.table.nozzle")}</th>
                      <th className="px-4 py-3 text-right font-medium">Opening</th>
                      <th className="px-4 py-3 text-right font-medium">Closing</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {closingShift.readings.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{r.nozzle.name}</div>
                          <div className="text-xs text-gray-500">
                            {r.nozzle.tank.name} • {r.nozzle.tank.fuelType}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.openingReading}</td>
                        <td className="px-4 py-3 text-right">
                          <input
                            type="number"
                            step="0.01"
                            value={closingReadings[r.nozzleId] ?? ""}
                            onChange={(e) => setClosingReadings((prev) => ({ ...prev, [r.nozzleId]: e.target.value }))}
                            className="h-9 w-32 rounded-lg border border-gray-200 px-2 text-right text-sm tabular-nums"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setCloseModalOpen(false)}
              className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              disabled={closing}
              onClick={() => void submitCloseShift()}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-red-600 px-6 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {closing ? t("common.working") : t("app.fuel.shifts.action.close")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
