"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };
type Currency = { id: string; code: string; name: string; isActive: boolean };
type CurrenciesResponse = { data: Currency[] };
type Partner = { id: string; name: string; phone: string | null; isActive: boolean };
type PartnersResponse = { data: Partner[] };
type PartnerBalancesResponse = { data: Array<{ partnerId: string; balances: Record<string, string> }> };
type Account = { id: string; type: "cash" | "bank" | string; name: string; currencyCode: string; isActive: boolean; balance: string };
type AccountsResponse = { data: Account[] };

type Settlement = {
  id: string;
  settlementDate: string;
  partnerId: string;
  partnerName: string | null;
  direction: string;
  currencyCode: string;
  amount: string;
  note: string | null;
  createdAt: string;
};
type SettlementsResponse = { data: { items: Settlement[]; page: number; pageSize: number; total: number } };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function moneySign(v: string | null | undefined): "neg" | "zero" | "pos" {
  const s = (v ?? "").trim();
  if (!s) return "zero";
  const neg = s.startsWith("-");
  const abs = neg ? s.slice(1) : s;
  const digitsOnly = abs.replace(".", "").replace(/0/g, "");
  if (!digitsOnly) return "zero";
  return neg ? "neg" : "pos";
}

function moneyAbs(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  if (!s) return "0";
  return s.startsWith("-") ? s.slice(1) : s;
}

export function MspSettlementsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const activeCurrencies = useMemo(() => currencies.filter((c) => c.isActive), [currencies]);
  const activePartners = useMemo(() => partners.filter((p) => p.isActive), [partners]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const activeAccounts = useMemo(() => accounts.filter((a) => a.isActive), [accounts]);

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return isoDate(d);
  });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [partnerId, setPartnerId] = useState<string>("all");
  const [currencyCode, setCurrencyCode] = useState<string>("all");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);
  const [items, setItems] = useState<Settlement[]>([]);
  const [quickSettleMsgKey, setQuickSettleMsgKey] = useState<string | null>(null);
  const [quickSettleLoading, setQuickSettleLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [partnerBalance, setPartnerBalance] = useState<string>("");
  const [partnerBalanceLoading, setPartnerBalanceLoading] = useState(false);
  const [prefillApplied, setPrefillApplied] = useState(false);
  const [form, setForm] = useState<{ partnerId: string; direction: "in" | "out"; currencyCode: string; accountId: string; settlementDate: string; amount: string; note: string }>({
    partnerId: "",
    direction: "in",
    currencyCode: "AFN",
    accountId: "",
    settlementDate: isoDate(new Date()),
    amount: "",
    note: ""
  });

  const accountsForFormCurrency = useMemo(() => activeAccounts.filter((a) => a.currencyCode === form.currencyCode), [activeAccounts, form.currencyCode]);

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

  const loadSetup = useCallback(async () => {
    if (!tenantId) return;
    setErrorKey(null);
    try {
      const [currRes, partnerRes, accountsRes] = await Promise.all([
        apiFetch("/api/msp/currencies", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/msp/hawala/partners", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/msp/accounts", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
      ]);
      const currJson = (await currRes.json()) as CurrenciesResponse | { error?: { message_key?: string } };
      const partnerJson = (await partnerRes.json()) as PartnersResponse | { error?: { message_key?: string } };
      const accountsJson = (await accountsRes.json()) as AccountsResponse | { error?: { message_key?: string } };
      if (!currRes.ok) {
        setErrorKey((currJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      if (!partnerRes.ok) {
        setErrorKey((partnerJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      if (!accountsRes.ok) {
        setErrorKey((accountsJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      setCurrencies((currJson as CurrenciesResponse).data ?? []);
      setPartners((partnerJson as PartnersResponse).data ?? []);
      setAccounts(((accountsJson as AccountsResponse).data ?? []).filter((a) => a.type === "cash" || a.type === "bank"));
    } catch {
      setErrorKey("errors.internal");
    }
  }, [tenantId]);

  const loadSettlements = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("pageSize", String(pageSize));
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (partnerId !== "all") p.set("partnerId", partnerId);
      if (currencyCode !== "all") p.set("currencyCode", currencyCode);

      const res = await apiFetch(`/api/msp/settlements?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as SettlementsResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const data = (json as SettlementsResponse).data;
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? page);
      setPageSize(data.pageSize ?? pageSize);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [currencyCode, from, page, pageSize, partnerId, tenantId, to]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    void loadSettlements();
  }, [loadSettlements]);

  useEffect(() => {
    if (!tenantId) return;
    if (loading) return;
    if (prefillApplied) return;
    if (currencies.length === 0 || partners.length === 0 || accounts.length === 0) return;
    const sp = new URLSearchParams(window.location.search);
    const prePartnerId = sp.get("partnerId") ?? "";
    const preCurrencyCode = (sp.get("currencyCode") ?? "").toUpperCase();
    const preDirection = sp.get("direction") as "in" | "out" | null;
    const preAmount = sp.get("amount") ?? "";
    if (!prePartnerId || !preCurrencyCode || !preDirection || !preAmount) {
      setPrefillApplied(true);
      return;
    }
    const currency = activeCurrencies.find((c) => c.code === preCurrencyCode)?.code ?? activeCurrencies[0]?.code ?? preCurrencyCode;
    const candidates = activeAccounts.filter((a) => a.currencyCode === currency);
    const preferred = candidates.find((a) => a.type === "cash") ?? candidates[0];
    setForm({
      partnerId: prePartnerId,
      direction: preDirection,
      currencyCode: currency,
      accountId: preferred?.id ?? "",
      settlementDate: isoDate(new Date()),
      amount: preAmount,
      note: t("app.msp.settlements.prefilledFromPartnerStatement")
    });
    setModalOpen(true);
    setPrefillApplied(true);
  }, [accounts.length, activeAccounts, activeCurrencies, currencies.length, loading, partners.length, prefillApplied, tenantId, t]);

  useEffect(() => {
    setPage(1);
  }, [from, to, partnerId, currencyCode, pageSize]);

  useEffect(() => {
    if (!modalOpen) return;
    if (form.accountId && accountsForFormCurrency.some((a) => a.id === form.accountId)) return;
    const preferred = accountsForFormCurrency.find((a) => a.type === "cash") ?? accountsForFormCurrency[0];
    setForm((p) => ({ ...p, accountId: preferred?.id ?? "" }));
  }, [accountsForFormCurrency, form.accountId, modalOpen]);

  useEffect(() => {
    if (!tenantId) return;
    if (!modalOpen) return;
    if (!form.partnerId) {
      setPartnerBalance("");
      return;
    }
    let cancelled = false;
    setPartnerBalanceLoading(true);
    setPartnerBalance("");
    void (async () => {
      try {
        const p = new URLSearchParams();
        p.set("ids", form.partnerId);
        p.set("currencyCodes", form.currencyCode);
        const res = await apiFetch(`/api/msp/hawala/partners/balances?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as PartnerBalancesResponse;
        const row = (json.data ?? [])[0];
        const bal = row?.balances?.[form.currencyCode] ?? "";
        if (!cancelled) setPartnerBalance(bal);
      } finally {
        if (!cancelled) setPartnerBalanceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [form.currencyCode, form.partnerId, modalOpen, tenantId]);

  const canSave = useMemo(() => {
    if (saving) return false;
    if (!form.partnerId) return false;
    if (!form.accountId) return false;
    return true;
  }, [form.accountId, form.partnerId, saving]);

  const openCreate = () => {
    const currency = activeCurrencies.find((c) => c.code === "AFN")?.code ?? activeCurrencies[0]?.code ?? "AFN";
    const candidates = activeAccounts.filter((a) => a.currencyCode === currency);
    const preferred = candidates.find((a) => a.type === "cash") ?? candidates[0];
    setForm({
      partnerId: activePartners[0]?.id ?? "",
      direction: "in",
      currencyCode: currency,
      accountId: preferred?.id ?? "",
      settlementDate: isoDate(new Date()),
      amount: "",
      note: ""
    });
    setQuickSettleMsgKey(null);
    setModalOpen(true);
  };

  const quickSettle = useCallback(async () => {
    if (!tenantId) return;
    if (partnerId === "all" || currencyCode === "all") {
      setQuickSettleMsgKey("app.msp.settlements.quickSettle.selectFilters");
      return;
    }
    setQuickSettleLoading(true);
    setQuickSettleMsgKey(null);
    try {
      const p = new URLSearchParams();
      p.set("ids", partnerId);
      p.set("currencyCodes", currencyCode);
      const res = await apiFetch(`/api/msp/hawala/partners/balances?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      if (!res.ok) {
        setQuickSettleMsgKey("errors.internal");
        return;
      }
      const json = (await res.json()) as PartnerBalancesResponse;
      const row = (json.data ?? [])[0];
      const bal = row?.balances?.[currencyCode] ?? "0";
      const sign = moneySign(bal);
      if (sign === "zero") {
        setQuickSettleMsgKey("app.msp.settlements.quickSettle.zero");
        return;
      }

      const direction = sign === "neg" ? "in" : "out";
      const amount = moneyAbs(bal);
      const candidates = activeAccounts.filter((a) => a.currencyCode === currencyCode);
      const preferred = candidates.find((a) => a.type === "cash") ?? candidates[0];
      setForm({
        partnerId,
        direction,
        currencyCode,
        accountId: preferred?.id ?? "",
        settlementDate: isoDate(new Date()),
        amount,
        note: t("app.msp.settlements.prefilledFromPartnerStatement")
      });
      setModalOpen(true);
    } catch {
      setQuickSettleMsgKey("errors.internal");
    } finally {
      setQuickSettleLoading(false);
    }
  }, [activeAccounts, currencyCode, partnerId, t, tenantId]);

  const save = async () => {
    if (!tenantId) return;
    if (!form.accountId) return;
    setSaving(true);
    setErrorKey(null);
    try {
      const payload = {
        partnerId: form.partnerId,
        direction: form.direction,
        currencyCode: form.currencyCode,
        accountId: form.accountId,
        amount: form.amount,
        settlementDate: form.settlementDate,
        note: form.note
      };
      const res = await apiFetch("/api/msp/settlements", { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify(payload) });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setModalOpen(false);
      await loadSettlements();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">{t("common.loading")}</div>;
  }
  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold">{t("app.msp.settlements.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.msp.settlements.subtitle")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => void loadSettlements()}>
              {t("common.button.refresh")}
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              disabled={quickSettleLoading || partnerId === "all" || currencyCode === "all"}
              onClick={() => void quickSettle()}
            >
              {quickSettleLoading ? t("common.working") : t("app.msp.settlements.quickSettle")}
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800" onClick={openCreate}>
              {t("app.msp.settlements.add")}
            </button>
          </div>
        </div>
        {quickSettleMsgKey ? <div className="mt-3 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">{t(quickSettleMsgKey)}</div> : null}

        <div className="mt-6 grid gap-3 md:grid-cols-6">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.settlements.filter.from")}</label>
            <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.settlements.filter.to")}</label>
            <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.settlements.filter.partner")}</label>
            <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
              <option value="all">{t("common.filter.all")}</option>
              {activePartners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.settlements.filter.currency")}</label>
            <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)}>
              <option value="all">{t("common.filter.all")}</option>
              {activeCurrencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end justify-end gap-2 text-sm text-gray-700">
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
              <th className="px-4 py-3 text-left">{t("app.msp.settlements.table.date")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.settlements.table.partner")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.settlements.table.direction")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.settlements.table.currency")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.settlements.table.amount")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.settlements.table.note")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                  {t("app.msp.settlements.empty")}
                </td>
              </tr>
            ) : (
              items.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700">{s.settlementDate}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{s.partnerName ?? ""}</td>
                  <td className="px-4 py-3 text-gray-700">{s.direction === "in" ? t("app.msp.settlements.direction.in") : s.direction === "out" ? t("app.msp.settlements.direction.out") : s.direction}</td>
                  <td className="px-4 py-3 text-gray-700">{s.currencyCode}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{s.amount}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="max-w-[520px] truncate">{s.note ?? ""}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => (!saving ? setModalOpen(false) : null)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.msp.settlements.add")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.msp.settlements.add.subtitle")}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.settlements.field.partner")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={form.partnerId} onChange={(e) => setForm((p) => ({ ...p, partnerId: e.target.value }))} disabled={saving}>
                {activePartners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              {form.partnerId ? (
                <div className="mt-1 text-xs text-gray-600 tabular-nums">
                  {t("app.msp.hawala.partner.balance")}: {partnerBalanceLoading ? t("common.loading") : partnerBalance || "0"}
                </div>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.settlements.field.direction")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={form.direction} onChange={(e) => setForm((p) => ({ ...p, direction: e.target.value as "in" | "out" }))} disabled={saving}>
                <option value="in">{t("app.msp.settlements.direction.in")}</option>
                <option value="out">{t("app.msp.settlements.direction.out")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.settlements.field.date")}</label>
              <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={form.settlementDate} onChange={(e) => setForm((p) => ({ ...p, settlementDate: e.target.value }))} disabled={saving} />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.settlements.field.currency")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={form.currencyCode} onChange={(e) => setForm((p) => ({ ...p, currencyCode: e.target.value }))} disabled={saving}>
                {activeCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.settlements.field.account")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={form.accountId} onChange={(e) => setForm((p) => ({ ...p, accountId: e.target.value }))} disabled={saving}>
                {accountsForFormCurrency.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.type.toUpperCase()} — {a.name} ({a.balance})
                  </option>
                ))}
              </select>
              {accountsForFormCurrency.length === 0 ? <div className="mt-1 text-xs text-red-600">{t("app.msp.accounts.missingForCurrency")}</div> : null}
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.settlements.field.amount")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm text-right tabular-nums" inputMode="decimal" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} disabled={saving} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.settlements.field.note")}</label>
              <textarea className="mt-1 min-h-[90px] w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} disabled={saving} />
            </div>
          </div>

          {errorKey ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{t(errorKey)}</div> : null}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setModalOpen(false)} disabled={saving}>
              {t("common.button.cancel")}
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60" onClick={() => void save()} disabled={!canSave}>
              {saving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
