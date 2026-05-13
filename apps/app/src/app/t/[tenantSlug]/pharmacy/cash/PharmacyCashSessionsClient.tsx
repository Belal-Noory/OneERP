"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };
type Location = { id: string; name: string };
type LocationsResponse = { data: Location[] };

type PharmacySettingsResponse = { data: { sellCurrencyCode: string } };

type CashSessionListItem = {
  id: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  openingCash: string;
  expectedCash: string;
  countedCash: string;
  discrepancy: string;
  note: string | null;
  location: { id: string; name: string } | null;
  openedBy: { id: string; fullName: string | null } | null;
  closedBy: { id: string; fullName: string | null } | null;
};

type ListCashSessionsResponse = { data: { items: CashSessionListItem[]; page: number; pageSize: number; total: number } };

type CashSessionDetail = {
  id: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  openingCash: string;
  expectedCash: string;
  expectedCashLive: string;
  countedCash: string;
  discrepancy: string;
  note: string | null;
  location: { id: string; name: string } | null;
  cashIn: string;
  cashOut: string;
  paymentsIn: string;
  paymentsOut: string;
  paymentsTotal: string;
  events: { id: string; type: "cash_in" | "cash_out"; amount: string; note: string | null; createdAt: string; actor: { id: string; fullName: string | null } | null }[];
};

type GetCashSessionResponse = { data: CashSessionDetail };

type CurrentCashSessionResponse = { data: { id: string } | null };

function toMoneyString(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

export function PharmacyCashSessionsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [sellCurrencyCode, setSellCurrencyCode] = useState("USD");

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");

  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState<CashSessionDetail | null>(null);

  const [sessions, setSessions] = useState<CashSessionListItem[]>([]);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [total, setTotal] = useState(0);

  const [openModal, setOpenModal] = useState(false);
  const [openingCash, setOpeningCash] = useState("0.00");
  const [openNote, setOpenNote] = useState("");
  const [opening, setOpening] = useState(false);

  const [cashModal, setCashModal] = useState<null | { type: "cash_in" | "cash_out" }>(null);
  const [cashAmount, setCashAmount] = useState("0.00");
  const [cashNote, setCashNote] = useState("");
  const [postingCash, setPostingCash] = useState(false);

  const [closeModal, setCloseModal] = useState(false);
  const [countedCash, setCountedCash] = useState("0.00");
  const [closeNote, setCloseNote] = useState("");
  const [closing, setClosing] = useState(false);

  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "closed">("all");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsSession, setDetailsSession] = useState<CashSessionDetail | null>(null);

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

  const loadHeader = useCallback(async () => {
    if (!tenantId) return;
    const [locRes, settingsRes] = await Promise.all([
      apiFetch("/api/pharmacy/locations", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
      apiFetch("/api/pharmacy/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
    ]);
    if (!locRes.ok || !settingsRes.ok) throw new Error("FAILED");
    const locJson = (await locRes.json()) as LocationsResponse;
    const settingsJson = (await settingsRes.json()) as PharmacySettingsResponse;
    setLocations(locJson.data ?? []);
    const currency = settingsJson.data.sellCurrencyCode ?? "USD";
    setSellCurrencyCode(currency);
    if (!locationId) setLocationId(locJson.data?.[0]?.id ?? "");
  }, [locationId, tenantId]);

  const loadCurrent = useCallback(async () => {
    if (!tenantId || !locationId) {
      setCurrentSessionId(null);
      setCurrentSession(null);
      return;
    }
    const res = await apiFetch(`/api/pharmacy/cash-sessions/current?locationId=${encodeURIComponent(locationId)}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
    if (!res.ok) throw new Error("FAILED");
    const json = (await res.json()) as CurrentCashSessionResponse;
    const id = json.data?.id ?? null;
    setCurrentSessionId(id);
    if (!id) {
      setCurrentSession(null);
      return;
    }
    const detailRes = await apiFetch(`/api/pharmacy/cash-sessions/${encodeURIComponent(id)}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
    if (!detailRes.ok) throw new Error("FAILED");
    const detailJson = (await detailRes.json()) as GetCashSessionResponse;
    setCurrentSession(detailJson.data);
  }, [locationId, tenantId]);

  const loadList = useCallback(async () => {
    if (!tenantId) return;
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (statusFilter !== "all") p.set("status", statusFilter);
    if (locationId) p.set("locationId", locationId);
    const res = await apiFetch(`/api/pharmacy/cash-sessions?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
    if (!res.ok) throw new Error("FAILED");
    const json = (await res.json()) as ListCashSessionsResponse;
    setSessions(json.data.items ?? []);
    setTotal(json.data.total ?? 0);
  }, [locationId, page, pageSize, statusFilter, tenantId]);

  const refreshAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      await loadHeader();
      await loadCurrent();
      await loadList();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [loadCurrent, loadHeader, loadList, tenantId]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

  const openShift = useCallback(async () => {
    if (!tenantId || !locationId) return;
    setOpening(true);
    setErrorKey(null);
    try {
      const res = await apiFetch("/api/pharmacy/cash-sessions/open", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({ locationId, openingCash, note: openNote?.trim() || undefined })
      });
      if (!res.ok) {
        setErrorKey("errors.internal");
        return;
      }
      setOpenModal(false);
      setOpeningCash("0.00");
      setOpenNote("");
      await loadCurrent();
      await loadList();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setOpening(false);
    }
  }, [loadCurrent, loadList, locationId, openNote, openingCash, tenantId]);

  const postCash = useCallback(async () => {
    if (!tenantId || !currentSessionId || !cashModal) return;
    setPostingCash(true);
    setErrorKey(null);
    try {
      const endpoint = cashModal.type === "cash_in" ? "cash-in" : "cash-out";
      const res = await apiFetch(`/api/pharmacy/cash-sessions/${encodeURIComponent(currentSessionId)}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({ amount: cashAmount, note: cashNote?.trim() || undefined })
      });
      if (!res.ok) {
        setErrorKey("errors.internal");
        return;
      }
      setCashModal(null);
      setCashAmount("0.00");
      setCashNote("");
      await loadCurrent();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setPostingCash(false);
    }
  }, [cashAmount, cashModal, cashNote, currentSessionId, loadCurrent, tenantId]);

  const closeShift = useCallback(async () => {
    if (!tenantId || !currentSessionId) return;
    setClosing(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/pharmacy/cash-sessions/${encodeURIComponent(currentSessionId)}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({ countedCash, note: closeNote?.trim() || undefined })
      });
      if (!res.ok) {
        setErrorKey("errors.internal");
        return;
      }
      setCloseModal(false);
      setCountedCash("0.00");
      setCloseNote("");
      await loadCurrent();
      await loadList();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setClosing(false);
    }
  }, [closeNote, countedCash, currentSessionId, loadCurrent, loadList, tenantId]);

  const openDetails = useCallback(
    async (id: string) => {
      if (!tenantId) return;
      setDetailsOpen(true);
      setDetailsLoading(true);
      setDetailsSession(null);
      try {
        const res = await apiFetch(`/api/pharmacy/cash-sessions/${encodeURIComponent(id)}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) {
          setErrorKey("errors.internal");
          return;
        }
        const json = (await res.json()) as GetCashSessionResponse;
        setDetailsSession(json.data);
      } catch {
        setErrorKey("errors.internal");
      } finally {
        setDetailsLoading(false);
      }
    },
    [tenantId]
  );

  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;

  const expectedLive = currentSession ? Number(currentSession.expectedCashLive) : 0;
  const counted = currentSession ? Number(currentSession.countedCash) : 0;
  const discrepancy = currentSession ? Number(currentSession.discrepancy) : 0;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.shop.cash.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.shop.cash.subtitle")}</div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/pos`}>
              {t("app.shop.cash.action.goPos")}
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.cash.field.location")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={loading}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.cash.filter.status")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | "open" | "closed")} disabled={loading}>
              <option value="all">{t("app.shop.cash.filter.status.all")}</option>
              <option value="open">{t("app.shop.cash.status.open")}</option>
              <option value="closed">{t("app.shop.cash.status.closed")}</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              disabled={loading}
              onClick={() => void refreshAll()}
            >
              {loading ? t("app.shop.cash.action.working") : t("common.button.refresh")}
            </button>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={loading || !locationId || !!currentSessionId}
              onClick={() => {
                setOpeningCash("0.00");
                setOpenNote("");
                setOpenModal(true);
              }}
            >
              {t("app.shop.cash.action.open")}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">{t("app.shop.cash.current.title")}</div>
              <div className="mt-2 text-sm text-gray-700">{t("app.shop.cash.current.subtitle")}</div>
            </div>
            {currentSessionId ? (
              <div className="flex flex-wrap items-center gap-2">
                <a
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/pharmacy/cash/${encodeURIComponent(currentSessionId)}/print?paper=a4`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.cash.action.print")}
                </a>
                <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setCashModal({ type: "cash_in" })}>
                  {t("app.shop.cash.action.cashIn")}
                </button>
                <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setCashModal({ type: "cash_out" })}>
                  {t("app.shop.cash.action.cashOut")}
                </button>
                <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800" onClick={() => setCloseModal(true)}>
                  {t("app.shop.cash.action.close")}
                </button>
              </div>
            ) : null}
          </div>

          {!currentSession ? (
            <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-700">{t("app.shop.cash.current.none")}</div>
          ) : (
            <>
              <div className="mt-6 grid gap-4 md:grid-cols-3">
                <Stat label={t("app.shop.cash.current.openingCash")} value={formatMoney(currentSession.openingCash, sellCurrencyCode)} />
                <Stat label={t("app.shop.cash.current.expectedCash")} value={formatMoney(currentSession.expectedCashLive, sellCurrencyCode)} />
                <Stat label={t("app.shop.cash.current.netCash")} value={formatMoney(currentSession.paymentsTotal, sellCurrencyCode)} />
              </div>

              <div className="mt-6">
                <div className="text-sm font-semibold">{t("app.shop.cash.current.activity")}</div>
                {currentSession.events.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">{t("app.shop.cash.current.noActivity")}</div>
                ) : (
                  <div className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                    {currentSession.events.slice(0, 8).map((e) => (
                      <div key={e.id} className="flex items-start justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900">{e.type === "cash_in" ? t("app.shop.cash.event.cashIn") : t("app.shop.cash.event.cashOut")}</div>
                          <div className="mt-1 text-xs text-gray-600">
                            {new Date(e.createdAt).toLocaleString()}
                            {e.note?.trim() ? ` • ${e.note.trim()}` : ""}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-sm font-semibold text-gray-900 tabular">{formatMoney(e.amount, sellCurrencyCode)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <Mini label={t("app.shop.cash.current.netCash")} value={formatMoney(currentSession.paymentsTotal, sellCurrencyCode)} />
                <Mini label={t("app.shop.cash.print.countedCash")} value={formatMoney(toMoneyString(counted), sellCurrencyCode)} />
                <Mini label={t("app.shop.cash.print.discrepancy")} value={formatMoney(toMoneyString(discrepancy), sellCurrencyCode)} />
              </div>
            </>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
          <div className="text-lg font-semibold">{t("app.shop.cash.history.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.shop.cash.history.subtitle")}</div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[420px] w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-900">{t("app.shop.cash.table.openedAt")}</th>
                  <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-900">{t("app.shop.cash.table.status")}</th>
                  <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-900">{t("app.shop.cash.table.expected")}</th>
                  <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-900">{t("app.shop.cash.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr>
                    <td className="px-3 py-6 text-gray-600" colSpan={4}>
                      {t("app.shop.cash.history.empty")}
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id}>
                      <td className="border-b border-gray-100 px-3 py-3 text-gray-700">{new Date(s.openedAt).toLocaleString()}</td>
                      <td className="border-b border-gray-100 px-3 py-3 text-gray-700">{t(`app.shop.cash.status.${s.status}`)}</td>
                      <td className="border-b border-gray-100 px-3 py-3 text-right text-gray-900">{formatMoney(s.expectedCash, sellCurrencyCode)}</td>
                      <td className="border-b border-gray-100 px-3 py-3 text-right">
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-900 hover:bg-gray-50"
                          onClick={() => void openDetails(s.id)}
                        >
                          {t("app.shop.cash.action.view")}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="text-xs text-gray-600 tabular">
              {t("app.shop.cash.pagination.page")}: {page} / {pages}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                {t("app.shop.cash.pagination.prev")}
              </button>
              <button
                type="button"
                className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
              >
                {t("app.shop.cash.pagination.next")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <Modal open={openModal} onClose={() => setOpenModal(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.shop.cash.open.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.shop.cash.open.subtitle")}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.cash.open.openingCash")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.cash.field.note")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={openNote} onChange={(e) => setOpenNote(e.target.value)} placeholder={t("app.shop.cash.field.note.placeholder")} />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setOpenModal(false)}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={opening}
              onClick={() => void openShift()}
            >
              {opening ? t("app.shop.cash.action.working") : t("app.shop.cash.action.open")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={!!cashModal} onClose={() => setCashModal(null)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{cashModal?.type === "cash_in" ? t("app.shop.cash.cashIn.title") : t("app.shop.cash.cashOut.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.shop.cash.cash.subtitle")}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.cash.cash.amount")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.cash.field.note")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={cashNote} onChange={(e) => setCashNote(e.target.value)} placeholder={t("app.shop.cash.field.note.placeholder")} />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setCashModal(null)}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={postingCash}
              onClick={() => void postCash()}
            >
              {postingCash ? t("app.shop.cash.action.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={closeModal} onClose={() => setCloseModal(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.shop.cash.close.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.shop.cash.close.subtitle")}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.cash.close.countedCash")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} />
              <div className="mt-2 text-xs text-gray-600">{t("app.shop.cash.close.diffPreview")}</div>
              <div className="mt-1 text-sm font-semibold text-gray-900 tabular">{formatMoney(toMoneyString(Number(countedCash) - expectedLive), sellCurrencyCode)}</div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.cash.field.note")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} placeholder={t("app.shop.cash.field.note.placeholder")} />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setCloseModal(false)}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-gray-900 px-5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              disabled={closing}
              onClick={() => void closeShift()}
            >
              {closing ? t("app.shop.cash.action.working") : t("app.shop.cash.action.close")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={detailsOpen} onClose={() => setDetailsOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">{t("app.shop.cash.details.title")}</div>
              <div className="mt-2 text-sm text-gray-700">{detailsSession ? new Date(detailsSession.openedAt).toLocaleString() : "—"}</div>
            </div>
            {detailsSession ? (
              <a
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                href={`/t/${props.tenantSlug}/pharmacy/cash/${encodeURIComponent(detailsSession.id)}/print?paper=a4`}
                target="_blank"
                rel="noreferrer"
              >
                {t("app.shop.cash.action.print")}
              </a>
            ) : null}
          </div>

          {detailsLoading ? (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">{t("common.loading")}</div>
          ) : detailsSession ? (
            <div className="mt-6 space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Stat label={t("app.shop.cash.print.openingCash")} value={formatMoney(detailsSession.openingCash, sellCurrencyCode)} />
                <Stat label={t("app.shop.cash.print.expectedCash")} value={formatMoney(detailsSession.expectedCashLive, sellCurrencyCode)} />
                <Stat label={t("app.shop.cash.print.discrepancy")} value={formatMoney(detailsSession.discrepancy, sellCurrencyCode)} />
              </div>
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900">{t("app.shop.cash.details.events")}</div>
                {detailsSession.events.length === 0 ? (
                  <div className="mt-3 text-sm text-gray-600">{t("app.shop.cash.current.noActivity")}</div>
                ) : (
                  <div className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                    {detailsSession.events.slice(0, 20).map((e) => (
                      <div key={e.id} className="flex items-start justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900">{e.type === "cash_in" ? t("app.shop.cash.event.cashIn") : t("app.shop.cash.event.cashOut")}</div>
                          <div className="mt-1 text-xs text-gray-600">
                            {new Date(e.createdAt).toLocaleString()}
                            {e.note?.trim() ? ` • ${e.note.trim()}` : ""}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-sm font-semibold text-gray-900 tabular">{formatMoney(e.amount, sellCurrencyCode)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">{t("errors.notFound")}</div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <div className="text-xs font-medium text-gray-600">{props.label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900 tabular">{props.value}</div>
    </div>
  );
}

function Mini(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-[11px] font-medium text-gray-600">{props.label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900 tabular">{props.value}</div>
    </div>
  );
}

