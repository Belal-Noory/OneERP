"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };
type ComplianceThreshold = { currencyCode: string; amount: string };
type SettingsResponse = {
  data: {
    baseCurrencyCode: string;
    compliance?: {
      kyc?: { enforceMode?: "always" | "above_threshold"; requireCustomerAboveThreshold?: boolean; requiredAbove?: ComplianceThreshold[] };
      aml?: { largeTx?: ComplianceThreshold[]; structuringWindowHours?: number; structuringMinCount?: number };
    };
  };
};
type Currency = { id: string; code: string; name: string; symbol: string | null; decimals: number; isActive: boolean; updatedAt: string };
type CurrenciesResponse = { data: Currency[] };
type Account = { id: string; type: "cash" | "bank" | string; name: string; currencyCode: string; isActive: boolean; balance: string };
type AccountsResponse = { data: Account[] };

type Customer = { id: string; name: string; phone: string | null; isActive: boolean; kycStatus: string; kycVerifiedAt: string | null };
type CustomersResponse = { data: { items: Customer[] } };

type Ticket = {
  id: string;
  ticketNumber: number;
  type: "buy" | "sell" | string;
  baseCode: string;
  quoteCode: string;
  effectiveDate: string;
  quoteAmount: string;
  rate: string;
  baseAmount: string;
  feeBase: string;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  createdAt: string;
};

type TicketListResponse = { data: { items: Ticket[]; page: number; pageSize: number; total: number } };
type RateItem = { id: string; baseCode: string; quoteCode: string; buyRate: string; sellRate: string };
type RatesResponse = { data: { effectiveDate: string; items: RateItem[] } };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function num(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function MspExchangeClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [baseCode, setBaseCode] = useState("AFN");
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [compliance, setCompliance] = useState<SettingsResponse["data"]["compliance"] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const activeCustomers = useMemo(() => customers.filter((c) => c.isActive), [customers]);

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return isoDate(d);
  });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "buy" | "sell">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

  const [tickets, setTickets] = useState<Ticket[]>([]);

  const [createQuoteCode, setCreateQuoteCode] = useState("USD");

  const activeCurrencies = useMemo(() => currencies.filter((c) => c.isActive), [currencies]);
  const quoteCurrencies = useMemo(() => activeCurrencies.filter((c) => c.code !== baseCode), [activeCurrencies, baseCode]);
  const activeAccounts = useMemo(() => accounts.filter((a) => a.isActive), [accounts]);
  const baseAccounts = useMemo(() => activeAccounts.filter((a) => a.currencyCode === baseCode), [activeAccounts, baseCode]);
  const quoteAccounts = useMemo(() => activeAccounts.filter((a) => a.currencyCode === createQuoteCode), [activeAccounts, createQuoteCode]);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createType, setCreateType] = useState<"buy" | "sell">("buy");
  const [createDate, setCreateDate] = useState(() => isoDate(new Date()));
  const [createQuoteAmount, setCreateQuoteAmount] = useState("");
  const [createRate, setCreateRate] = useState("");
  const [createFeeBase, setCreateFeeBase] = useState("0");
  const [createBaseAccountId, setCreateBaseAccountId] = useState("");
  const [createQuoteAccountId, setCreateQuoteAccountId] = useState("");
  const [createCustomerId, setCreateCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [note, setNote] = useState("");

  const [rateMap, setRateMap] = useState<Map<string, { buyRate: string; sellRate: string }>>(new Map());

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
    setLoading(true);
    setErrorKey(null);
    try {
      const customersParams = new URLSearchParams();
      customersParams.set("page", "1");
      customersParams.set("pageSize", "200");
      customersParams.set("status", "active");

      const [settingsRes, currenciesRes, accountsRes, customersRes] = await Promise.all([
        apiFetch("/api/msp/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/msp/currencies", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/msp/accounts", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch(`/api/msp/customers?${customersParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
      ]);
      const settingsJson = (await settingsRes.json()) as SettingsResponse | { error?: { message_key?: string } };
      const currenciesJson = (await currenciesRes.json()) as CurrenciesResponse | { error?: { message_key?: string } };
      const accountsJson = (await accountsRes.json()) as AccountsResponse | { error?: { message_key?: string } };
      const customersJson = (await customersRes.json()) as CustomersResponse | { error?: { message_key?: string } };
      if (!settingsRes.ok) {
        setErrorKey((settingsJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      if (!currenciesRes.ok) {
        setErrorKey((currenciesJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      if (!accountsRes.ok) {
        setErrorKey((accountsJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      if (!customersRes.ok) {
        setErrorKey((customersJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const base = (settingsJson as SettingsResponse).data.baseCurrencyCode ?? "AFN";
      setBaseCode(base);
      setCompliance(((settingsJson as SettingsResponse).data.compliance ?? null) as SettingsResponse["data"]["compliance"] | null);
      const list = (currenciesJson as CurrenciesResponse).data ?? [];
      setCurrencies(list);
      setAccounts(((accountsJson as AccountsResponse).data ?? []).filter((a) => a.type === "cash" || a.type === "bank"));
      setCustomers((customersJson as CustomersResponse).data.items ?? []);
      const usd = list.find((c) => c.code === "USD" && c.isActive);
      if (usd) setCreateQuoteCode("USD");
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const loadRates = useCallback(async () => {
    if (!tenantId) return;
    setErrorKey(null);
    try {
      const p = new URLSearchParams();
      p.set("date", createDate);
      p.set("baseCode", baseCode);
      const res = await apiFetch(`/api/msp/rates?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as RatesResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const map = new Map<string, { buyRate: string; sellRate: string }>();
      for (const it of (json as RatesResponse).data.items ?? []) {
        map.set(it.quoteCode, { buyRate: it.buyRate, sellRate: it.sellRate });
      }
      setRateMap(map);
    } catch {
      setErrorKey("errors.internal");
    }
  }, [baseCode, createDate, tenantId]);

  const loadTickets = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("pageSize", String(pageSize));
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (q.trim()) p.set("q", q.trim());
      if (typeFilter !== "all") p.set("type", typeFilter);

      const res = await apiFetch(`/api/msp/exchange/tickets?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as TicketListResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const data = (json as TicketListResponse).data;
      setTickets(data.items ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? page);
      setPageSize(data.pageSize ?? pageSize);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [from, page, pageSize, q, tenantId, to, typeFilter]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    if (!tenantId) return;
    void loadTickets();
  }, [loadTickets, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    if (!createOpen) return;
    void loadRates();
  }, [createOpen, loadRates, tenantId]);

  useEffect(() => {
    if (!createOpen) return;
    const r = rateMap.get(createQuoteCode) ?? null;
    if (!r) return;
    setCreateRate(createType === "buy" ? r.buyRate : r.sellRate);
  }, [createOpen, createQuoteCode, createType, rateMap]);

  const baseAmount = useMemo(() => {
    const a = num(createQuoteAmount);
    const r = num(createRate);
    if (!a || !r) return 0;
    return a * r;
  }, [createQuoteAmount, createRate]);

  const totalBase = useMemo(() => {
    const fee = num(createFeeBase);
    return baseAmount + fee;
  }, [baseAmount, createFeeBase]);

  const kycPolicy = useMemo(() => {
    const kyc = compliance?.kyc ?? null;
    const enforceMode = kyc?.enforceMode ?? "always";
    const requireCustomerAboveThreshold = typeof kyc?.requireCustomerAboveThreshold === "boolean" ? kyc.requireCustomerAboveThreshold : true;
    const requiredAbove = kyc?.requiredAbove ?? [];
    const map = new Map<string, number>();
    for (const it of requiredAbove) {
      if (!it?.currencyCode) continue;
      const v = num(String(it.amount ?? ""));
      if (!v || v <= 0) continue;
      map.set(it.currencyCode.toUpperCase(), v);
    }
    const threshold = map.get(baseCode.toUpperCase()) ?? 0;
    return { enforceMode, requireCustomerAboveThreshold, threshold };
  }, [baseCode, compliance]);

  const canCreateTicket = useMemo(() => {
    if (creating) return false;
    if (!createBaseAccountId || !createQuoteAccountId) return false;
    if (baseAccounts.length === 0 || quoteAccounts.length === 0) return false;
    const above = kycPolicy.threshold > 0 ? totalBase >= kycPolicy.threshold : false;
    if (kycPolicy.enforceMode === "above_threshold" && above && kycPolicy.requireCustomerAboveThreshold && !createCustomerId) return false;
    const requireVerified = kycPolicy.enforceMode === "always" ? !!createCustomerId : above && !!createCustomerId;
    if (requireVerified && createCustomerId) {
      const c = activeCustomers.find((x) => x.id === createCustomerId) ?? null;
      if (c && c.kycStatus !== "verified") return false;
    }
    return true;
  }, [activeCustomers, baseAccounts.length, createBaseAccountId, createCustomerId, createQuoteAccountId, creating, kycPolicy.enforceMode, kycPolicy.requireCustomerAboveThreshold, kycPolicy.threshold, quoteAccounts.length, totalBase]);

  const openCreate = useCallback(() => {
    setCreateType("buy");
    setCreateDate(isoDate(new Date()));
    setCreateQuoteAmount("");
    setCreateFeeBase("0");
    setCreateBaseAccountId("");
    setCreateQuoteAccountId("");
    setCreateCustomerId("");
    setCustomerName("");
    setCustomerPhone("");
    setNote("");
    setCreateOpen(true);
  }, []);

  const createTicket = useCallback(async () => {
    if (!tenantId) return;
    setCreating(true);
    setErrorKey(null);
    try {
      const payload = {
        type: createType,
        baseCode,
        quoteCode: createQuoteCode,
        customerId: createCustomerId || undefined,
        effectiveDate: createDate,
        quoteAmount: createQuoteAmount,
        rate: createRate,
        feeBase: createFeeBase,
        baseAccountId: createBaseAccountId,
        quoteAccountId: createQuoteAccountId,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        note: note.trim() || undefined
      };
      const res = await apiFetch("/api/msp/exchange/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { data?: { id: string }; error?: { message_key?: string } };
      if (!res.ok || !json.data?.id) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setCreateOpen(false);
      await loadTickets();
      window.open(`/t/${props.tenantSlug}/msp/exchange/tickets/${encodeURIComponent(json.data.id)}/print`, "_blank", "noopener,noreferrer");
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setCreating(false);
    }
  }, [
    baseCode,
    createBaseAccountId,
    createDate,
    createFeeBase,
    createQuoteAccountId,
    createQuoteAmount,
    createQuoteCode,
    createRate,
    createType,
    createCustomerId,
    customerName,
    customerPhone,
    loadTickets,
    note,
    props.tenantSlug,
    tenantId
  ]);

  const selectedCustomer = useMemo(() => {
    if (!createCustomerId) return null;
    return activeCustomers.find((c) => c.id === createCustomerId) ?? null;
  }, [activeCustomers, createCustomerId]);

  useEffect(() => {
    if (!createOpen) return;
    if (!selectedCustomer) return;
    if (!customerName.trim()) setCustomerName(selectedCustomer.name);
    if (!customerPhone.trim()) setCustomerPhone(selectedCustomer.phone ?? "");
  }, [createOpen, customerName, customerPhone, selectedCustomer]);

  useEffect(() => {
    if (!createOpen) return;
    if (!createBaseAccountId) {
      const preferred = baseAccounts.find((a) => a.type === "cash") ?? baseAccounts[0];
      if (preferred) setCreateBaseAccountId(preferred.id);
    } else if (!baseAccounts.some((a) => a.id === createBaseAccountId)) {
      const preferred = baseAccounts.find((a) => a.type === "cash") ?? baseAccounts[0];
      setCreateBaseAccountId(preferred?.id ?? "");
    }
  }, [baseAccounts, createBaseAccountId, createOpen]);

  useEffect(() => {
    if (!createOpen) return;
    if (!createQuoteAccountId) {
      const preferred = quoteAccounts.find((a) => a.type === "cash") ?? quoteAccounts[0];
      if (preferred) setCreateQuoteAccountId(preferred.id);
    } else if (!quoteAccounts.some((a) => a.id === createQuoteAccountId)) {
      const preferred = quoteAccounts.find((a) => a.type === "cash") ?? quoteAccounts[0];
      setCreateQuoteAccountId(preferred?.id ?? "");
    }
  }, [createOpen, createQuoteAccountId, quoteAccounts]);

  const exportExcel = useCallback(async () => {
    if (!tenantId) return;
    setErrorKey(null);
    try {
      const p = new URLSearchParams();
      p.set("page", "1");
      p.set("pageSize", "200");
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      if (q.trim()) p.set("q", q.trim());
      if (typeFilter !== "all") p.set("type", typeFilter);

      const res = await apiFetch(`/api/msp/exchange/tickets?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as TicketListResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const data = (json as TicketListResponse).data.items ?? [];
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ["Ticket #", "Type", "Date", "Base", "Quote", "Quote Amount", "Rate", "Base Amount", "Fee", "Total Base", "Customer", "Phone", "Created At"],
          ...data.map((r) => [
            r.ticketNumber,
            r.type,
            r.effectiveDate,
            r.baseCode,
            r.quoteCode,
            Number(r.quoteAmount),
            Number(r.rate),
            Number(r.baseAmount),
            Number(r.feeBase),
            Number(r.baseAmount) + Number(r.feeBase),
            r.customerName ?? "",
            r.customerPhone ?? "",
            r.createdAt
          ])
        ]),
        "Tickets"
      );
      XLSX.writeFile(wb, `msp_exchange_${from}_${to}.xlsx`);
    } catch {
      setErrorKey("errors.internal");
    }
  }, [from, q, tenantId, to, typeFilter]);

  if (loading && !tenantId) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card text-sm text-gray-700">{t("common.loading")}</div>;
  }
  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold">{t("app.msp.exchange.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.msp.exchange.subtitle")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => void exportExcel()}
            >
              {t("app.msp.exchange.exportExcel")}
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
              onClick={openCreate}
            >
              {t("app.msp.exchange.newTicket")}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-5">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.exchange.filter.from")}</label>
            <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.exchange.filter.to")}</label>
            <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.exchange.filter.type")}</label>
            <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as "all" | "buy" | "sell")}>
              <option value="all">{t("common.filter.all")}</option>
              <option value="buy">{t("app.msp.exchange.type.buy")}</option>
              <option value="sell">{t("app.msp.exchange.type.sell")}</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.exchange.filter.search")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("app.msp.exchange.filter.search.placeholder")} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
            onClick={() => {
              setPage(1);
              void loadTickets();
            }}
          >
            {t("common.button.refresh")}
          </button>
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("common.pagination.prev")}
            </button>
            <span className="tabular-nums">
              {page}/{pages}
            </span>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              disabled={page >= pages}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
            >
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
              <th className="px-4 py-3 text-left">{t("app.msp.exchange.table.ticket")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.exchange.table.type")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.exchange.table.date")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.exchange.table.pair")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.exchange.table.quoteAmount")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.exchange.table.rate")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.exchange.table.baseAmount")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.exchange.table.customer")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.exchange.table.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-gray-500">
                  {t("app.msp.exchange.empty")}
                </td>
              </tr>
            ) : (
              tickets.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">#{r.ticketNumber}</td>
                  <td className="px-4 py-3 text-gray-700">{r.type === "buy" ? t("app.msp.exchange.type.buy") : r.type === "sell" ? t("app.msp.exchange.type.sell") : r.type}</td>
                  <td className="px-4 py-3 text-gray-700">{r.effectiveDate}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {r.baseCode}/{r.quoteCode}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.quoteAmount}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{r.rate}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{r.baseAmount}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="min-w-0">
                      <div className="truncate">{r.customerName ?? ""}</div>
                      <div className="truncate text-xs text-gray-500">{r.customerPhone ?? ""}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/t/${props.tenantSlug}/msp/exchange/tickets/${encodeURIComponent(r.id)}/print`}
                      target="_blank"
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                    >
                      {t("common.button.print")}
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={createOpen} onClose={() => (!creating ? setCreateOpen(false) : null)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.msp.exchange.newTicket")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.msp.exchange.newTicket.subtitle")}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.exchange.field.type")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={createType} onChange={(e) => setCreateType(e.target.value as "buy" | "sell")} disabled={creating}>
                <option value="buy">{t("app.msp.exchange.type.buy")}</option>
                <option value="sell">{t("app.msp.exchange.type.sell")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.exchange.field.date")}</label>
              <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={createDate} onChange={(e) => setCreateDate(e.target.value)} disabled={creating} />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.exchange.field.base")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm" value={baseCode} disabled />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.exchange.field.quote")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={createQuoteCode} onChange={(e) => setCreateQuoteCode(e.target.value)} disabled={creating}>
                {quoteCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">
                {createType === "buy" ? t("app.msp.exchange.field.payFrom") : t("app.msp.exchange.field.receiveInto")} ({baseCode})
              </label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={createBaseAccountId} onChange={(e) => setCreateBaseAccountId(e.target.value)} disabled={creating}>
                {baseAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.type.toUpperCase()} — {a.name} ({a.balance})
                  </option>
                ))}
              </select>
              {baseAccounts.length === 0 ? <div className="mt-1 text-xs text-red-600">{t("app.msp.accounts.missingForCurrency")}</div> : null}
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">
                {createType === "buy" ? t("app.msp.exchange.field.receiveInto") : t("app.msp.exchange.field.payFrom")} ({createQuoteCode})
              </label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={createQuoteAccountId} onChange={(e) => setCreateQuoteAccountId(e.target.value)} disabled={creating}>
                {quoteAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.type.toUpperCase()} — {a.name} ({a.balance})
                  </option>
                ))}
              </select>
              {quoteAccounts.length === 0 ? <div className="mt-1 text-xs text-red-600">{t("app.msp.accounts.missingForCurrency")}</div> : null}
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.exchange.field.quoteAmount")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm text-right tabular-nums" inputMode="decimal" value={createQuoteAmount} onChange={(e) => setCreateQuoteAmount(e.target.value)} disabled={creating} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.exchange.field.rate")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm text-right tabular-nums" inputMode="decimal" value={createRate} onChange={(e) => setCreateRate(e.target.value)} disabled={creating} />
              <div className="mt-1 text-xs text-gray-500">{t("app.msp.exchange.field.rateHint")}</div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.exchange.field.feeBase")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm text-right tabular-nums" inputMode="decimal" value={createFeeBase} onChange={(e) => setCreateFeeBase(e.target.value)} disabled={creating} />
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.exchange.field.summary")}</div>
              <div className="mt-2 space-y-1 text-sm text-gray-700">
                <div className="flex items-center justify-between gap-3">
                  <span>{t("app.msp.exchange.summary.baseAmount")}</span>
                  <span className="tabular-nums font-semibold text-gray-900">
                    {baseAmount.toFixed(2)} {baseCode}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{t("app.msp.exchange.summary.fee")}</span>
                  <span className="tabular-nums font-semibold text-gray-900">
                    {num(createFeeBase).toFixed(2)} {baseCode}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span>{t("app.msp.exchange.summary.totalBase")}</span>
                  <span className="tabular-nums font-semibold text-gray-900">
                    {totalBase.toFixed(2)} {baseCode}
                  </span>
                </div>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.exchange.field.customer")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={createCustomerId} onChange={(e) => setCreateCustomerId(e.target.value)} disabled={creating}>
                <option value="">{t("common.select")}</option>
                {activeCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ""} —{" "}
                    {c.kycStatus === "verified"
                      ? t("app.msp.customers.kyc.status.verified")
                      : c.kycStatus === "pending"
                        ? t("app.msp.customers.kyc.status.pending")
                        : c.kycStatus === "rejected"
                          ? t("app.msp.customers.kyc.status.rejected")
                          : t("app.msp.customers.kyc.status.none")}
                  </option>
                ))}
              </select>
              {selectedCustomer && selectedCustomer.kycStatus !== "verified" && (kycPolicy.enforceMode === "always" || (kycPolicy.enforceMode === "above_threshold" && kycPolicy.threshold > 0 && totalBase >= kycPolicy.threshold)) ? (
                <div className="mt-1 text-xs text-red-600">{t("errors.kycRequired")}</div>
              ) : null}
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.exchange.field.customerName")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={customerName} onChange={(e) => setCustomerName(e.target.value)} disabled={creating} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.exchange.field.customerPhone")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} disabled={creating} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.exchange.field.note")}</label>
              <textarea className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" rows={3} value={note} onChange={(e) => setNote(e.target.value)} disabled={creating} />
            </div>
          </div>

          <div className="mt-8 flex items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              disabled={creating}
              onClick={() => setCreateOpen(false)}
            >
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={!canCreateTicket}
              onClick={() => void createTicket()}
            >
              {creating ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
