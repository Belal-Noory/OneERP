"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };
type Currency = { id: string; code: string; name: string; isActive: boolean };
type CurrenciesResponse = { data: Currency[] };

type LedgerEvent = {
  source: string;
  eventId: string;
  eventDate: string;
  occurredAt: string;
  ref: string | null;
  currencyCode: string;
  amountSigned: string;
  note: string | null;
  accountId: string;
  accountType: string;
  accountName: string;
};

type LedgerResponse = { data: { items: LedgerEvent[]; page: number; pageSize: number; total: number } };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function MspLedgerClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const activeCurrencies = useMemo(() => currencies.filter((c) => c.isActive), [currencies]);

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return isoDate(d);
  });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [currencyCode, setCurrencyCode] = useState<string>("all");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);
  const [items, setItems] = useState<LedgerEvent[]>([]);

  const loadTenant = useCallback(async () => {
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
      setTenantId(membership.tenantId);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [props.tenantSlug]);

  const loadCurrencies = useCallback(async () => {
    if (!tenantId) return;
    setErrorKey(null);
    try {
      const res = await apiFetch("/api/msp/currencies", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as CurrenciesResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      setCurrencies((json as CurrenciesResponse).data ?? []);
    } catch {
      setErrorKey("errors.internal");
    }
  }, [tenantId]);

  const loadLedger = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("pageSize", String(pageSize));
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (currencyCode !== "all") p.set("currencyCode", currencyCode);

      const res = await apiFetch(`/api/msp/ledger/events?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as LedgerResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const data = (json as LedgerResponse).data;
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? page);
      setPageSize(data.pageSize ?? pageSize);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [currencyCode, from, page, pageSize, tenantId, to]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  useEffect(() => {
    void loadCurrencies();
  }, [loadCurrencies]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  useEffect(() => {
    setPage(1);
  }, [from, to, currencyCode, pageSize]);

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">{t("common.loading")}</div>;
  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold">{t("app.msp.ledger.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.msp.ledger.subtitle")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => void loadLedger()}>
              {t("common.button.refresh")}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-6">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.ledger.filter.from")}</label>
            <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.ledger.filter.to")}</label>
            <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.ledger.filter.currency")}</label>
            <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
              <option value="all">{t("common.filter.all")}</option>
              {activeCurrencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3 flex items-end justify-end gap-2 text-sm text-gray-700">
            <button type="button" className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t("common.pagination.prev")}
            </button>
            <span className="tabular-nums">
              {page}/{pages}
            </span>
            <button type="button" className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>
              {t("common.pagination.next")}
            </button>
            <select className="h-9 rounded-xl border border-gray-200 bg-white px-2 text-sm" value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))}>
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">{t("app.msp.ledger.table.time")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.ledger.table.source")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.ledger.table.account")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.ledger.table.ref")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.ledger.table.currency")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.ledger.table.amount")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.ledger.table.note")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                  {t("app.msp.ledger.empty")}
                </td>
              </tr>
            ) : (
              items.map((e) => {
                const signed = num(e.amountSigned);
                const directionLabel = signed >= 0 ? t("app.msp.ledger.direction.in") : t("app.msp.ledger.direction.out");
                const abs = Math.abs(signed).toFixed(2);
                const sourceKey = `app.msp.ledger.source.${e.source}`;
                const sourceLabel = (() => {
                  const v = t(sourceKey);
                  return v === sourceKey ? e.source : v;
                })();
                return (
                  <tr key={`${e.source}-${e.eventId}`} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 tabular-nums">{new Date(e.occurredAt).toLocaleString()}</td>
                    <td className="px-4 py-3 text-gray-700">{sourceLabel}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-gray-900">{e.accountName}</div>
                        <div className="truncate text-xs text-gray-500">{e.accountType?.toUpperCase()}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{e.ref ?? ""}</td>
                    <td className="px-4 py-3 text-gray-700">{e.currencyCode}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                      <span className="text-xs text-gray-500">{directionLabel}</span> {abs}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      <div className="max-w-[520px] truncate">{e.note ?? ""}</div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
