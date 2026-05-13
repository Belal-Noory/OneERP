"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";
import { getApiBaseUrl } from "@/lib/api";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  isActive: boolean;
  note: string | null;
  kycStatus: "none" | "pending" | "verified" | "rejected" | string;
  kycVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CustomerListResponse = { data: { items: Customer[]; page: number; pageSize: number; total: number } };

type Currency = { id: string; code: string; name: string; isActive: boolean };
type CurrenciesResponse = { data: Currency[] };

type Account = { id: string; type: "cash" | "bank" | string; name: string; currencyCode: string; isActive: boolean; balance: string };
type AccountsResponse = { data: Account[] };

type WalletBalance = { currencyCode: string; balance: string };
type WalletResponse = { data: WalletBalance[] };

type WalletsResponse = { data: Array<{ customerId: string; balances: Record<string, string> }> };

type CustomerKycResponse = {
  data: {
    status: "none" | "pending" | "verified" | "rejected" | string;
    profile: Record<string, unknown>;
    updatedAt: string | null;
    verifiedAt: string | null;
    verifiedByUserId: string | null;
  };
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function MspCustomersClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const activeCurrencies = useMemo(() => currencies.filter((c) => c.isActive), [currencies]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const activeAccounts = useMemo(() => accounts.filter((a) => a.isActive), [accounts]);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const pages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

  const [items, setItems] = useState<Customer[]>([]);
  const [walletSummaryByCustomerId, setWalletSummaryByCustomerId] = useState<Record<string, string>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<{ name: string; phone: string; note: string; isActive: boolean }>({ name: "", phone: "", note: "", isActive: true });

  const [kycOpen, setKycOpen] = useState(false);
  const [kycCustomer, setKycCustomer] = useState<Customer | null>(null);
  const [kycLoading, setKycLoading] = useState(false);
  const [kycSaving, setKycSaving] = useState(false);
  const [kycErrorKey, setKycErrorKey] = useState<string | null>(null);
  const [kycMeta, setKycMeta] = useState<{ updatedAt: string | null; verifiedAt: string | null; verifiedByUserId: string | null }>({
    updatedAt: null,
    verifiedAt: null,
    verifiedByUserId: null
  });
  const [kycForm, setKycForm] = useState<{
    status: "none" | "pending" | "verified" | "rejected";
    documentFrontFileId: string;
    documentBackFileId: string;
    selfieFileId: string;
    fullName: string;
    fatherName: string;
    gender: "" | "male" | "female" | "other";
    dateOfBirth: string;
    nationality: string;
    nationalId: string;
    documentType: string;
    documentNumber: string;
    documentIssuer: string;
    documentExpiry: string;
    address: string;
    city: string;
    country: string;
    occupation: string;
    sourceOfFunds: string;
    isPep: boolean;
    riskLevel: "" | "low" | "medium" | "high";
    note: string;
  }>({
    status: "none",
    documentFrontFileId: "",
    documentBackFileId: "",
    selfieFileId: "",
    fullName: "",
    fatherName: "",
    gender: "",
    dateOfBirth: "",
    nationality: "",
    nationalId: "",
    documentType: "",
    documentNumber: "",
    documentIssuer: "",
    documentExpiry: "",
    address: "",
    city: "",
    country: "",
    occupation: "",
    sourceOfFunds: "",
    isPep: false,
    riskLevel: "",
    note: ""
  });

  const [walletOpen, setWalletOpen] = useState(false);
  const [walletCustomer, setWalletCustomer] = useState<Customer | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletBalances, setWalletBalances] = useState<WalletBalance[]>([]);
  const [walletAction, setWalletAction] = useState<"deposit" | "withdraw">("deposit");
  const [walletForm, setWalletForm] = useState<{ currencyCode: string; cashAccountId: string; amount: string; entryDate: string; note: string }>({
    currencyCode: "AFN",
    cashAccountId: "",
    amount: "",
    entryDate: isoDate(new Date()),
    note: ""
  });

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
      const [currRes, accountsRes] = await Promise.all([
        apiFetch("/api/msp/currencies", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/msp/accounts", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
      ]);
      const currJson = (await currRes.json()) as CurrenciesResponse | { error?: { message_key?: string } };
      const accountsJson = (await accountsRes.json()) as AccountsResponse | { error?: { message_key?: string } };
      if (!currRes.ok) {
        setErrorKey((currJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      if (!accountsRes.ok) {
        setErrorKey((accountsJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      setCurrencies((currJson as CurrenciesResponse).data ?? []);
      setAccounts(((accountsJson as AccountsResponse).data ?? []).filter((a) => a.type === "cash" || a.type === "bank"));
    } catch {
      setErrorKey("errors.internal");
    }
  }, [tenantId]);

  const loadCustomers = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("pageSize", String(pageSize));
      if (q.trim()) p.set("q", q.trim());
      if (status !== "all") p.set("status", status);

      const res = await apiFetch(`/api/msp/customers?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as CustomerListResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const data = (json as CustomerListResponse).data;
      setItems(data.items ?? []);
      setTotal(data.total ?? 0);
      setPage(data.page ?? page);
      setPageSize(data.pageSize ?? pageSize);

      const ids = (data.items ?? []).map((c) => c.id);
      if (ids.length > 0) {
        const preferredCurrencies = ["AFN", "USD"].filter((c) => activeCurrencies.some((x) => x.code === c));
        const currencyCodes = (preferredCurrencies.length > 0 ? preferredCurrencies : activeCurrencies.slice(0, 2).map((c) => c.code)).join(",");
        const p2 = new URLSearchParams();
        p2.set("ids", ids.join(","));
        if (currencyCodes) p2.set("currencyCodes", currencyCodes);
        const wRes = await apiFetch(`/api/msp/customers/wallets?${p2.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (wRes.ok) {
          const wJson = (await wRes.json()) as WalletsResponse;
          const map: Record<string, string> = {};
          for (const it of wJson.data ?? []) {
            const parts = Object.entries(it.balances ?? {})
              .filter(([, v]) => v !== "0" && v !== "0.0" && v !== "0.00")
              .map(([code, v]) => `${code} ${v}`);
            map[it.customerId] = parts.join(" | ");
          }
          setWalletSummaryByCustomerId(map);
        }
      } else {
        setWalletSummaryByCustomerId({});
      }
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [activeCurrencies, page, pageSize, q, status, tenantId]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  useEffect(() => {
    void loadSetup();
  }, [loadSetup]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    setPage(1);
  }, [q, status, pageSize]);

  const openCreate = () => {
    setEditId(null);
    setForm({ name: "", phone: "", note: "", isActive: true });
    setModalOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditId(c.id);
    setForm({ name: c.name ?? "", phone: c.phone ?? "", note: c.note ?? "", isActive: !!c.isActive });
    setModalOpen(true);
  };

  const loadKyc = useCallback(
    async (customerId: string) => {
      if (!tenantId) return;
      setKycLoading(true);
      setKycErrorKey(null);
      try {
        const res = await apiFetch(`/api/msp/customers/${encodeURIComponent(customerId)}/kyc`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as CustomerKycResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setKycErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const data = (json as CustomerKycResponse).data;
        const profile = data.profile ?? {};
        const getStr = (k: string) => (typeof profile[k] === "string" ? (profile[k] as string) : "");
        const getBool = (k: string) => (typeof profile[k] === "boolean" ? (profile[k] as boolean) : false);

        setKycMeta({ updatedAt: data.updatedAt, verifiedAt: data.verifiedAt, verifiedByUserId: data.verifiedByUserId });
        setKycForm({
          status: (data.status as "none" | "pending" | "verified" | "rejected") ?? "none",
          documentFrontFileId: getStr("documentFrontFileId"),
          documentBackFileId: getStr("documentBackFileId"),
          selfieFileId: getStr("selfieFileId"),
          fullName: getStr("fullName"),
          fatherName: getStr("fatherName"),
          gender: (typeof profile.gender === "string" ? (profile.gender as string) : "") as "" | "male" | "female" | "other",
          dateOfBirth: getStr("dateOfBirth"),
          nationality: getStr("nationality"),
          nationalId: getStr("nationalId"),
          documentType: getStr("documentType"),
          documentNumber: getStr("documentNumber"),
          documentIssuer: getStr("documentIssuer"),
          documentExpiry: getStr("documentExpiry"),
          address: getStr("address"),
          city: getStr("city"),
          country: getStr("country"),
          occupation: getStr("occupation"),
          sourceOfFunds: getStr("sourceOfFunds"),
          isPep: getBool("isPep"),
          riskLevel: (typeof profile.riskLevel === "string" ? (profile.riskLevel as string) : "") as "" | "low" | "medium" | "high",
          note: getStr("note")
        });
      } catch {
        setKycErrorKey("errors.internal");
      } finally {
        setKycLoading(false);
      }
    },
    [tenantId]
  );

  const openKyc = (c: Customer) => {
    setKycCustomer(c);
    setKycErrorKey(null);
    setKycMeta({ updatedAt: null, verifiedAt: null, verifiedByUserId: null });
    setKycForm({
      status: ((c.kycStatus as "none" | "pending" | "verified" | "rejected") ?? "none") as "none" | "pending" | "verified" | "rejected",
      documentFrontFileId: "",
      documentBackFileId: "",
      selfieFileId: "",
      fullName: "",
      fatherName: "",
      gender: "",
      dateOfBirth: "",
      nationality: "",
      nationalId: "",
      documentType: "",
      documentNumber: "",
      documentIssuer: "",
      documentExpiry: "",
      address: "",
      city: "",
      country: "",
      occupation: "",
      sourceOfFunds: "",
      isPep: false,
      riskLevel: "",
      note: ""
    });
    setKycOpen(true);
    void loadKyc(c.id);
  };

  const saveKyc = useCallback(async () => {
    if (!tenantId || !kycCustomer) return;
    setKycSaving(true);
    setKycErrorKey(null);
    try {
      const payload = {
        status: kycForm.status,
        documentFrontFileId: kycForm.documentFrontFileId || undefined,
        documentBackFileId: kycForm.documentBackFileId || undefined,
        selfieFileId: kycForm.selfieFileId || undefined,
        fullName: kycForm.fullName,
        fatherName: kycForm.fatherName,
        gender: kycForm.gender || undefined,
        dateOfBirth: kycForm.dateOfBirth || undefined,
        nationality: kycForm.nationality,
        nationalId: kycForm.nationalId,
        documentType: kycForm.documentType,
        documentNumber: kycForm.documentNumber,
        documentIssuer: kycForm.documentIssuer,
        documentExpiry: kycForm.documentExpiry || undefined,
        address: kycForm.address,
        city: kycForm.city,
        country: kycForm.country,
        occupation: kycForm.occupation,
        sourceOfFunds: kycForm.sourceOfFunds,
        isPep: kycForm.isPep,
        riskLevel: kycForm.riskLevel || undefined,
        note: kycForm.note
      };
      const res = await apiFetch(`/api/msp/customers/${encodeURIComponent(kycCustomer.id)}/kyc`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { data?: { success: boolean }; error?: { message_key?: string } };
      if (!res.ok) {
        setKycErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      await loadCustomers();
      await loadKyc(kycCustomer.id);
    } catch {
      setKycErrorKey("errors.internal");
    } finally {
      setKycSaving(false);
    }
  }, [kycCustomer, kycForm, loadCustomers, loadKyc, tenantId]);

  const uploadKycImage = useCallback(
    async (file: File) => {
      if (!tenantId) return null;
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch(`/api/files?purpose=msp_customer_kyc_document`, { method: "POST", headers: { "X-Tenant-Id": tenantId }, body: fd });
      const json = (await res.json()) as { data?: { id: string; url: string }; error?: { message_key?: string } };
      if (!res.ok) {
        setKycErrorKey(json.error?.message_key ?? "errors.internal");
        return null;
      }
      return json.data?.id ?? null;
    },
    [tenantId]
  );

  const kycFileUrl = useCallback((id: string) => {
    if (!id) return "";
    const base = getApiBaseUrl().replace(/\/$/, "");
    return `${base}/api/files/${encodeURIComponent(id)}`;
  }, []);

  const loadWallet = useCallback(
    async (customerId: string) => {
      if (!tenantId) return;
      setWalletLoading(true);
      setErrorKey(null);
      try {
        const res = await apiFetch(`/api/msp/customers/${encodeURIComponent(customerId)}/wallet`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as WalletResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        setWalletBalances((json as WalletResponse).data ?? []);
      } catch {
        setErrorKey("errors.internal");
      } finally {
        setWalletLoading(false);
      }
    },
    [tenantId]
  );

  const openWallet = (c: Customer) => {
    const currency = activeCurrencies.find((x) => x.code === "AFN")?.code ?? activeCurrencies[0]?.code ?? "AFN";
    const cashAccount = activeAccounts.find((a) => a.currencyCode === currency && a.type === "cash") ?? activeAccounts.find((a) => a.currencyCode === currency) ?? null;
    setWalletCustomer(c);
    setWalletBalances([]);
    setWalletAction("deposit");
    setWalletForm({ currencyCode: currency, cashAccountId: cashAccount?.id ?? "", amount: "", entryDate: isoDate(new Date()), note: "" });
    setWalletOpen(true);
    void loadWallet(c.id);
  };

  const walletAccountOptions = useMemo(() => {
    return activeAccounts.filter((a) => a.currencyCode === walletForm.currencyCode);
  }, [activeAccounts, walletForm.currencyCode]);

  useEffect(() => {
    if (!walletOpen) return;
    if (!walletForm.cashAccountId || !walletAccountOptions.some((a) => a.id === walletForm.cashAccountId)) {
      const preferred = walletAccountOptions.find((a) => a.type === "cash") ?? walletAccountOptions[0] ?? null;
      setWalletForm((p) => ({ ...p, cashAccountId: preferred?.id ?? "" }));
    }
  }, [walletAccountOptions, walletForm.cashAccountId, walletOpen]);

  const submitWallet = useCallback(async () => {
    if (!tenantId || !walletCustomer) return;
    setWalletSaving(true);
    setErrorKey(null);
    try {
      const payload = {
        currencyCode: walletForm.currencyCode,
        cashAccountId: walletForm.cashAccountId,
        amount: walletForm.amount,
        entryDate: walletForm.entryDate,
        note: walletForm.note.trim() || undefined
      };
      const endpoint =
        walletAction === "deposit"
          ? `/api/msp/customers/${encodeURIComponent(walletCustomer.id)}/wallet/deposit`
          : `/api/msp/customers/${encodeURIComponent(walletCustomer.id)}/wallet/withdraw`;

      const res = await apiFetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify(payload) });
      const json = (await res.json()) as { data?: { success: boolean }; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setWalletForm((p) => ({ ...p, amount: "", note: "" }));
      await loadSetup();
      await loadWallet(walletCustomer.id);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setWalletSaving(false);
    }
  }, [loadSetup, loadWallet, tenantId, walletAction, walletCustomer, walletForm.amount, walletForm.cashAccountId, walletForm.currencyCode, walletForm.entryDate, walletForm.note]);

  const save = async () => {
    if (!tenantId) return;
    setSaving(true);
    setErrorKey(null);
    try {
      const payload = {
        name: form.name,
        phone: form.phone,
        note: form.note,
        isActive: form.isActive
      };

      const res = await apiFetch(editId ? `/api/msp/customers/${encodeURIComponent(editId)}` : "/api/msp/customers", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { data?: unknown; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setModalOpen(false);
      await loadCustomers();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  };

  const kycBadge = useCallback(
    (s: Customer["kycStatus"]) => {
      const status = (s || "none") as "none" | "pending" | "verified" | "rejected" | string;
      const labelKey =
        status === "verified"
          ? "app.msp.customers.kyc.status.verified"
          : status === "pending"
            ? "app.msp.customers.kyc.status.pending"
            : status === "rejected"
              ? "app.msp.customers.kyc.status.rejected"
              : "app.msp.customers.kyc.status.none";
      const cls =
        status === "verified"
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : status === "pending"
            ? "border-amber-200 bg-amber-50 text-amber-800"
            : status === "rejected"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-gray-200 bg-gray-50 text-gray-700";
      return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>{t(labelKey)}</span>;
    },
    [t]
  );

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
            <div className="text-lg font-semibold">{t("app.msp.customers.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.msp.customers.subtitle")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => void loadCustomers()}
            >
              {t("common.button.refresh")}
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
              onClick={openCreate}
            >
              {t("common.button.create")}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.filter.search")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("app.msp.customers.filter.search.placeholder")} />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.filter.status")}</label>
            <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value as "all" | "active" | "inactive")}>
              <option value="all">{t("common.filter.all")}</option>
              <option value="active">{t("common.status.active")}</option>
              <option value="inactive">{t("common.status.inactive")}</option>
            </select>
          </div>
          <div className="md:col-span-2 flex items-end justify-end gap-2 text-sm text-gray-700">
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
              <th className="px-4 py-3 text-left">{t("app.msp.customers.table.name")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.customers.table.phone")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.customers.table.status")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.customers.table.kyc")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.customers.table.note")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.customers.table.wallet")}</th>
              <th className="px-4 py-3 text-right">{t("app.msp.customers.table.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                  {t("app.msp.customers.empty")}
                </td>
              </tr>
            ) : (
              items.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-gray-700">{c.phone ?? ""}</td>
                  <td className="px-4 py-3 text-gray-700">{c.isActive ? t("common.status.active") : t("common.status.inactive")}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      {kycBadge(c.kycStatus)}
                      {c.kycVerifiedAt ? <div className="text-xs text-gray-500 tabular-nums">{c.kycVerifiedAt.slice(0, 10)}</div> : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="max-w-[400px] truncate">{c.note ?? ""}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="max-w-[260px] truncate tabular-nums">{walletSummaryByCustomerId[c.id] ?? ""}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                      onClick={() => openEdit(c)}
                    >
                      {t("common.button.edit")}
                    </button>
                    <button
                      type="button"
                      className="ml-2 inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                      onClick={() => openKyc(c)}
                    >
                      {t("app.msp.customers.kyc.button")}
                    </button>
                    <button
                      type="button"
                      className="ml-2 inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                      onClick={() => openWallet(c)}
                    >
                      {t("app.msp.customers.wallet.button")}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => (!saving ? setModalOpen(false) : null)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{editId ? t("app.msp.customers.modal.editTitle") : t("app.msp.customers.modal.createTitle")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.msp.customers.modal.subtitle")}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.field.name")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} disabled={saving} />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.field.phone")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} disabled={saving} />
            </div>

            <div className="flex items-end gap-2">
              <input id="msp_customer_active" type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} disabled={saving} />
              <label htmlFor="msp_customer_active" className="text-sm text-gray-700">
                {t("app.msp.customers.field.active")}
              </label>
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.field.note")}</label>
              <textarea className="mt-1 min-h-[90px] w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} disabled={saving} />
            </div>
          </div>

          {errorKey ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{t(errorKey)}</div> : null}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              onClick={() => void save()}
              disabled={saving}
            >
              {saving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={kycOpen} onClose={() => (!kycSaving ? setKycOpen(false) : null)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">
            {t("app.msp.customers.kyc.title")}
            {kycCustomer ? <span className="text-gray-700"> — {kycCustomer.name}</span> : null}
          </div>
          <div className="mt-2 text-sm text-gray-700">{t("app.msp.customers.kyc.subtitle")}</div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            {kycMeta.updatedAt ? (
              <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 tabular-nums">
                {t("app.msp.customers.kyc.meta.updatedAt")}: {kycMeta.updatedAt.slice(0, 19).replace("T", " ")}
              </div>
            ) : null}
            {kycMeta.verifiedAt ? (
              <div className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 tabular-nums">
                {t("app.msp.customers.kyc.meta.verifiedAt")}: {kycMeta.verifiedAt.slice(0, 19).replace("T", " ")}
              </div>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.status")}</label>
              <select
                className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                value={kycForm.status}
                onChange={(e) => setKycForm((p) => ({ ...p, status: e.target.value as "none" | "pending" | "verified" | "rejected" }))}
                disabled={kycSaving || kycLoading}
              >
                <option value="none">{t("app.msp.customers.kyc.status.none")}</option>
                <option value="pending">{t("app.msp.customers.kyc.status.pending")}</option>
                <option value="verified">{t("app.msp.customers.kyc.status.verified")}</option>
                <option value="rejected">{t("app.msp.customers.kyc.status.rejected")}</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <input
                id="msp_customer_kyc_ispep"
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={!!kycForm.isPep}
                onChange={(e) => setKycForm((p) => ({ ...p, isPep: e.target.checked }))}
                disabled={kycSaving || kycLoading}
              />
              <label htmlFor="msp_customer_kyc_ispep" className="text-sm text-gray-700">
                {t("app.msp.customers.kyc.field.isPep")}
              </label>
            </div>

            <div className="md:col-span-2">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.doc.front")}</div>
                  {kycForm.documentFrontFileId ? (
                    <img src={kycFileUrl(kycForm.documentFrontFileId)} alt="" className="mt-2 h-24 w-full rounded-lg object-cover" />
                  ) : (
                    <div className="mt-2 h-24 w-full rounded-lg bg-gray-50" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-2 block w-full text-xs"
                    disabled={kycSaving || kycLoading}
                    onChange={async (e) => {
                      const f = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      if (!f) return;
                      const id = await uploadKycImage(f);
                      if (id) setKycForm((p) => ({ ...p, documentFrontFileId: id }));
                    }}
                  />
                  {kycForm.documentFrontFileId ? (
                    <button
                      type="button"
                      className="mt-2 inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                      onClick={() => setKycForm((p) => ({ ...p, documentFrontFileId: "" }))}
                      disabled={kycSaving || kycLoading}
                    >
                      {t("common.button.remove")}
                    </button>
                  ) : null}
                </div>

                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.doc.back")}</div>
                  {kycForm.documentBackFileId ? (
                    <img src={kycFileUrl(kycForm.documentBackFileId)} alt="" className="mt-2 h-24 w-full rounded-lg object-cover" />
                  ) : (
                    <div className="mt-2 h-24 w-full rounded-lg bg-gray-50" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-2 block w-full text-xs"
                    disabled={kycSaving || kycLoading}
                    onChange={async (e) => {
                      const f = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      if (!f) return;
                      const id = await uploadKycImage(f);
                      if (id) setKycForm((p) => ({ ...p, documentBackFileId: id }));
                    }}
                  />
                  {kycForm.documentBackFileId ? (
                    <button
                      type="button"
                      className="mt-2 inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                      onClick={() => setKycForm((p) => ({ ...p, documentBackFileId: "" }))}
                      disabled={kycSaving || kycLoading}
                    >
                      {t("common.button.remove")}
                    </button>
                  ) : null}
                </div>

                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.doc.selfie")}</div>
                  {kycForm.selfieFileId ? (
                    <img src={kycFileUrl(kycForm.selfieFileId)} alt="" className="mt-2 h-24 w-full rounded-lg object-cover" />
                  ) : (
                    <div className="mt-2 h-24 w-full rounded-lg bg-gray-50" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-2 block w-full text-xs"
                    disabled={kycSaving || kycLoading}
                    onChange={async (e) => {
                      const f = e.target.files?.[0] ?? null;
                      e.target.value = "";
                      if (!f) return;
                      const id = await uploadKycImage(f);
                      if (id) setKycForm((p) => ({ ...p, selfieFileId: id }));
                    }}
                  />
                  {kycForm.selfieFileId ? (
                    <button
                      type="button"
                      className="mt-2 inline-flex h-8 items-center justify-center rounded-lg border border-gray-200 bg-white px-3 text-xs font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                      onClick={() => setKycForm((p) => ({ ...p, selfieFileId: "" }))}
                      disabled={kycSaving || kycLoading}
                    >
                      {t("common.button.remove")}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.fullName")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={kycForm.fullName} onChange={(e) => setKycForm((p) => ({ ...p, fullName: e.target.value }))} disabled={kycSaving || kycLoading} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.fatherName")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={kycForm.fatherName} onChange={(e) => setKycForm((p) => ({ ...p, fatherName: e.target.value }))} disabled={kycSaving || kycLoading} />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.gender")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={kycForm.gender} onChange={(e) => setKycForm((p) => ({ ...p, gender: e.target.value as "" | "male" | "female" | "other" }))} disabled={kycSaving || kycLoading}>
                <option value="">{t("common.select")}</option>
                <option value="male">{t("app.msp.customers.kyc.gender.male")}</option>
                <option value="female">{t("app.msp.customers.kyc.gender.female")}</option>
                <option value="other">{t("app.msp.customers.kyc.gender.other")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.dateOfBirth")}</label>
              <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={kycForm.dateOfBirth} onChange={(e) => setKycForm((p) => ({ ...p, dateOfBirth: e.target.value }))} disabled={kycSaving || kycLoading} />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.nationality")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={kycForm.nationality} onChange={(e) => setKycForm((p) => ({ ...p, nationality: e.target.value }))} disabled={kycSaving || kycLoading} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.nationalId")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={kycForm.nationalId} onChange={(e) => setKycForm((p) => ({ ...p, nationalId: e.target.value }))} disabled={kycSaving || kycLoading} />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.documentType")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={kycForm.documentType} onChange={(e) => setKycForm((p) => ({ ...p, documentType: e.target.value }))} disabled={kycSaving || kycLoading} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.documentNumber")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={kycForm.documentNumber} onChange={(e) => setKycForm((p) => ({ ...p, documentNumber: e.target.value }))} disabled={kycSaving || kycLoading} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.documentIssuer")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={kycForm.documentIssuer} onChange={(e) => setKycForm((p) => ({ ...p, documentIssuer: e.target.value }))} disabled={kycSaving || kycLoading} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.documentExpiry")}</label>
              <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={kycForm.documentExpiry} onChange={(e) => setKycForm((p) => ({ ...p, documentExpiry: e.target.value }))} disabled={kycSaving || kycLoading} />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.address")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={kycForm.address} onChange={(e) => setKycForm((p) => ({ ...p, address: e.target.value }))} disabled={kycSaving || kycLoading} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.city")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={kycForm.city} onChange={(e) => setKycForm((p) => ({ ...p, city: e.target.value }))} disabled={kycSaving || kycLoading} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.country")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={kycForm.country} onChange={(e) => setKycForm((p) => ({ ...p, country: e.target.value }))} disabled={kycSaving || kycLoading} />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.occupation")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={kycForm.occupation} onChange={(e) => setKycForm((p) => ({ ...p, occupation: e.target.value }))} disabled={kycSaving || kycLoading} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.sourceOfFunds")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={kycForm.sourceOfFunds} onChange={(e) => setKycForm((p) => ({ ...p, sourceOfFunds: e.target.value }))} disabled={kycSaving || kycLoading} />
            </div>

            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.riskLevel")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={kycForm.riskLevel} onChange={(e) => setKycForm((p) => ({ ...p, riskLevel: e.target.value as "" | "low" | "medium" | "high" }))} disabled={kycSaving || kycLoading}>
                <option value="">{t("common.select")}</option>
                <option value="low">{t("app.msp.customers.kyc.risk.low")}</option>
                <option value="medium">{t("app.msp.customers.kyc.risk.medium")}</option>
                <option value="high">{t("app.msp.customers.kyc.risk.high")}</option>
              </select>
            </div>
            <div />

            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.kyc.field.note")}</label>
              <textarea className="mt-1 min-h-[90px] w-full rounded-xl border border-gray-200 px-3 py-2 text-sm" value={kycForm.note} onChange={(e) => setKycForm((p) => ({ ...p, note: e.target.value }))} disabled={kycSaving || kycLoading} />
            </div>
          </div>

          {kycErrorKey ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{t(kycErrorKey)}</div> : null}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setKycOpen(false)}
              disabled={kycSaving}
            >
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              onClick={() => void saveKyc()}
              disabled={kycSaving}
            >
              {kycSaving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={walletOpen} onClose={() => (!walletSaving ? setWalletOpen(false) : null)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">
            {t("app.msp.customers.wallet.title")}
            {walletCustomer ? <span className="text-gray-700"> — {walletCustomer.name}</span> : null}
          </div>
          <div className="mt-2 text-sm text-gray-700">{t("app.msp.customers.wallet.subtitle")}</div>

          <div className="mt-6 overflow-hidden rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3 text-left">{t("app.msp.customers.wallet.table.currency")}</th>
                  <th className="px-4 py-3 text-right">{t("app.msp.customers.wallet.table.balance")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {walletLoading ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-gray-500">
                      {t("common.loading")}
                    </td>
                  </tr>
                ) : walletBalances.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-4 py-8 text-center text-gray-500">
                      {t("app.msp.customers.wallet.empty")}
                    </td>
                  </tr>
                ) : (
                  walletBalances.map((b) => (
                    <tr key={b.currencyCode}>
                      <td className="px-4 py-3 text-gray-700">{b.currencyCode}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{b.balance}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.wallet.field.action")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={walletAction} onChange={(e) => setWalletAction(e.target.value as "deposit" | "withdraw")} disabled={walletSaving}>
                <option value="deposit">{t("app.msp.customers.wallet.action.deposit")}</option>
                <option value="withdraw">{t("app.msp.customers.wallet.action.withdraw")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.wallet.field.currency")}</label>
              <select
                className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                value={walletForm.currencyCode}
                onChange={(e) => setWalletForm((p) => ({ ...p, currencyCode: e.target.value }))}
                disabled={walletSaving}
              >
                {activeCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.wallet.field.account")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={walletForm.cashAccountId} onChange={(e) => setWalletForm((p) => ({ ...p, cashAccountId: e.target.value }))} disabled={walletSaving}>
                <option value="">{t("common.select")}</option>
                {walletAccountOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.type.toUpperCase()} — {a.name} ({a.currencyCode}) ({a.balance})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.wallet.field.date")}</label>
              <input type="date" className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={walletForm.entryDate} onChange={(e) => setWalletForm((p) => ({ ...p, entryDate: e.target.value }))} disabled={walletSaving} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.wallet.field.amount")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm text-right tabular-nums" inputMode="decimal" value={walletForm.amount} onChange={(e) => setWalletForm((p) => ({ ...p, amount: e.target.value }))} disabled={walletSaving} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.customers.wallet.field.note")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={walletForm.note} onChange={(e) => setWalletForm((p) => ({ ...p, note: e.target.value }))} disabled={walletSaving} />
            </div>
          </div>

          {errorKey ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{t(errorKey)}</div> : null}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setWalletOpen(false)} disabled={walletSaving}>
              {t("common.button.cancel")}
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60" onClick={() => void submitWallet()} disabled={walletSaving}>
              {walletSaving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
