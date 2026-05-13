"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };
type Currency = { id: string; code: string; name: string; symbol: string | null; decimals: number; isActive: boolean; updatedAt: string };
type CurrenciesResponse = { data: Currency[] };
type Partner = { id: string; name: string; phone: string | null; isActive: boolean; updatedAt: string };
type PartnersResponse = { data: Partner[] };
type PartnerBalancesResponse = { data: Array<{ partnerId: string; balances: Record<string, string> }> };

type Account = { id: string; type: "cash" | "bank" | string; name: string; currencyCode: string; isActive: boolean; balance: string };
type AccountsResponse = { data: Account[] };

type Customer = { id: string; name: string; phone: string | null; isActive: boolean };
type CustomersResponse = { data: { items: Customer[] } };

type Transfer = {
  id: string;
  transferNumber: number;
  status: "open" | "paid" | "cancelled" | string;
  transferDate: string;
  currencyCode: string;
  amount: string;
  fee: string;
  total: string;
  senderName: string;
  senderPhone: string | null;
  receiverName: string;
  receiverPhone: string | null;
  partnerId: string | null;
  createdAt: string;
};

type TransfersResponse = { data: { items: Transfer[]; page: number; pageSize: number; total: number } };

type TransferDetail = {
  id: string;
  transferNumber: number;
  status: string;
  transferDate: string;
  currencyCode: string;
  amount: string;
  fee: string;
  total: string;
  senderName: string;
  senderPhone: string | null;
  receiverName: string;
  receiverPhone: string | null;
  partnerId: string | null;
  partnerName: string | null;
  receiveAccountId: string | null;
  customerId: string | null;
  customerName: string | null;
  fundingSource: string | null;
  note: string | null;
  createdAt: string;
  paidTotal: string;
  remaining: string;
  payouts: { id: string; paidAmount: string; paidAt: string; payAccountId: string | null; note: string | null }[];
};

type TransferDetailResponse = { data: TransferDetail };

type PartnerStatementItem = {
  eventId: string;
  eventDate: string;
  occurredAt: string;
  source: string;
  ref: string | null;
  currencyCode: string;
  amountSigned: string;
  note: string | null;
};
type PartnerStatementResponse = { data: { partner: { id: string; name: string }; page: number; pageSize: number; total: number; items: PartnerStatementItem[] } };

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

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function MspHawalaClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const activeCurrencies = useMemo(() => currencies.filter((c) => c.isActive), [currencies]);

  const [partners, setPartners] = useState<Partner[]>([]);
  const activePartners = useMemo(() => partners.filter((p) => p.isActive), [partners]);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const activeCustomers = useMemo(() => customers.filter((c) => c.isActive), [customers]);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const activeAccounts = useMemo(() => accounts.filter((a) => a.isActive), [accounts]);
  const accountLabelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts) {
      m.set(a.id, `${a.type.toUpperCase()} — ${a.name} (${a.currencyCode})`);
    }
    return m;
  }, [accounts]);

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return isoDate(d);
  });
  const [to, setTo] = useState(() => isoDate(new Date()));
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "paid" | "cancelled">("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

  const [transfers, setTransfers] = useState<Transfer[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transferDate, setTransferDate] = useState(() => isoDate(new Date()));
  const [currencyCode, setCurrencyCode] = useState("AFN");
  const [fundingSource, setFundingSource] = useState<"cash" | "customer_wallet">("cash");
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [fee, setFee] = useState("0");
  const [receiveAccountId, setReceiveAccountId] = useState("");
  const [senderName, setSenderName] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [receiverName, setReceiverName] = useState("");
  const [receiverPhone, setReceiverPhone] = useState("");
  const [partnerId, setPartnerId] = useState<string>("");
  const [partnerBalance, setPartnerBalance] = useState<string>("");
  const [partnerBalanceLoading, setPartnerBalanceLoading] = useState(false);
  const [note, setNote] = useState("");

  const [partnerModalOpen, setPartnerModalOpen] = useState(false);
  const [partnerSaving, setPartnerSaving] = useState(false);
  const [partnerName, setPartnerName] = useState("");
  const [partnerPhone, setPartnerPhone] = useState("");

  const [partnerStatementOpen, setPartnerStatementOpen] = useState(false);
  const [partnerStatementLoading, setPartnerStatementLoading] = useState(false);
  const [partnerStatementPartnerId, setPartnerStatementPartnerId] = useState("");
  const [partnerStatementCurrencyCode, setPartnerStatementCurrencyCode] = useState("AFN");
  const [partnerStatementFrom, setPartnerStatementFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return isoDate(d);
  });
  const [partnerStatementTo, setPartnerStatementTo] = useState(() => isoDate(new Date()));
  const [partnerStatementBalance, setPartnerStatementBalance] = useState<string>("");
  const [partnerStatementPage, setPartnerStatementPage] = useState(1);
  const [partnerStatementPageSize, setPartnerStatementPageSize] = useState(25);
  const [partnerStatementTotal, setPartnerStatementTotal] = useState(0);
  const partnerStatementPages = useMemo(() => Math.max(1, Math.ceil(partnerStatementTotal / partnerStatementPageSize)), [partnerStatementPageSize, partnerStatementTotal]);
  const [partnerStatementItems, setPartnerStatementItems] = useState<PartnerStatementItem[]>([]);
  const partnerStatementBalanceSign = useMemo(() => moneySign(partnerStatementBalance), [partnerStatementBalance]);
  const partnerSettlementDirection = useMemo<"in" | "out">(() => (partnerStatementBalanceSign === "neg" ? "in" : "out"), [partnerStatementBalanceSign]);
  const partnerSettlementAmount = useMemo(() => moneyAbs(partnerStatementBalance), [partnerStatementBalance]);
  const partnerCanSettleNow = useMemo(() => partnerStatementBalanceSign !== "zero", [partnerStatementBalanceSign]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<TransferDetail | null>(null);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [payoutSaving, setPayoutSaving] = useState(false);
  const [payoutAccountId, setPayoutAccountId] = useState("");

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
      const [currenciesRes, partnersRes, accountsRes, customersRes] = await Promise.all([
        apiFetch("/api/msp/currencies", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/msp/hawala/partners", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/msp/accounts", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/msp/customers?page=1&pageSize=200&status=active", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
      ]);
      const currenciesJson = (await currenciesRes.json()) as CurrenciesResponse | { error?: { message_key?: string } };
      const partnersJson = (await partnersRes.json()) as PartnersResponse | { error?: { message_key?: string } };
      const accountsJson = (await accountsRes.json()) as AccountsResponse | { error?: { message_key?: string } };
      const customersJson = (await customersRes.json()) as CustomersResponse | { error?: { message_key?: string } };

      if (!currenciesRes.ok) {
        setErrorKey((currenciesJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      if (!partnersRes.ok) {
        setErrorKey((partnersJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
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

      const list = (currenciesJson as CurrenciesResponse).data ?? [];
      setCurrencies(list);
      const active = list.find((c) => c.isActive);
      if (active) setCurrencyCode(active.code);

      setPartners((partnersJson as PartnersResponse).data ?? []);
      setAccounts(((accountsJson as AccountsResponse).data ?? []).filter((a) => a.type === "cash" || a.type === "bank"));
      setCustomers((customersJson as CustomersResponse).data.items ?? []);
    } catch {
      setErrorKey("errors.internal");
    }
  }, [tenantId]);

  const loadTransfers = useCallback(async () => {
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
      if (statusFilter !== "all") p.set("status", statusFilter);

      const res = await apiFetch(`/api/msp/hawala/transfers?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as TransfersResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const data = (json as TransfersResponse).data;
      setTransfers(data.items ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? page);
      setPageSize(data.pageSize ?? pageSize);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [from, page, pageSize, q, statusFilter, tenantId, to]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    if (!tenantId) return;
    void loadTransfers();
  }, [loadTransfers, tenantId]);

  const openCreate = useCallback(() => {
    setTransferDate(isoDate(new Date()));
    setFundingSource("cash");
    setCustomerId("");
    setAmount("");
    setFee("0");
    setReceiveAccountId("");
    setSenderName("");
    setSenderPhone("");
    setReceiverName("");
    setReceiverPhone("");
    setPartnerId("");
    setNote("");
    setCreateOpen(true);
  }, []);

  const loadPartnerStatement = useCallback(async () => {
    if (!tenantId) return;
    if (!partnerStatementPartnerId) return;
    setPartnerStatementLoading(true);
    setErrorKey(null);
    try {
      const bp = new URLSearchParams();
      bp.set("ids", partnerStatementPartnerId);
      bp.set("currencyCodes", partnerStatementCurrencyCode);
      const balRes = await apiFetch(`/api/msp/hawala/partners/balances?${bp.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      if (balRes.ok) {
        const balJson = (await balRes.json()) as PartnerBalancesResponse;
        const row = (balJson.data ?? [])[0];
        setPartnerStatementBalance(row?.balances?.[partnerStatementCurrencyCode] ?? "0");
      } else {
        setPartnerStatementBalance("0");
      }

      const p = new URLSearchParams();
      p.set("page", String(partnerStatementPage));
      p.set("pageSize", String(partnerStatementPageSize));
      if (partnerStatementFrom) p.set("from", partnerStatementFrom);
      if (partnerStatementTo) p.set("to", partnerStatementTo);
      if (partnerStatementCurrencyCode) p.set("currencyCode", partnerStatementCurrencyCode);
      const res = await apiFetch(`/api/msp/hawala/partners/${encodeURIComponent(partnerStatementPartnerId)}/statement?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as PartnerStatementResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const data = (json as PartnerStatementResponse).data;
      setPartnerStatementItems(data.items ?? []);
      setPartnerStatementTotal(data.total ?? 0);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setPartnerStatementLoading(false);
    }
  }, [
    partnerStatementCurrencyCode,
    partnerStatementFrom,
    partnerStatementPage,
    partnerStatementPageSize,
    partnerStatementPartnerId,
    partnerStatementTo,
    tenantId
  ]);

  useEffect(() => {
    if (!partnerStatementOpen) return;
    if (!partnerStatementPartnerId) return;
    void loadPartnerStatement();
  }, [loadPartnerStatement, partnerStatementOpen, partnerStatementPartnerId]);

  useEffect(() => {
    if (!partnerStatementOpen) return;
    setPartnerStatementPage(1);
  }, [partnerStatementCurrencyCode, partnerStatementFrom, partnerStatementPartnerId, partnerStatementOpen, partnerStatementPageSize, partnerStatementTo]);

  const openPartnerStatement = useCallback(
    (pid?: string, preferredCurrency?: string) => {
      const id = pid ?? partnerId;
      if (!id) return;
      const currency = (preferredCurrency ?? currencyCode) || "AFN";
      setPartnerStatementPartnerId(id);
      setPartnerStatementCurrencyCode(currency);
      setPartnerStatementOpen(true);
    },
    [currencyCode, partnerId]
  );

  const exportPartnerStatementExcel = useCallback(async () => {
    if (!tenantId) return;
    if (!partnerStatementPartnerId) return;
    setErrorKey(null);
    try {
      const p = new URLSearchParams();
      p.set("page", "1");
      p.set("pageSize", "200");
      if (partnerStatementFrom) p.set("from", partnerStatementFrom);
      if (partnerStatementTo) p.set("to", partnerStatementTo);
      if (partnerStatementCurrencyCode) p.set("currencyCode", partnerStatementCurrencyCode);
      const res = await apiFetch(`/api/msp/hawala/partners/${encodeURIComponent(partnerStatementPartnerId)}/statement?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as PartnerStatementResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const data = (json as PartnerStatementResponse).data.items ?? [];
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ["Date", "Source", "Amount", "Ref", "Note"],
          ...data.map((r) => [r.eventDate, r.source, Number(r.amountSigned), r.ref ?? "", r.note ?? ""])
        ]),
        "Partner statement"
      );
      XLSX.writeFile(wb, `msp_partner_statement_${partnerStatementCurrencyCode}_${partnerStatementFrom}_${partnerStatementTo}.xlsx`);
    } catch {
      setErrorKey("errors.internal");
    }
  }, [partnerStatementCurrencyCode, partnerStatementFrom, partnerStatementPartnerId, partnerStatementTo, tenantId]);

  const createTransfer = useCallback(async () => {
    if (!tenantId) return;
    setCreating(true);
    setErrorKey(null);
    try {
      const payload = {
        transferDate,
        currencyCode,
        fundingSource,
        customerId: customerId || undefined,
        receiveAccountId: fundingSource === "cash" ? (receiveAccountId || undefined) : undefined,
        amount,
        fee,
        senderName: senderName.trim(),
        senderPhone: senderPhone.trim() || undefined,
        receiverName: receiverName.trim(),
        receiverPhone: receiverPhone.trim() || undefined,
        partnerId: partnerId || undefined,
        note: note.trim() || undefined
      };
      const res = await apiFetch("/api/msp/hawala/transfers", {
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
      await loadTransfers();
      window.open(`/t/${props.tenantSlug}/msp/hawala/transfers/${encodeURIComponent(json.data.id)}/print`, "_blank", "noopener,noreferrer");
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setCreating(false);
    }
  }, [amount, currencyCode, customerId, fee, fundingSource, loadTransfers, note, partnerId, props.tenantSlug, receiveAccountId, receiverName, receiverPhone, senderName, senderPhone, tenantId, transferDate]);

  const openPartnerModal = useCallback(() => {
    setPartnerName("");
    setPartnerPhone("");
    setPartnerModalOpen(true);
  }, []);

  const createPartner = useCallback(async () => {
    if (!tenantId) return;
    setPartnerSaving(true);
    setErrorKey(null);
    try {
      const res = await apiFetch("/api/msp/hawala/partners", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({ name: partnerName.trim(), phone: partnerPhone.trim() || undefined, isActive: true })
      });
      const json = (await res.json()) as { data?: { id: string }; error?: { message_key?: string } };
      if (!res.ok || !json.data?.id) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setPartnerModalOpen(false);
      await loadSetup();
      setPartnerId(json.data.id);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setPartnerSaving(false);
    }
  }, [loadSetup, partnerName, partnerPhone, tenantId]);

  const openDetail = useCallback(
    async (id: string) => {
      if (!tenantId) return;
      setDetailOpen(true);
      setDetailLoading(true);
      setErrorKey(null);
      setDetail(null);
      try {
        const res = await apiFetch(`/api/msp/hawala/transfers/${encodeURIComponent(id)}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as TransferDetailResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const d = (json as TransferDetailResponse).data;
        setDetail(d);
        setPayoutAmount(d.remaining);
        setPayoutNote("");
        setPayoutAccountId(d.receiveAccountId ?? "");
      } catch {
        setErrorKey("errors.internal");
      } finally {
        setDetailLoading(false);
      }
    },
    [tenantId]
  );

  const addPayout = useCallback(async () => {
    if (!tenantId || !detail) return;
    setPayoutSaving(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/msp/hawala/transfers/${encodeURIComponent(detail.id)}/payouts`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({ paidAmount: payoutAmount.trim() || undefined, payAccountId: payoutAccountId || undefined, note: payoutNote.trim() || undefined })
      });
      const json = (await res.json()) as { data?: { success: boolean }; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      await loadTransfers();
      await openDetail(detail.id);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setPayoutSaving(false);
    }
  }, [detail, loadTransfers, openDetail, payoutAccountId, payoutAmount, payoutNote, tenantId]);

  const receiveAccounts = useMemo(() => activeAccounts.filter((a) => a.currencyCode === currencyCode), [activeAccounts, currencyCode]);
  const payoutAccounts = useMemo(() => activeAccounts.filter((a) => a.currencyCode === (detail?.currencyCode ?? currencyCode)), [activeAccounts, currencyCode, detail?.currencyCode]);

  useEffect(() => {
    if (!createOpen) return;
    if (fundingSource !== "cash") {
      if (receiveAccountId) setReceiveAccountId("");
    }
  }, [createOpen, fundingSource, receiveAccountId]);

  useEffect(() => {
    if (!createOpen) return;
    if (fundingSource !== "cash") return;
    if (!receiveAccountId) {
      const preferred = receiveAccounts.find((a) => a.type === "cash") ?? receiveAccounts[0];
      if (preferred) setReceiveAccountId(preferred.id);
    } else if (!receiveAccounts.some((a) => a.id === receiveAccountId)) {
      const preferred = receiveAccounts.find((a) => a.type === "cash") ?? receiveAccounts[0];
      setReceiveAccountId(preferred?.id ?? "");
    }
  }, [createOpen, fundingSource, receiveAccountId, receiveAccounts]);

  useEffect(() => {
    if (!tenantId) return;
    if (!createOpen) return;
    if (!partnerId) {
      setPartnerBalance("");
      return;
    }
    let cancelled = false;
    setPartnerBalanceLoading(true);
    setPartnerBalance("");
    void (async () => {
      try {
        const p = new URLSearchParams();
        p.set("ids", partnerId);
        p.set("currencyCodes", currencyCode);
        const res = await apiFetch(`/api/msp/hawala/partners/balances?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as PartnerBalancesResponse;
        const row = (json.data ?? [])[0];
        const bal = row?.balances?.[currencyCode] ?? "";
        if (!cancelled) setPartnerBalance(bal);
      } finally {
        if (!cancelled) setPartnerBalanceLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [createOpen, currencyCode, partnerId, tenantId]);

  useEffect(() => {
    if (!detailOpen) return;
    if (!detail) return;
    if (!payoutAccountId) {
      const preferred = payoutAccounts.find((a) => a.type === "cash") ?? payoutAccounts[0];
      if (preferred) setPayoutAccountId(preferred.id);
    } else if (!payoutAccounts.some((a) => a.id === payoutAccountId)) {
      const preferred = payoutAccounts.find((a) => a.type === "cash") ?? payoutAccounts[0];
      setPayoutAccountId(preferred?.id ?? "");
    }
  }, [detail, detailOpen, payoutAccountId, payoutAccounts]);

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
      if (statusFilter !== "all") p.set("status", statusFilter);
      const res = await apiFetch(`/api/msp/hawala/transfers?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as TransfersResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const data = (json as TransfersResponse).data.items ?? [];
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([
          ["Transfer #", "Status", "Date", "Currency", "Amount", "Fee", "Total", "Sender", "Sender phone", "Receiver", "Receiver phone", "Created At"],
          ...data.map((r) => [r.transferNumber, r.status, r.transferDate, r.currencyCode, Number(r.amount), Number(r.fee), Number(r.total), r.senderName, r.senderPhone ?? "", r.receiverName, r.receiverPhone ?? "", r.createdAt])
        ]),
        "Transfers"
      );
      XLSX.writeFile(wb, `msp_hawala_${from}_${to}.xlsx`);
    } catch {
      setErrorKey("errors.internal");
    }
  }, [from, q, statusFilter, tenantId, to]);

  const canCreateTransfer = useMemo(() => {
    if (creating) return false;
    if (fundingSource === "cash") {
      if (!receiveAccountId) return false;
      if (receiveAccounts.length === 0) return false;
    } else {
      if (!customerId) return false;
    }
    return true;
  }, [creating, customerId, fundingSource, receiveAccountId, receiveAccounts.length]);

  const canAddPayout = useMemo(() => {
    if (payoutSaving) return false;
    if (!detail || detail.status === "paid") return false;
    if (!payoutAccountId) return false;
    if (payoutAccounts.length === 0) return false;
    return true;
  }, [detail, payoutAccountId, payoutAccounts.length, payoutSaving]);

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
            <div className="text-lg font-semibold">{t("app.msp.hawala.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.msp.hawala.subtitle")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => void exportExcel()}>
              {t("app.msp.hawala.exportExcel")}
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => {
                const firstPartner = activePartners[0]?.id ?? "";
                const firstCurrency = activeCurrencies[0]?.code ?? "AFN";
                if (!partnerStatementPartnerId) setPartnerStatementPartnerId(firstPartner);
                if (!partnerStatementCurrencyCode) setPartnerStatementCurrencyCode(firstCurrency);
                setPartnerStatementOpen(true);
              }}
            >
              {t("app.msp.hawala.partnerStatement")}
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800" onClick={openCreate}>
              {t("app.msp.hawala.newTransfer")}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-5">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.filter.from")}</label>
            <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.filter.to")}</label>
            <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.filter.status")}</label>
            <select
              className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as "all" | "open" | "paid" | "cancelled")}
            >
              <option value="all">{t("common.filter.all")}</option>
              <option value="open">{t("app.msp.hawala.status.open")}</option>
              <option value="paid">{t("app.msp.hawala.status.paid")}</option>
              <option value="cancelled">{t("app.msp.hawala.status.cancelled")}</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.filter.search")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("app.msp.hawala.filter.search.placeholder")} />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
            onClick={() => {
              setPage(1);
              void loadTransfers();
            }}
          >
            {t("common.button.refresh")}
          </button>
          <div className="flex items-center gap-2 text-sm text-gray-700">
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
              <th className="px-4 py-3 text-left">{t("app.msp.hawala.table.transfer")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.hawala.table.status")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.hawala.table.date")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.hawala.table.currency")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.hawala.table.amount")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.hawala.table.sender")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.hawala.table.receiver")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.hawala.table.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {transfers.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                  {t("app.msp.hawala.empty")}
                </td>
              </tr>
            ) : (
              transfers.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">#{r.transferNumber}</td>
                  <td className="px-4 py-3 text-gray-700">
                    {r.status === "open" ? t("app.msp.hawala.status.open") : r.status === "paid" ? t("app.msp.hawala.status.paid") : r.status === "cancelled" ? t("app.msp.hawala.status.cancelled") : r.status}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{r.transferDate}</td>
                  <td className="px-4 py-3 text-gray-700">{r.currencyCode}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{r.amount}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="min-w-0">
                      <div className="truncate">{r.senderName}</div>
                      <div className="truncate text-xs text-gray-500">{r.senderPhone ?? ""}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="min-w-0">
                      <div className="truncate">{r.receiverName}</div>
                      <div className="truncate text-xs text-gray-500">{r.receiverPhone ?? ""}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => void openDetail(r.id)}>
                        {t("common.button.view")}
                      </button>
                      <Link
                        href={`/t/${props.tenantSlug}/msp/hawala/transfers/${encodeURIComponent(r.id)}/print`}
                        target="_blank"
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                      >
                        {t("common.button.print")}
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={partnerStatementOpen} onClose={() => (!partnerStatementLoading ? setPartnerStatementOpen(false) : null)}>
        <div className="p-6 md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xl font-semibold">{t("app.msp.hawala.partnerStatement")}</div>
              {partnerStatementPartnerId ? (
                <div className="mt-1 text-sm text-gray-700 tabular-nums">
                  {t("app.msp.hawala.partner.balance")}: {partnerStatementLoading ? t("common.loading") : partnerStatementBalance || "0"} {partnerStatementCurrencyCode}
                </div>
              ) : null}
              {partnerStatementPartnerId ? (
                <div className="mt-1 text-sm text-gray-700">
                  {partnerStatementBalanceSign === "neg" ? t("app.msp.hawala.partnerStatement.theyOwe") : t("app.msp.hawala.partnerStatement.youOwe")}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                disabled={partnerStatementLoading || !partnerStatementPartnerId}
                onClick={() => void exportPartnerStatementExcel()}
              >
                {t("app.msp.hawala.partnerStatement.exportExcel")}
              </button>
              <Link
                href={
                  partnerStatementPartnerId && partnerCanSettleNow
                    ? `/t/${props.tenantSlug}/msp/settlements?partnerId=${encodeURIComponent(partnerStatementPartnerId)}&currencyCode=${encodeURIComponent(partnerStatementCurrencyCode)}&direction=${encodeURIComponent(partnerSettlementDirection)}&amount=${encodeURIComponent(partnerSettlementAmount)}`
                    : "#"
                }
                className={`inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 ${partnerStatementLoading || !partnerStatementPartnerId || !partnerCanSettleNow ? "pointer-events-none opacity-60" : ""}`}
              >
                {t("app.msp.hawala.partnerStatement.settleNow")}
              </Link>
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                disabled={partnerStatementLoading || !partnerStatementPartnerId}
                onClick={() => void loadPartnerStatement()}
              >
                {partnerStatementLoading ? t("common.working") : t("common.button.refresh")}
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-5">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.field.partner")}</label>
              <select
                className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                value={partnerStatementPartnerId}
                onChange={(e) => setPartnerStatementPartnerId(e.target.value)}
                disabled={partnerStatementLoading}
              >
                <option value="">{t("common.select")}</option>
                {activePartners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.field.currency")}</label>
              <select
                className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                value={partnerStatementCurrencyCode}
                onChange={(e) => setPartnerStatementCurrencyCode(e.target.value)}
                disabled={partnerStatementLoading}
              >
                {activeCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.filter.from")}</label>
              <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={partnerStatementFrom} onChange={(e) => setPartnerStatementFrom(e.target.value)} disabled={partnerStatementLoading} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.filter.to")}</label>
              <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={partnerStatementTo} onChange={(e) => setPartnerStatementTo(e.target.value)} disabled={partnerStatementLoading} />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="text-sm text-gray-700 tabular-nums">
              {partnerStatementPage}/{partnerStatementPages}
            </div>
            <div className="flex items-center gap-2">
              <button type="button" className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" disabled={partnerStatementLoading || partnerStatementPage <= 1} onClick={() => setPartnerStatementPage((p) => Math.max(1, p - 1))}>
                {t("common.pagination.prev")}
              </button>
              <button type="button" className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" disabled={partnerStatementLoading || partnerStatementPage >= partnerStatementPages} onClick={() => setPartnerStatementPage((p) => Math.min(partnerStatementPages, p + 1))}>
                {t("common.pagination.next")}
              </button>
              <select className="h-9 rounded-xl border border-gray-200 bg-white px-2 text-sm" value={String(partnerStatementPageSize)} onChange={(e) => setPartnerStatementPageSize(Number(e.target.value))} disabled={partnerStatementLoading}>
                {[10, 25, 50, 100, 200].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-white">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">{t("app.msp.hawala.partnerStatement.table.date")}</th>
                  <th className="px-4 py-3 text-left">{t("app.msp.hawala.partnerStatement.table.source")}</th>
                  <th className="px-4 py-3 text-right">{t("app.msp.hawala.partnerStatement.table.amount")}</th>
                  <th className="px-4 py-3 text-left">{t("app.msp.hawala.partnerStatement.table.note")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {partnerStatementItems.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                      {t("app.msp.hawala.partnerStatement.empty")}
                    </td>
                  </tr>
                ) : (
                  partnerStatementItems.map((r) => (
                    <tr key={r.eventId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-700">{r.eventDate}</td>
                      <td className="px-4 py-3 text-gray-700">{r.source}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{r.amountSigned}</td>
                      <td className="px-4 py-3 text-gray-700">
                        <div className="max-w-[520px] truncate">{r.note ?? ""}</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      <Modal open={createOpen} onClose={() => (!creating ? setCreateOpen(false) : null)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.msp.hawala.newTransfer")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.msp.hawala.newTransfer.subtitle")}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.field.date")}</label>
              <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={transferDate} onChange={(e) => setTransferDate(e.target.value)} disabled={creating} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.field.currency")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} disabled={creating}>
                {activeCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.field.fundingSource")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={fundingSource} onChange={(e) => setFundingSource(e.target.value as "cash" | "customer_wallet")} disabled={creating}>
                <option value="cash">{t("app.msp.hawala.funding.cash")}</option>
                <option value="customer_wallet">{t("app.msp.hawala.funding.customerWallet")}</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.field.customer")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={customerId} onChange={(e) => setCustomerId(e.target.value)} disabled={creating}>
                <option value="">{t("common.select")}</option>
                {activeCustomers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {fundingSource === "cash" ? (
              <div className="md:col-span-2">
                <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t("app.msp.hawala.field.receiveIntoAccount")} ({currencyCode})
                </label>
                <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={receiveAccountId} onChange={(e) => setReceiveAccountId(e.target.value)} disabled={creating}>
                  <option value="">{t("common.select")}</option>
                  {receiveAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.type.toUpperCase()} — {a.name} ({a.balance})
                    </option>
                  ))}
                </select>
                {receiveAccounts.length === 0 ? <div className="mt-1 text-xs text-red-600">{t("app.msp.accounts.missingForCurrency")}</div> : null}
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.field.amount")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm text-right tabular-nums" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={creating} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.field.fee")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm text-right tabular-nums" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} disabled={creating} />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.field.senderName")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={senderName} onChange={(e) => setSenderName(e.target.value)} disabled={creating} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.field.senderPhone")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={senderPhone} onChange={(e) => setSenderPhone(e.target.value)} disabled={creating} />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.field.receiverName")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={receiverName} onChange={(e) => setReceiverName(e.target.value)} disabled={creating} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.field.receiverPhone")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} disabled={creating} />
            </div>

            <div className="md:col-span-2">
              <div className="flex items-end justify-between gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.field.partner")}</label>
                  <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} disabled={creating}>
                    <option value="">{t("app.msp.hawala.partner.none")}</option>
                    {activePartners.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  {partnerId ? (
                    <div className="mt-1 text-xs text-gray-600 tabular-nums">
                      {t("app.msp.hawala.partner.balance")}: {partnerBalanceLoading ? t("common.loading") : partnerBalance || "0"}
                    </div>
                  ) : null}
                </div>
                <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={openPartnerModal} disabled={creating}>
                  {t("app.msp.hawala.partner.add")}
                </button>
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.field.note")}</label>
              <textarea className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" rows={3} value={note} onChange={(e) => setNote(e.target.value)} disabled={creating} />
            </div>
          </div>

          <div className="mt-8 flex items-center justify-end gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" disabled={creating} onClick={() => setCreateOpen(false)}>
              {t("common.button.cancel")}
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60" disabled={!canCreateTransfer} onClick={() => void createTransfer()}>
              {creating ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={partnerModalOpen} onClose={() => (!partnerSaving ? setPartnerModalOpen(false) : null)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.msp.hawala.partner.modal.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.msp.hawala.partner.modal.subtitle")}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.partner.name")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} disabled={partnerSaving} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.partner.phone")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={partnerPhone} onChange={(e) => setPartnerPhone(e.target.value)} disabled={partnerSaving} />
            </div>
          </div>

          <div className="mt-8 flex items-center justify-end gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" disabled={partnerSaving} onClick={() => setPartnerModalOpen(false)}>
              {t("common.button.cancel")}
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60" disabled={partnerSaving} onClick={() => void createPartner()}>
              {partnerSaving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={detailOpen} onClose={() => (!detailLoading && !payoutSaving ? setDetailOpen(false) : null)}>
        <div className="p-6 md:p-8">
          <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="text-xl font-semibold">{t("app.msp.hawala.detail.title")}</div>
              {detail ? <div className="mt-1 text-sm text-gray-700">#{detail.transferNumber}</div> : null}
            </div>
            {detail ? (
              <Link
                href={`/t/${props.tenantSlug}/msp/hawala/transfers/${encodeURIComponent(detail.id)}/print`}
                target="_blank"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                {t("common.button.print")}
              </Link>
            ) : null}
          </div>

          {detailLoading ? (
            <div className="mt-6 text-sm text-gray-700">{t("common.loading")}</div>
          ) : !detail ? (
            <div className="mt-6 text-sm text-gray-700">{t("errors.internal")}</div>
          ) : (
            <>
              <div className="mt-6 grid gap-3 md:grid-cols-2 text-sm">
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.detail.sender")}</div>
                  <div className="mt-2 font-semibold text-gray-900">{detail.senderName}</div>
                  {detail.senderPhone ? <div className="text-gray-700">{detail.senderPhone}</div> : null}
                </div>
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.detail.receiver")}</div>
                  <div className="mt-2 font-semibold text-gray-900">{detail.receiverName}</div>
                  {detail.receiverPhone ? <div className="text-gray-700">{detail.receiverPhone}</div> : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2 text-sm">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.field.fundingSource")}</div>
                  <div className="mt-2 font-semibold text-gray-900">
                    {detail.fundingSource === "customer_wallet"
                      ? t("app.msp.hawala.funding.customerWallet")
                      : detail.fundingSource === "cash"
                        ? t("app.msp.hawala.funding.cash")
                        : detail.fundingSource ?? ""}
                  </div>
                  {detail.customerName ? <div className="mt-1 text-gray-700">{detail.customerName}</div> : null}
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.field.receiveIntoAccount")}</div>
                  <div className="mt-2 font-semibold text-gray-900">{detail.receiveAccountId ? accountLabelById.get(detail.receiveAccountId) ?? "" : "—"}</div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3 text-sm">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.detail.amount")}</div>
                  <div className="mt-2 text-lg font-semibold tabular-nums text-gray-900">
                    {detail.amount} {detail.currencyCode}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.detail.paid")}</div>
                  <div className="mt-2 text-lg font-semibold tabular-nums text-gray-900">
                    {detail.paidTotal} {detail.currencyCode}
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.detail.remaining")}</div>
                  <div className="mt-2 text-lg font-semibold tabular-nums text-gray-900">
                    {detail.remaining} {detail.currencyCode}
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-gray-200 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-4 py-3 text-left">{t("app.msp.hawala.payouts.table.date")}</th>
                      <th className="px-4 py-3 text-left">{t("app.msp.hawala.payouts.table.account")}</th>
                      <th className="px-4 py-3 text-right">{t("app.msp.hawala.payouts.table.amount")}</th>
                      <th className="px-4 py-3 text-left">{t("app.msp.hawala.payouts.table.note")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {detail.payouts.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                          {t("app.msp.hawala.payouts.empty")}
                        </td>
                      </tr>
                    ) : (
                      detail.payouts.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-3 text-gray-700">{new Date(p.paidAt).toLocaleString()}</td>
                          <td className="px-4 py-3 text-gray-700">{p.payAccountId ? accountLabelById.get(p.payAccountId) ?? "" : ""}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{p.paidAmount}</td>
                          <td className="px-4 py-3 text-gray-700">{p.note ?? ""}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {detail.status !== "paid" ? (
                <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-sm font-semibold text-gray-900">{t("app.msp.hawala.payouts.addTitle")}</div>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.payouts.amount")}</label>
                      <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm text-right tabular-nums" inputMode="decimal" value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} disabled={payoutSaving} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">
                        {t("app.msp.hawala.payouts.payFrom")} ({detail.currencyCode})
                      </label>
                      <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={payoutAccountId} onChange={(e) => setPayoutAccountId(e.target.value)} disabled={payoutSaving}>
                        {payoutAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.type.toUpperCase()} — {a.name} ({a.balance})
                          </option>
                        ))}
                      </select>
                      {payoutAccounts.length === 0 ? <div className="mt-1 text-xs text-red-600">{t("app.msp.accounts.missingForCurrency")}</div> : null}
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.hawala.payouts.note")}</label>
                      <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={payoutNote} onChange={(e) => setPayoutNote(e.target.value)} disabled={payoutSaving} />
                    </div>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60" disabled={!canAddPayout} onClick={() => void addPayout()}>
                      {payoutSaving ? t("common.working") : t("app.msp.hawala.payouts.add")}
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
