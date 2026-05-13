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

type ShopSettingsResponse = { data: { sellCurrencyCode: string } };

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

export function CashSessionsClient(props: { tenantSlug: string }) {
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

  useEffect(() => {
    let cancelled = false;
    async function loadBase() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const [locRes, settingsRes] = await Promise.all([
          apiFetch("/api/shop/locations", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch("/api/shop/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);
        if (!locRes.ok) {
          setErrorKey("errors.permissionDenied");
          return;
        }
        const locJson = (await locRes.json()) as LocationsResponse;
        const nextLocations = locJson.data ?? [];
        if (!cancelled) {
          setLocations(nextLocations);
          setLocationId((prev) => prev || nextLocations[0]?.id || "");
        }
        if (settingsRes.ok) {
          const settingsJson = (await settingsRes.json()) as ShopSettingsResponse;
          if (!cancelled) setSellCurrencyCode(settingsJson.data.sellCurrencyCode ?? "USD");
        }
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadBase();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const refreshCurrent = useCallback(async () => {
    if (!tenantId || !locationId) return;
    try {
      const res = await apiFetch(`/api/shop/cash-sessions/current?locationId=${encodeURIComponent(locationId)}`, {
        cache: "no-store",
        headers: { "X-Tenant-Id": tenantId }
      });
      if (!res.ok) return;
      const json = (await res.json()) as CurrentCashSessionResponse;
      const id = json.data?.id ?? null;
      setCurrentSessionId(id);
      if (!id) {
        setCurrentSession(null);
        return;
      }
      const detailRes = await apiFetch(`/api/shop/cash-sessions/${id}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      if (!detailRes.ok) return;
      const detailJson = (await detailRes.json()) as GetCashSessionResponse;
      setCurrentSession(detailJson.data);
    } catch {}
  }, [locationId, tenantId]);

  const refreshList = useCallback(
    async (nextPage: number) => {
      if (!tenantId) return;
      try {
        const p = new URLSearchParams();
        p.set("page", String(nextPage));
        p.set("pageSize", String(pageSize));
        if (locationId) p.set("locationId", locationId);
        if (statusFilter !== "all") p.set("status", statusFilter);
        const res = await apiFetch(`/api/shop/cash-sessions?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as ListCashSessionsResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const data = (json as ListCashSessionsResponse).data;
        setSessions(data.items ?? []);
        setTotal(data.total ?? 0);
        setPage(data.page ?? nextPage);
      } catch {
        setErrorKey("errors.internal");
      }
    },
    [locationId, statusFilter, tenantId]
  );

  const openDetails = useCallback(
    async (sessionId: string) => {
      if (!tenantId) return;
      setDetailsOpen(true);
      setDetailsLoading(true);
      setDetailsSession(null);
      try {
        const res = await apiFetch(`/api/shop/cash-sessions/${sessionId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as GetCashSessionResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        setDetailsSession((json as GetCashSessionResponse).data);
      } catch {
        setErrorKey("errors.internal");
      } finally {
        setDetailsLoading(false);
      }
    },
    [tenantId]
  );

  useEffect(() => {
    void refreshCurrent();
    void refreshList(1);
  }, [refreshCurrent, refreshList]);

  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total]);

  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.shop.cash.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.shop.cash.subtitle")}</div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => {
                void refreshCurrent();
                void refreshList(1);
              }}
            >
              {t("common.button.refresh")}
            </button>
            <Link className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800" href={`/t/${props.tenantSlug}/shop/pos`}>
              {t("app.shop.cash.action.goPos")}
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.cash.field.location")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              disabled={loading || locations.length === 0}
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold">{t("app.shop.cash.current.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.shop.cash.current.subtitle")}</div>
          </div>
          {currentSession ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
                href={`/t/${props.tenantSlug}/shop/cash/${currentSession.id}/print?paper=thermal80`}
                target="_blank"
                rel="noreferrer"
              >
                {t("app.shop.cash.action.print")}
              </Link>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700"
                onClick={() => {
                  setCashAmount("0.00");
                  setCashNote("");
                  setCashModal({ type: "cash_in" });
                }}
              >
                {t("app.shop.cash.action.cashIn")}
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
                onClick={() => {
                  setCashAmount("0.00");
                  setCashNote("");
                  setCashModal({ type: "cash_out" });
                }}
              >
                {t("app.shop.cash.action.cashOut")}
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
                onClick={() => {
                  setCountedCash(currentSession.expectedCashLive ?? "0.00");
                  setCloseNote("");
                  setCloseModal(true);
                }}
              >
                {t("app.shop.cash.action.close")}
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              onClick={() => {
                setOpeningCash("0.00");
                setOpenNote("");
                setOpenModal(true);
              }}
              disabled={!locationId}
            >
              {t("app.shop.cash.action.open")}
            </button>
          )}
        </div>

        {currentSession ? (
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Stat label={t("app.shop.cash.current.openingCash")} value={formatMoney(currentSession.openingCash, sellCurrencyCode)} />
            <Stat label={t("app.shop.cash.current.expectedCash")} value={formatMoney(currentSession.expectedCashLive, sellCurrencyCode)} />
            <Stat label={t("app.shop.cash.current.netCash")} value={formatMoney(currentSession.paymentsTotal, sellCurrencyCode)} />
          </div>
        ) : (
          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-700">{t("app.shop.cash.current.none")}</div>
        )}

        {currentSession ? (
          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-900">{t("app.shop.cash.current.activity")}</div>
            {currentSession.events.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-600">{t("app.shop.cash.current.noActivity")}</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {currentSession.events.slice(0, 10).map((e) => (
                  <div key={e.id} className="flex items-start justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">
                        {e.type === "cash_in" ? t("app.shop.cash.event.cashIn") : t("app.shop.cash.event.cashOut")}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        {new Date(e.createdAt).toLocaleString()}
                        {e.note?.trim() ? ` • ${e.note.trim()}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-semibold text-gray-900">{formatMoney(e.amount, sellCurrencyCode)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">{t("app.shop.cash.history.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.shop.cash.history.subtitle")}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.cash.filter.status")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as "all" | "open" | "closed");
                void refreshList(1);
              }}
            >
              <option value="all">{t("app.shop.cash.filter.status.all")}</option>
              <option value="open">{t("app.shop.cash.status.open")}</option>
              <option value="closed">{t("app.shop.cash.status.closed")}</option>
            </select>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="min-w-[860px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.cash.table.location")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.cash.table.openedAt")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.cash.table.status")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.cash.table.expected")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.cash.table.counted")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.cash.table.diff")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.cash.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {sessions.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={7}>
                    {t("app.shop.cash.history.empty")}
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{s.location?.name ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{new Date(s.openedAt).toLocaleString()}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{t(`app.shop.cash.status.${s.status}`)}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900 tabular">{formatMoney(s.expectedCash, sellCurrencyCode)}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900 tabular">{formatMoney(s.countedCash, sellCurrencyCode)}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right tabular">
                      <span className={Number(s.discrepancy || "0") === 0 ? "text-gray-700" : Number(s.discrepancy || "0") > 0 ? "text-emerald-700" : "text-red-700"}>
                        {formatMoney(s.discrepancy, sellCurrencyCode)}
                      </span>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50"
                          onClick={() => void openDetails(s.id)}
                        >
                          {t("app.shop.cash.action.view")}
                        </button>
                        <Link
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50"
                          href={`/t/${props.tenantSlug}/shop/cash/${s.id}/print?paper=a4`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {t("app.shop.cash.action.print")}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          <div className="text-gray-600">
            {t("app.shop.cash.pagination.page")} {page} / {pages}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              disabled={page <= 1}
              onClick={() => void refreshList(Math.max(1, page - 1))}
            >
              {t("app.shop.cash.pagination.prev")}
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              disabled={page >= pages}
              onClick={() => void refreshList(Math.min(pages, page + 1))}
            >
              {t("app.shop.cash.pagination.next")}
            </button>
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

          <div className="mt-8 flex flex-col gap-3 md:flex-row md:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setOpenModal(false)} disabled={opening}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={opening || !tenantId || !locationId}
              onClick={async () => {
                if (!tenantId || !locationId) return;
                setOpening(true);
                setErrorKey(null);
                try {
                  const res = await apiFetch("/api/shop/cash-sessions/open", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                    body: JSON.stringify({ locationId, openingCash: openingCash.trim() || "0.00", note: openNote.trim() || undefined })
                  });
                  const json = (await res.json()) as { error?: { message_key?: string } };
                  if (!res.ok) {
                    setErrorKey(json.error?.message_key ?? "errors.internal");
                    return;
                  }
                  setOpenModal(false);
                  await refreshCurrent();
                  await refreshList(1);
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setOpening(false);
                }
              }}
            >
              {opening ? t("app.shop.cash.action.working") : t("app.shop.cash.action.open")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={cashModal !== null} onClose={() => setCashModal(null)}>
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
          <div className="mt-8 flex flex-col gap-3 md:flex-row md:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setCashModal(null)} disabled={postingCash}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={postingCash || !tenantId || !currentSessionId || cashModal === null}
              onClick={async () => {
                if (!tenantId || !currentSessionId || !cashModal) return;
                setPostingCash(true);
                setErrorKey(null);
                try {
                  const endpoint = cashModal.type === "cash_in" ? "cash-in" : "cash-out";
                  const res = await apiFetch(`/api/shop/cash-sessions/${currentSessionId}/${endpoint}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                    body: JSON.stringify({ amount: cashAmount.trim() || "0.00", note: cashNote.trim() || undefined })
                  });
                  const json = (await res.json()) as { error?: { message_key?: string } };
                  if (!res.ok) {
                    setErrorKey(json.error?.message_key ?? "errors.internal");
                    return;
                  }
                  setCashModal(null);
                  await refreshCurrent();
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setPostingCash(false);
                }
              }}
            >
              {postingCash ? t("app.shop.cash.action.working") : t("common.button.submit")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          setDetailsSession(null);
        }}
      >
        <div className="p-6 md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xl font-semibold">{t("app.shop.cash.details.title")}</div>
              <div className="mt-2 text-sm text-gray-700">{detailsSession?.location?.name ?? "—"}</div>
            </div>
            {detailsSession ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/shop/cash/${detailsSession.id}/print?paper=thermal80`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.shop.cash.action.print")}
                </Link>
              </div>
            ) : null}
          </div>

          {detailsLoading ? (
            <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-700">{t("common.loading")}</div>
          ) : detailsSession ? (
            <>
              <div className="mt-6 grid gap-3 md:grid-cols-3">
                <Stat label={t("app.shop.cash.current.openingCash")} value={formatMoney(detailsSession.openingCash, sellCurrencyCode)} />
                <Stat
                  label={t("app.shop.cash.current.expectedCash")}
                  value={formatMoney(detailsSession.status === "closed" ? detailsSession.expectedCash : detailsSession.expectedCashLive, sellCurrencyCode)}
                />
                <Stat label={t("app.shop.cash.current.netCash")} value={formatMoney(detailsSession.paymentsTotal, sellCurrencyCode)} />
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2 text-sm">
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-medium text-gray-600">{t("app.shop.cash.table.openedAt")}</div>
                  <div className="mt-2 font-semibold text-gray-900">{new Date(detailsSession.openedAt).toLocaleString()}</div>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-medium text-gray-600">{t("app.shop.cash.details.closedAt")}</div>
                  <div className="mt-2 font-semibold text-gray-900">{detailsSession.closedAt ? new Date(detailsSession.closedAt).toLocaleString() : "—"}</div>
                </div>
              </div>

              <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-900">{t("app.shop.cash.details.events")}</div>
                {detailsSession.events.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-600">{t("app.shop.cash.current.noActivity")}</div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {detailsSession.events.map((e) => (
                      <div key={e.id} className="flex items-start justify-between gap-4 px-4 py-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900">
                            {e.type === "cash_in" ? t("app.shop.cash.event.cashIn") : t("app.shop.cash.event.cashOut")}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {new Date(e.createdAt).toLocaleString()}
                            {e.note?.trim() ? ` • ${e.note.trim()}` : ""}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-sm font-semibold text-gray-900">{formatMoney(e.amount, sellCurrencyCode)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-700">{t("errors.internal")}</div>
          )}

          <div className="mt-8 flex justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setDetailsOpen(false)}>
              {t("common.button.close")}
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
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.cash.current.expectedCash")}</label>
              <div className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm flex items-center">
                {formatMoney(currentSession?.expectedCashLive ?? "0.00", sellCurrencyCode)}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.cash.field.note")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={closeNote} onChange={(e) => setCloseNote(e.target.value)} placeholder={t("app.shop.cash.field.note.placeholder")} />
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between text-sm">
              <div className="text-gray-700">{t("app.shop.cash.close.diffPreview")}</div>
              <div className="font-semibold text-gray-900">
                {formatMoney(
                  toMoneyString(Number(countedCash || "0") - Number(currentSession?.expectedCashLive ?? "0")),
                  sellCurrencyCode
                )}
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 md:flex-row md:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setCloseModal(false)} disabled={closing}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              disabled={closing || !tenantId || !currentSessionId}
              onClick={async () => {
                if (!tenantId || !currentSessionId) return;
                setClosing(true);
                setErrorKey(null);
                try {
                  const res = await apiFetch(`/api/shop/cash-sessions/${currentSessionId}/close`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                    body: JSON.stringify({ countedCash: countedCash.trim() || "0.00", note: closeNote.trim() || undefined })
                  });
                  const json = (await res.json()) as { error?: { message_key?: string } };
                  if (!res.ok) {
                    setErrorKey(json.error?.message_key ?? "errors.internal");
                    return;
                  }
                  setCloseModal(false);
                  await refreshCurrent();
                  await refreshList(1);
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setClosing(false);
                }
              }}
            >
              {closing ? t("app.shop.cash.action.working") : t("app.shop.cash.action.close")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Stat(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="text-xs font-medium text-gray-600">{props.label}</div>
      <div className="mt-1 text-lg font-semibold text-gray-900 tabular">{props.value}</div>
    </div>
  );
}
