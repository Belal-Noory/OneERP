"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type CreditCustomerSummary = {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  salesCount: number;
  totalVolume: string;
  totalAmount: string;
  lastSaleAt: string | null;
};

type CreditStatement = {
  customer: { id: string; name: string; phone: string | null };
  period: { from: string | null; to: string | null };
  totals: { salesCount: number; totalVolume: string; totalAmount: string };
  byNozzle: { nozzleId: string; nozzleName: string; tankName: string | null; fuelType: string | null; salesCount: number; totalVolume: string; totalAmount: string }[];
  sales: {
    id: string;
    createdAt: string;
    nozzleId: string;
    invoiceNumber: string | null;
    volume: string;
    pricePerUnit: string;
    totalAmount: string;
    driverName: string | null;
    licensePlate: string | null;
    nozzle: { name: string; tank: { name: string; fuelType: string } };
  }[];
};

type CreditInvoiceListItem = {
  invoiceNumber: string;
  month: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  createdAt: string;
  status: string;
  customer: { id: string; name: string; phone: string | null };
  salesCount: number;
  totalVolume: string;
  totalAmount: string;
  paidAmount: string;
  balance: string;
};

type CreditInvoicePayment = { id: string; amount: string; method: string; note: string | null; receivedAt: string; createdAt: string };

type CreditInvoiceDetail = {
  invoice: CreditInvoiceListItem;
  payments: CreditInvoicePayment[];
  sales: {
    id: string;
    createdAt: string;
    nozzleId: string;
    volume: string;
    pricePerUnit: string;
    totalAmount: string;
    driverName: string | null;
    licensePlate: string | null;
    nozzle: { name: string; tank: { name: string; fuelType: string } };
  }[];
};

type CreditAgingRow = {
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  invoicesCount: number;
  totalBalance: string;
  bucket0_30: string;
  bucket31_60: string;
  bucket61_90: string;
  bucket90p: string;
};

type CreditAgingData = {
  asOf: string;
  totals: {
    customersCount: number;
    invoicesCount: number;
    totalBalance: string;
    bucket0_30: string;
    bucket31_60: string;
    bucket61_90: string;
    bucket90p: string;
  };
  rows: CreditAgingRow[];
};

type CreditLedgerData = {
  customer: { id: string; name: string; phone: string | null };
  period: { from: string | null; to: string | null };
  totals: { invoicesCount: number; paymentsCount: number; totalInvoiced: string; totalPaid: string; balance: string };
  invoices: {
    invoiceNumber: string;
    status: string;
    createdAt: string;
    month: string | null;
    periodFrom: string | null;
    periodTo: string | null;
    totalAmount: string;
    paidAmount: string;
    balance: string;
  }[];
  payments: { id: string; invoiceNumber: string; amount: string; method: string; note: string | null; receivedAt: string }[];
  timeline: (
    | { type: "invoice"; at: string; invoiceNumber: string; debit: string; credit: string; status: string; runningBalance: string }
    | { type: "payment"; at: string; invoiceNumber: string; paymentId: string; debit: string; credit: string; method: string; note: string | null; runningBalance: string }
  )[];
};

function monthRange(monthValue: string): { from: string; to: string } | null {
  const v = monthValue.trim();
  if (!/^\d{4}-\d{2}$/.test(v)) return null;
  const [y, m] = v.split("-").map((x) => Number(x));
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null;
  const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const to = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { from: from.toISOString(), to: to.toISOString() };
}

export function FuelCreditClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const defaultMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const [month, setMonth] = useState(defaultMonth);
  const defaultAsOf = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [asOf, setAsOf] = useState(defaultAsOf);
  const [view, setView] = useState<"customers" | "invoices" | "aging">("customers");

  const [rows, setRows] = useState<CreditCustomerSummary[]>([]);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  const [invoices, setInvoices] = useState<CreditInvoiceListItem[]>([]);
  const [invoicesExportMenuOpen, setInvoicesExportMenuOpen] = useState(false);
  const [invoicesExportingXlsx, setInvoicesExportingXlsx] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoice, setInvoice] = useState<CreditInvoiceDetail | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNote, setPaymentNote] = useState("");
  const [addingPayment, setAddingPayment] = useState(false);
  const [deletePaymentDialogOpen, setDeletePaymentDialogOpen] = useState(false);
  const [deletePaymentTarget, setDeletePaymentTarget] = useState<CreditInvoicePayment | null>(null);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [editPaymentOpen, setEditPaymentOpen] = useState(false);
  const [editPaymentTarget, setEditPaymentTarget] = useState<CreditInvoicePayment | null>(null);
  const [editPaymentAmount, setEditPaymentAmount] = useState("");
  const [editPaymentMethod, setEditPaymentMethod] = useState("cash");
  const [editPaymentNote, setEditPaymentNote] = useState("");
  const [editPaymentReceivedAt, setEditPaymentReceivedAt] = useState("");
  const [savingPaymentEdit, setSavingPaymentEdit] = useState(false);
  const [voidInvoiceDialogOpen, setVoidInvoiceDialogOpen] = useState(false);
  const [reopenInvoiceDialogOpen, setReopenInvoiceDialogOpen] = useState(false);
  const [updatingInvoiceStatus, setUpdatingInvoiceStatus] = useState(false);

  const [statementOpen, setStatementOpen] = useState(false);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statement, setStatement] = useState<CreditStatement | null>(null);
  const [statementExportingXlsx, setStatementExportingXlsx] = useState(false);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [generatedInvoiceNumber, setGeneratedInvoiceNumber] = useState<string | null>(null);

  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState<"all" | "issued" | "paid" | "void">("all");

  const [aging, setAging] = useState<CreditAgingData | null>(null);
  const [agingExportMenuOpen, setAgingExportMenuOpen] = useState(false);
  const [agingExportingXlsx, setAgingExportingXlsx] = useState(false);

  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledger, setLedger] = useState<CreditLedgerData | null>(null);
  const [ledgerExportingXlsx, setLedgerExportingXlsx] = useState(false);

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

  const reloadCustomers = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const r = monthRange(month);
      const params = new URLSearchParams();
      if (r) {
        params.set("from", r.from);
        params.set("to", r.to);
      }
      const res = await apiFetch(`/api/fuel/credit/summary?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as { data?: CreditCustomerSummary[]; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setRows((json as { data: CreditCustomerSummary[] }).data);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [month, tenantId]);

  useEffect(() => {
    if (view !== "customers") return;
    void reloadCustomers();
  }, [reloadCustomers, view]);

  const reloadInvoices = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const params = new URLSearchParams();
      if (/^\d{4}-\d{2}$/.test(month)) params.set("month", month);
      const q = invoiceSearch.trim();
      if (q) params.set("q", q);
      if (invoiceStatus !== "all") params.set("status", invoiceStatus);
      const res = await apiFetch(`/api/fuel/credit/invoices?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as { data?: CreditInvoiceListItem[]; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setInvoices((json as { data: CreditInvoiceListItem[] }).data);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [invoiceSearch, invoiceStatus, month, tenantId]);

  useEffect(() => {
    if (view !== "invoices") return;
    if (!tenantId) return;
    const handle = window.setTimeout(() => {
      void reloadInvoices();
    }, 250);
    return () => window.clearTimeout(handle);
  }, [invoiceSearch, invoiceStatus, reloadInvoices, tenantId, view]);

  const reloadAging = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const params = new URLSearchParams();
      const v = asOf.trim();
      if (v) params.set("asOf", new Date(`${v}T23:59:59.999Z`).toISOString());
      const res = await apiFetch(`/api/fuel/credit/aging?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as { data?: CreditAgingData; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setAging((json as { data: CreditAgingData }).data);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [asOf, tenantId]);

  useEffect(() => {
    if (view !== "aging") return;
    if (!tenantId) return;
    const handle = window.setTimeout(() => {
      void reloadAging();
    }, 250);
    return () => window.clearTimeout(handle);
  }, [asOf, reloadAging, tenantId, view]);

  const openInvoice = useCallback(
    async (invoiceNumber: string) => {
      if (!tenantId) return;
      setInvoiceOpen(true);
      setInvoiceLoading(true);
      setInvoice(null);
      setPaymentAmount("");
      setPaymentMethod("cash");
      setPaymentNote("");
      setErrorKey(null);
      try {
        const res = await apiFetch(`/api/fuel/credit/invoices/${encodeURIComponent(invoiceNumber)}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as { data?: CreditInvoiceDetail; error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey(json.error?.message_key ?? "errors.internal");
          setInvoiceOpen(false);
          return;
        }
        setInvoice((json as { data: CreditInvoiceDetail }).data);
      } catch {
        setErrorKey("errors.internal");
        setInvoiceOpen(false);
      } finally {
        setInvoiceLoading(false);
      }
    },
    [tenantId]
  );

  const openStatement = useCallback(
    async (customerId: string) => {
      if (!tenantId) return;
      setStatementOpen(true);
      setStatementLoading(true);
      setStatement(null);
      setGeneratedInvoiceNumber(null);
      setErrorKey(null);
      try {
        const r = monthRange(month);
        const params = new URLSearchParams();
        if (r) {
          params.set("from", r.from);
          params.set("to", r.to);
        }
        const res = await apiFetch(`/api/fuel/credit/customers/${customerId}/statement?${params.toString()}`, {
          cache: "no-store",
          headers: { "X-Tenant-Id": tenantId }
        });
        const json = (await res.json()) as { data?: CreditStatement; error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey(json.error?.message_key ?? "errors.internal");
          setStatementOpen(false);
          return;
        }
        setStatement((json as { data: CreditStatement }).data);
      } catch {
        setErrorKey("errors.internal");
        setStatementOpen(false);
      } finally {
        setStatementLoading(false);
      }
    },
    [month, tenantId]
  );

  const openLedger = useCallback(
    async (customerId: string) => {
      if (!tenantId) return;
      setLedgerOpen(true);
      setLedgerLoading(true);
      setLedger(null);
      setErrorKey(null);
      try {
        const r = monthRange(month);
        const params = new URLSearchParams();
        if (r) {
          params.set("from", r.from);
          params.set("to", r.to);
        }
        const res = await apiFetch(`/api/fuel/credit/customers/${customerId}/ledger?${params.toString()}`, {
          cache: "no-store",
          headers: { "X-Tenant-Id": tenantId }
        });
        const json = (await res.json()) as { data?: CreditLedgerData; error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey(json.error?.message_key ?? "errors.internal");
          setLedgerOpen(false);
          return;
        }
        setLedger((json as { data: CreditLedgerData }).data);
      } catch {
        setErrorKey("errors.internal");
        setLedgerOpen(false);
      } finally {
        setLedgerLoading(false);
      }
    },
    [month, tenantId]
  );

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-lg font-semibold">{t("app.fuel.credit.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.fuel.credit.subtitle")}</div>
        <div className="mt-6 text-gray-500">{t("common.loading")}</div>
      </div>
    );
  }

  if (errorKey) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-lg font-semibold">{t("app.fuel.credit.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.fuel.credit.subtitle")}</div>
        <div className="mt-6 text-red-600">{t(errorKey)}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-lg font-semibold">{t("app.fuel.credit.title")}</div>
          <div className="mt-2 text-gray-700">{t("app.fuel.credit.subtitle")}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view === "aging" ? (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.fuel.credit.aging.asOf")}</label>
              <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="mt-1 h-10 rounded-xl border border-gray-200 px-3 text-sm" />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.fuel.credit.filter.month")}</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="mt-1 h-10 rounded-xl border border-gray-200 px-3 text-sm" />
            </div>
          )}
          {view === "invoices" ? (
            <>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.fuel.credit.invoices.filter.search")}</label>
                <input
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                  placeholder={t("app.fuel.credit.invoices.filter.search.placeholder")}
                  className="mt-1 h-10 w-56 rounded-xl border border-gray-200 px-3 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.fuel.credit.invoices.filter.status")}</label>
                <select
                  value={invoiceStatus}
                  onChange={(e) => setInvoiceStatus(e.target.value as "all" | "issued" | "paid" | "void")}
                  className="mt-1 h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm"
                >
                  <option value="all">{t("app.fuel.credit.invoices.status.all")}</option>
                  <option value="issued">{t("app.fuel.credit.invoices.status.issued")}</option>
                  <option value="paid">{t("app.fuel.credit.invoices.status.paid")}</option>
                  <option value="void">{t("app.fuel.credit.invoices.status.void")}</option>
                </select>
              </div>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => void (view === "customers" ? reloadCustomers() : view === "invoices" ? reloadInvoices() : reloadAging())}
            className="mt-5 inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            {t("common.button.refresh")}
          </button>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <button
              type="button"
              className={
                view === "customers"
                  ? "h-10 rounded-xl bg-gray-900 px-3 text-sm font-medium text-white"
                  : "h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
              }
              onClick={() => setView("customers")}
            >
              {t("app.fuel.credit.view.customers")}
            </button>
            <button
              type="button"
              className={
                view === "invoices"
                  ? "h-10 rounded-xl bg-gray-900 px-3 text-sm font-medium text-white"
                  : "h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
              }
              onClick={() => {
                setView("invoices");
                void reloadInvoices();
              }}
            >
              {t("app.fuel.credit.view.invoices")}
            </button>
            <button
              type="button"
              className={
                view === "aging"
                  ? "h-10 rounded-xl bg-gray-900 px-3 text-sm font-medium text-white"
                  : "h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
              }
              onClick={() => {
                setView("aging");
                void reloadAging();
              }}
            >
              {t("app.fuel.credit.view.aging")}
            </button>
          </div>
          <div className="relative mt-5">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() =>
                view === "customers"
                  ? setExportMenuOpen((v) => !v)
                  : view === "invoices"
                    ? setInvoicesExportMenuOpen((v) => !v)
                    : setAgingExportMenuOpen((v) => !v)
              }
              disabled={
                view === "customers"
                  ? exportingXlsx || rows.length === 0
                  : view === "invoices"
                    ? invoicesExportingXlsx || invoices.length === 0
                    : agingExportingXlsx || !aging || aging.rows.length === 0
              }
            >
              {view === "customers"
                ? exportingXlsx
                  ? t("common.working")
                  : t("app.shop.reports.export.button")
                : view === "invoices"
                  ? invoicesExportingXlsx
                    ? t("common.working")
                    : t("app.shop.reports.export.button")
                  : agingExportingXlsx
                    ? t("common.working")
                    : t("app.shop.reports.export.button")}
            </button>
            {view === "customers" && exportMenuOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  onClick={async () => {
                    setExportingXlsx(true);
                    setErrorKey(null);
                    try {
                      const XLSX = await import("xlsx");
                      const wb = XLSX.utils.book_new();
                      const summaryAoA = [["Fuel credit summary"], ["Exported at", new Date().toISOString()], ["Month", month], ["Rows", String(rows.length)]];
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");
                      const header = ["Customer", "Phone", "Sales", "Volume", "Total", "Last sale"];
                      const dataRows = rows.map((r) => [r.customerName, r.customerPhone ?? "", String(r.salesCount), r.totalVolume, r.totalAmount, r.lastSaleAt ?? ""]);
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...dataRows]), "Credit");
                      const safeDate = new Date().toISOString().slice(0, 10);
                      XLSX.writeFile(wb, `fuel_credit_${month}_${safeDate}.xlsx`);
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
            {view === "invoices" && invoicesExportMenuOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  onClick={async () => {
                    setInvoicesExportingXlsx(true);
                    setErrorKey(null);
                    try {
                      const XLSX = await import("xlsx");
                      const wb = XLSX.utils.book_new();
                      const summaryAoA = [["Fuel credit invoices"], ["Exported at", new Date().toISOString()], ["Month", month], ["Rows", String(invoices.length)]];
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");
                      const header = ["Invoice", "Customer", "Status", "Sales", "Volume", "Total", "Paid", "Balance", "Created at"];
                      const dataRows = invoices.map((i) => [
                        i.invoiceNumber,
                        i.customer.name,
                        i.status,
                        String(i.salesCount),
                        i.totalVolume,
                        i.totalAmount,
                        i.paidAmount,
                        i.balance,
                        i.createdAt
                      ]);
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...dataRows]), "Invoices");
                      const safeDate = new Date().toISOString().slice(0, 10);
                      XLSX.writeFile(wb, `fuel_credit_invoices_${month}_${safeDate}.xlsx`);
                    } catch {
                      setErrorKey("errors.internal");
                    } finally {
                      setInvoicesExportingXlsx(false);
                      setInvoicesExportMenuOpen(false);
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
            {view === "aging" && agingExportMenuOpen ? (
              <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                  onClick={async () => {
                    if (!aging) return;
                    setAgingExportingXlsx(true);
                    setErrorKey(null);
                    try {
                      const XLSX = await import("xlsx");
                      const wb = XLSX.utils.book_new();
                      const summaryAoA = [
                        ["Fuel credit aging"],
                        ["Exported at", new Date().toISOString()],
                        ["As of", aging.asOf],
                        ["Customers", String(aging.totals.customersCount)],
                        ["Invoices", String(aging.totals.invoicesCount)],
                        ["Total balance", aging.totals.totalBalance]
                      ];
                      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");
                      XLSX.utils.book_append_sheet(
                        wb,
                        XLSX.utils.aoa_to_sheet([
                          ["Customer", "Phone", "Invoices", "0-30", "31-60", "61-90", "90+", "Total balance"],
                          ...aging.rows.map((r) => [
                            r.customerName,
                            r.customerPhone ?? "",
                            String(r.invoicesCount),
                            r.bucket0_30,
                            r.bucket31_60,
                            r.bucket61_90,
                            r.bucket90p,
                            r.totalBalance
                          ])
                        ]),
                        "Aging"
                      );
                      const safeDate = new Date().toISOString().slice(0, 10);
                      XLSX.writeFile(wb, `fuel_credit_aging_${safeDate}.xlsx`);
                    } catch {
                      setErrorKey("errors.internal");
                    } finally {
                      setAgingExportingXlsx(false);
                      setAgingExportMenuOpen(false);
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
        </div>
      </div>

      <div className="mt-6">
        {view === "customers" ? (
          rows.length === 0 ? (
            <div className="py-10 text-center text-gray-500">{t("app.fuel.credit.empty")}</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.table.customer")}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.table.sales")}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.table.volume")}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.table.total")}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.table.lastSale")}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("common.button.open")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {rows.map((r) => (
                    <tr key={r.customerId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="font-medium">{r.customerName}</div>
                        {r.customerPhone ? <div className="text-xs text-gray-500">{r.customerPhone}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{r.salesCount}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{r.totalVolume}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold text-gray-900">{r.totalAmount}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{r.lastSaleAt ? new Date(r.lastSaleAt).toLocaleString() : ""}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
                          onClick={() => void openStatement(r.customerId)}
                        >
                          {t("app.fuel.credit.action.statement")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : view === "invoices" ? (
          invoices.length === 0 ? (
          <div className="py-10 text-center text-gray-500">{t("app.fuel.credit.invoices.empty")}</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.invoices.table.invoice")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.table.customer")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("common.status")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.invoices.table.total")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.invoices.table.paid")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.invoices.table.balance")}</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("common.button.open")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {invoices.map((i) => (
                  <tr key={i.invoiceNumber} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{i.invoiceNumber}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{i.customer.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{i.status}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold text-gray-900">{i.totalAmount}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{i.paidAmount}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{i.balance}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
                        onClick={() => void openInvoice(i.invoiceNumber)}
                      >
                        {t("common.button.open")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
        ) : !aging || aging.rows.length === 0 ? (
          <div className="py-10 text-center text-gray-500">{t("app.fuel.credit.aging.empty")}</div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-5">
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.aging.totalBalance")}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{aging.totals.totalBalance}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.aging.bucket.0_30")}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{aging.totals.bucket0_30}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.aging.bucket.31_60")}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{aging.totals.bucket31_60}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.aging.bucket.61_90")}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{aging.totals.bucket61_90}</div>
              </div>
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.aging.bucket.90p")}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{aging.totals.bucket90p}</div>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.aging.table.customer")}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.aging.table.invoices")}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.aging.bucket.0_30")}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.aging.bucket.31_60")}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.aging.bucket.61_90")}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.aging.bucket.90p")}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.aging.table.total")}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">{t("common.button.open")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {aging.rows.map((r) => (
                    <tr key={r.customerId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="font-medium">{r.customerName}</div>
                        {r.customerPhone ? <div className="text-xs text-gray-500">{r.customerPhone}</div> : null}
                      </td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{r.invoicesCount}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{r.bucket0_30}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{r.bucket31_60}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{r.bucket61_90}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums text-gray-700">{r.bucket90p}</td>
                      <td className="px-4 py-3 text-right text-sm tabular-nums font-semibold text-gray-900">{r.totalBalance}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-900 hover:bg-gray-50"
                          onClick={() => void openStatement(r.customerId)}
                        >
                          {t("app.fuel.credit.action.statement")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal open={statementOpen} onClose={() => setStatementOpen(false)}>
        <div className="w-full max-w-5xl p-6 md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xl font-semibold">{t("app.fuel.credit.statement.title")}</div>
              {statement ? <div className="mt-1 text-sm text-gray-600">{statement.customer.name}</div> : null}
              {generatedInvoiceNumber ? <div className="mt-1 text-sm text-green-700">{t("app.fuel.credit.invoice.created")}: {generatedInvoiceNumber}</div> : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={!statement || generatingInvoice}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                onClick={async () => {
                  if (!tenantId || !statement) return;
                  setGeneratingInvoice(true);
                  setErrorKey(null);
                  setGeneratedInvoiceNumber(null);
                  try {
                    const res = await apiFetch(`/api/fuel/credit/customers/${statement.customer.id}/invoices/generate`, {
                      method: "POST",
                      headers: { "X-Tenant-Id": tenantId, "Content-Type": "application/json" },
                      body: JSON.stringify({ month })
                    });
                    const json = (await res.json()) as { data?: { invoiceNumber?: string }; error?: { message_key?: string } };
                    if (!res.ok) {
                      setErrorKey(json.error?.message_key ?? "errors.internal");
                      return;
                    }
                    const inv = json.data?.invoiceNumber;
                    if (inv) setGeneratedInvoiceNumber(inv);
                    await openStatement(statement.customer.id);
                    if (view === "invoices") await reloadInvoices();
                  } catch {
                    setErrorKey("errors.internal");
                  } finally {
                    setGeneratingInvoice(false);
                  }
                }}
              >
                {generatingInvoice ? t("common.working") : t("app.fuel.credit.invoice.generate")}
              </button>

              <button
                type="button"
                disabled={!statement}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                onClick={() => {
                  if (!statement) return;
                  void openLedger(statement.customer.id);
                }}
              >
                {t("app.fuel.credit.ledger.open")}
              </button>

              <button
                type="button"
                disabled={!statement || statementExportingXlsx}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                onClick={async () => {
                  if (!statement) return;
                  setStatementExportingXlsx(true);
                  setErrorKey(null);
                  try {
                    const XLSX = await import("xlsx");
                    const wb = XLSX.utils.book_new();
                    const summaryAoA = [
                      ["Fuel credit statement"],
                      ["Exported at", new Date().toISOString()],
                      ["Customer", statement.customer.name],
                      ["Phone", statement.customer.phone ?? ""],
                      ["From", statement.period.from ?? ""],
                      ["To", statement.period.to ?? ""],
                      ["Sales", String(statement.totals.salesCount)],
                      ["Volume", statement.totals.totalVolume],
                      ["Total", statement.totals.totalAmount]
                    ];
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");

                    XLSX.utils.book_append_sheet(
                      wb,
                      XLSX.utils.aoa_to_sheet([
                        ["Nozzle", "Tank", "Fuel type", "Sales", "Volume", "Total"],
                        ...statement.byNozzle.map((n) => [n.nozzleName, n.tankName ?? "", n.fuelType ?? "", String(n.salesCount), n.totalVolume, n.totalAmount])
                      ]),
                      "Nozzles"
                    );

                    XLSX.utils.book_append_sheet(
                      wb,
                      XLSX.utils.aoa_to_sheet([
                        ["Time", "Nozzle", "Tank", "Fuel", "Volume", "Price", "Total", "Driver", "Plate"],
                        ...statement.sales.map((s) => [
                          new Date(s.createdAt).toISOString(),
                          s.nozzle.name,
                          s.nozzle.tank.name,
                          s.nozzle.tank.fuelType,
                          s.volume,
                          s.pricePerUnit,
                          s.totalAmount,
                          s.driverName ?? "",
                          s.licensePlate ?? ""
                        ])
                      ]),
                      "Sales"
                    );

                    const safeDate = new Date().toISOString().slice(0, 10);
                    XLSX.writeFile(wb, `fuel_credit_statement_${month}_${safeDate}.xlsx`);
                  } catch {
                    setErrorKey("errors.internal");
                  } finally {
                    setStatementExportingXlsx(false);
                  }
                }}
              >
                {statementExportingXlsx ? t("common.working") : t("app.shop.reports.export.excel")}
              </button>
            </div>
          </div>

          {statementLoading ? (
            <div className="mt-6 text-gray-500">{t("common.loading")}</div>
          ) : !statement ? (
            <div className="mt-6 text-gray-500">{t("errors.notFound")}</div>
          ) : (
            <div className="mt-6 space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.statement.sales")}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{statement.totals.salesCount}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.statement.volume")}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{statement.totals.totalVolume}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.statement.total")}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{statement.totals.totalAmount}</div>
                </div>
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
                    {statement.byNozzle.map((n) => (
                      <tr key={n.nozzleId}>
                        <td className="px-4 py-3">{n.nozzleName}</td>
                        <td className="px-4 py-3">{n.tankName ?? ""}</td>
                        <td className="px-4 py-3">{n.fuelType ?? ""}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{n.salesCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{n.totalVolume}</td>
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

      <Modal open={ledgerOpen} onClose={() => setLedgerOpen(false)}>
        <div className="w-full max-w-5xl p-6 md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xl font-semibold">{t("app.fuel.credit.ledger.title")}</div>
              {ledger ? <div className="mt-1 text-sm text-gray-600">{ledger.customer.name}</div> : null}
              {ledger?.period.from || ledger?.period.to ? (
                <div className="mt-1 text-xs text-gray-500">
                  {t("app.fuel.credit.ledger.period")}: {ledger.period.from ?? ""} {ledger.period.to ? `→ ${ledger.period.to}` : ""}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {ledger ? (
                <a
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/fuel/credit/customers/${encodeURIComponent(ledger.customer.id)}/ledger/print?paper=a4${ledger.period.from ? `&from=${encodeURIComponent(ledger.period.from)}` : ""}${ledger.period.to ? `&to=${encodeURIComponent(ledger.period.to)}` : ""}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.fuel.credit.ledger.print")}
                </a>
              ) : null}
              <button
                type="button"
                disabled={!ledger || ledgerExportingXlsx}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                onClick={async () => {
                  if (!ledger) return;
                  setLedgerExportingXlsx(true);
                  setErrorKey(null);
                  try {
                    const XLSX = await import("xlsx");
                    const wb = XLSX.utils.book_new();
                    const summaryAoA = [
                      ["Fuel credit ledger"],
                      ["Exported at", new Date().toISOString()],
                      ["Customer", ledger.customer.name],
                      ["Phone", ledger.customer.phone ?? ""],
                      ["Invoices", String(ledger.totals.invoicesCount)],
                      ["Payments", String(ledger.totals.paymentsCount)],
                      ["Total invoiced", ledger.totals.totalInvoiced],
                      ["Total paid", ledger.totals.totalPaid],
                      ["Balance", ledger.totals.balance]
                    ];
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");
                    XLSX.utils.book_append_sheet(
                      wb,
                      XLSX.utils.aoa_to_sheet([
                        ["Time", "Type", "Invoice", "Debit", "Credit", "Method", "Note", "Running balance"],
                        ...ledger.timeline.map((e) => [
                          new Date(e.at).toISOString(),
                          e.type,
                          e.invoiceNumber,
                          e.debit,
                          e.credit,
                          "method" in e ? e.method : "",
                          "note" in e ? e.note ?? "" : "",
                          e.runningBalance
                        ])
                      ]),
                      "Timeline"
                    );
                    const safeDate = new Date().toISOString().slice(0, 10);
                    XLSX.writeFile(wb, `fuel_credit_ledger_${safeDate}.xlsx`);
                  } catch {
                    setErrorKey("errors.internal");
                  } finally {
                    setLedgerExportingXlsx(false);
                  }
                }}
              >
                {ledgerExportingXlsx ? t("common.working") : t("app.shop.reports.export.excel")}
              </button>
            </div>
          </div>

          {ledgerLoading ? (
            <div className="mt-6 text-gray-500">{t("common.loading")}</div>
          ) : !ledger ? (
            <div className="mt-6 text-gray-500">{t("errors.notFound")}</div>
          ) : (
            <div className="mt-6 space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.ledger.totalInvoiced")}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{ledger.totals.totalInvoiced}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.ledger.totalPaid")}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{ledger.totals.totalPaid}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.ledger.balance")}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{ledger.totals.balance}</div>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">{t("app.fuel.credit.ledger.table.time")}</th>
                      <th className="px-4 py-3 text-left font-medium">{t("app.fuel.credit.ledger.table.type")}</th>
                      <th className="px-4 py-3 text-left font-medium">{t("app.fuel.credit.ledger.table.invoice")}</th>
                      <th className="px-4 py-3 text-right font-medium">{t("app.fuel.credit.ledger.table.debit")}</th>
                      <th className="px-4 py-3 text-right font-medium">{t("app.fuel.credit.ledger.table.credit")}</th>
                      <th className="px-4 py-3 text-left font-medium">{t("app.fuel.credit.ledger.table.method")}</th>
                      <th className="px-4 py-3 text-left font-medium">{t("app.fuel.credit.ledger.table.note")}</th>
                      <th className="px-4 py-3 text-right font-medium">{t("app.fuel.credit.ledger.table.running")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {ledger.timeline.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                          {t("app.fuel.credit.ledger.empty")}
                        </td>
                      </tr>
                    ) : (
                      ledger.timeline.map((e) => (
                        <tr key={`${e.type}-${"paymentId" in e ? e.paymentId : e.invoiceNumber}-${e.at}`}>
                          <td className="px-4 py-3">{new Date(e.at).toLocaleString()}</td>
                          <td className="px-4 py-3">{t(`app.fuel.credit.ledger.type.${e.type}`)}</td>
                          <td className="px-4 py-3">{e.invoiceNumber}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{e.debit !== "0.00" ? e.debit : ""}</td>
                          <td className="px-4 py-3 text-right tabular-nums">{e.credit !== "0.00" ? e.credit : ""}</td>
                          <td className="px-4 py-3">{"method" in e ? e.method : ""}</td>
                          <td className="px-4 py-3">{"note" in e ? e.note ?? "" : ""}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold">{e.runningBalance}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal open={invoiceOpen} onClose={() => setInvoiceOpen(false)}>
        <div className="w-full max-w-5xl p-6 md:p-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-xl font-semibold">{t("app.fuel.credit.invoice.title")}</div>
              {invoice ? <div className="mt-1 text-sm text-gray-600">{invoice.invoice.invoiceNumber} · {invoice.invoice.customer.name}</div> : null}
            </div>
            {invoice ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span
                  className={
                    invoice.invoice.status === "paid"
                      ? "inline-flex h-10 items-center rounded-xl bg-green-50 px-3 text-sm font-medium text-green-800"
                      : invoice.invoice.status === "void"
                        ? "inline-flex h-10 items-center rounded-xl bg-red-50 px-3 text-sm font-medium text-red-800"
                        : "inline-flex h-10 items-center rounded-xl bg-gray-100 px-3 text-sm font-medium text-gray-800"
                  }
                >
                  {invoice.invoice.status}
                </span>

                {invoice.invoice.status !== "void" ? (
                  <button
                    type="button"
                    disabled={updatingInvoiceStatus || invoice.invoice.status === "paid"}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                    onClick={() => setVoidInvoiceDialogOpen(true)}
                  >
                    {t("app.fuel.credit.invoice.void")}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={updatingInvoiceStatus}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                    onClick={() => setReopenInvoiceDialogOpen(true)}
                  >
                    {t("app.fuel.credit.invoice.reopen")}
                  </button>
                )}

                <a
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  href={`/t/${props.tenantSlug}/fuel/credit/invoices/${encodeURIComponent(invoice.invoice.invoiceNumber)}/print?paper=a4`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("app.fuel.credit.invoice.print")}
                </a>
              </div>
            ) : null}
          </div>

          {invoiceLoading ? (
            <div className="mt-6 text-gray-500">{t("common.loading")}</div>
          ) : !invoice ? (
            <div className="mt-6 text-gray-500">{t("errors.notFound")}</div>
          ) : (
            <div className="mt-6 space-y-6">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.invoices.table.total")}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{invoice.invoice.totalAmount}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.invoices.table.paid")}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{invoice.invoice.paidAmount}</div>
                </div>
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{t("app.fuel.credit.invoices.table.balance")}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums">{invoice.invoice.balance}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900">{t("app.fuel.credit.payments.title")}</div>
                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.fuel.credit.payments.amount")}</label>
                    <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm tabular-nums" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.fuel.credit.payments.method")}</label>
                    <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                      <option value="cash">{t("app.fuel.sales.payment.cash")}</option>
                      <option value="card">{t("app.fuel.sales.payment.card")}</option>
                      <option value="transfer">{t("app.fuel.credit.payments.method.transfer")}</option>
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.fuel.credit.payments.note")}</label>
                    <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    disabled={addingPayment || !paymentAmount.trim() || invoice.invoice.status === "void"}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                    onClick={async () => {
                      if (!tenantId) return;
                      if (invoice.invoice.status === "void") {
                        setErrorKey("errors.invoiceVoided");
                        return;
                      }
                      const amount = Number(paymentAmount);
                      if (!Number.isFinite(amount) || amount <= 0) {
                        setErrorKey("errors.validationError");
                        return;
                      }
                      setAddingPayment(true);
                      setErrorKey(null);
                      try {
                        const res = await apiFetch(`/api/fuel/credit/invoices/${encodeURIComponent(invoice.invoice.invoiceNumber)}/payments`, {
                          method: "POST",
                          headers: { "X-Tenant-Id": tenantId, "Content-Type": "application/json" },
                          body: JSON.stringify({ amount, method: paymentMethod, note: paymentNote.trim() || undefined })
                        });
                        const json = (await res.json()) as { data?: unknown; error?: { message_key?: string } };
                        if (!res.ok) {
                          setErrorKey(json.error?.message_key ?? "errors.internal");
                          return;
                        }
                        await openInvoice(invoice.invoice.invoiceNumber);
                        await reloadInvoices();
                      } catch {
                        setErrorKey("errors.internal");
                      } finally {
                        setAddingPayment(false);
                      }
                    }}
                  >
                    {addingPayment ? t("common.working") : t("app.fuel.credit.payments.add")}
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">{t("app.fuel.credit.payments.table.time")}</th>
                      <th className="px-4 py-3 text-left font-medium">{t("app.fuel.credit.payments.table.method")}</th>
                      <th className="px-4 py-3 text-right font-medium">{t("app.fuel.credit.payments.table.amount")}</th>
                      <th className="px-4 py-3 text-left font-medium">{t("app.fuel.credit.payments.table.note")}</th>
                      <th className="px-4 py-3 text-right font-medium">{t("app.fuel.credit.payments.table.actions")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {invoice.payments.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500">{t("app.fuel.credit.payments.empty")}</td>
                      </tr>
                    ) : (
                      invoice.payments.map((p) => (
                        <tr key={p.id}>
                          <td className="px-4 py-3">{new Date(p.receivedAt).toLocaleString()}</td>
                          <td className="px-4 py-3">{p.method}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold">{p.amount}</td>
                          <td className="px-4 py-3">{p.note ?? ""}</td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              disabled={savingPaymentEdit || deletingPaymentId === p.id || invoice.invoice.status === "void"}
                              className="mr-2 inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                              onClick={() => {
                                setEditPaymentTarget(p);
                                setEditPaymentAmount(p.amount);
                                setEditPaymentMethod(p.method);
                                setEditPaymentNote(p.note ?? "");
                                setEditPaymentReceivedAt(new Date(p.receivedAt).toISOString().slice(0, 16));
                                setEditPaymentOpen(true);
                              }}
                            >
                              {t("common.button.edit")}
                            </button>
                            <button
                              type="button"
                              disabled={deletingPaymentId === p.id || invoice.invoice.status === "void"}
                              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                              onClick={() => {
                                setDeletePaymentTarget(p);
                                setDeletePaymentDialogOpen(true);
                              }}
                            >
                              {t("common.button.remove")}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmDialog
        open={deletePaymentDialogOpen}
        title={t("app.fuel.credit.payments.delete.title")}
        description={t("app.fuel.credit.payments.delete.confirm")}
        confirmLabel={t("common.button.remove")}
        cancelLabel={t("common.button.cancel")}
        confirmTone="danger"
        busy={!!(deletePaymentTarget && deletingPaymentId === deletePaymentTarget.id)}
        onCancel={() => {
          setDeletePaymentDialogOpen(false);
          setDeletePaymentTarget(null);
        }}
        onConfirm={async () => {
          if (!tenantId || !invoice || !deletePaymentTarget) return;
          const invoiceNumber = invoice.invoice.invoiceNumber;
          setDeletingPaymentId(deletePaymentTarget.id);
          setErrorKey(null);
          try {
            const res = await apiFetch(
              `/api/fuel/credit/invoices/${encodeURIComponent(invoiceNumber)}/payments/${encodeURIComponent(deletePaymentTarget.id)}`,
              { method: "DELETE", headers: { "X-Tenant-Id": tenantId } }
            );
            const json = (await res.json()) as { data?: unknown; error?: { message_key?: string } };
            if (!res.ok) {
              setErrorKey(json.error?.message_key ?? "errors.internal");
              return;
            }
            setDeletePaymentDialogOpen(false);
            setDeletePaymentTarget(null);
            await openInvoice(invoiceNumber);
            await reloadInvoices();
          } catch {
            setErrorKey("errors.internal");
          } finally {
            setDeletingPaymentId(null);
          }
        }}
      />

      <ConfirmDialog
        open={voidInvoiceDialogOpen}
        title={t("app.fuel.credit.invoice.void.title")}
        description={t("app.fuel.credit.invoice.void.confirm")}
        confirmLabel={t("app.fuel.credit.invoice.void")}
        cancelLabel={t("common.button.cancel")}
        confirmTone="danger"
        busy={updatingInvoiceStatus}
        onCancel={() => setVoidInvoiceDialogOpen(false)}
        onConfirm={async () => {
          if (!tenantId || !invoice) return;
          setUpdatingInvoiceStatus(true);
          setErrorKey(null);
          try {
            const invoiceNumber = invoice.invoice.invoiceNumber;
            const res = await apiFetch(`/api/fuel/credit/invoices/${encodeURIComponent(invoiceNumber)}/void`, {
              method: "PATCH",
              headers: { "X-Tenant-Id": tenantId }
            });
            const json = (await res.json()) as { data?: unknown; error?: { message_key?: string } };
            if (!res.ok) {
              setErrorKey(json.error?.message_key ?? "errors.internal");
              return;
            }
            setVoidInvoiceDialogOpen(false);
            await openInvoice(invoiceNumber);
            await reloadInvoices();
          } catch {
            setErrorKey("errors.internal");
          } finally {
            setUpdatingInvoiceStatus(false);
          }
        }}
      />

      <ConfirmDialog
        open={reopenInvoiceDialogOpen}
        title={t("app.fuel.credit.invoice.reopen.title")}
        description={t("app.fuel.credit.invoice.reopen.confirm")}
        confirmLabel={t("app.fuel.credit.invoice.reopen")}
        cancelLabel={t("common.button.cancel")}
        confirmTone="primary"
        busy={updatingInvoiceStatus}
        onCancel={() => setReopenInvoiceDialogOpen(false)}
        onConfirm={async () => {
          if (!tenantId || !invoice) return;
          setUpdatingInvoiceStatus(true);
          setErrorKey(null);
          try {
            const invoiceNumber = invoice.invoice.invoiceNumber;
            const res = await apiFetch(`/api/fuel/credit/invoices/${encodeURIComponent(invoiceNumber)}/reopen`, {
              method: "PATCH",
              headers: { "X-Tenant-Id": tenantId }
            });
            const json = (await res.json()) as { data?: unknown; error?: { message_key?: string } };
            if (!res.ok) {
              setErrorKey(json.error?.message_key ?? "errors.internal");
              return;
            }
            setReopenInvoiceDialogOpen(false);
            await openInvoice(invoiceNumber);
            await reloadInvoices();
          } catch {
            setErrorKey("errors.internal");
          } finally {
            setUpdatingInvoiceStatus(false);
          }
        }}
      />

      <Modal open={editPaymentOpen} onClose={() => setEditPaymentOpen(false)}>
        <div className="w-full max-w-xl p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">{t("app.fuel.credit.payments.edit.title")}</div>
              {invoice && editPaymentTarget ? (
                <div className="mt-1 text-sm text-gray-600">
                  {invoice.invoice.invoiceNumber} · {invoice.invoice.customer.name}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setEditPaymentOpen(false)}
            >
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.fuel.credit.payments.amount")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm tabular-nums" value={editPaymentAmount} onChange={(e) => setEditPaymentAmount(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.fuel.credit.payments.method")}</label>
              <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={editPaymentMethod} onChange={(e) => setEditPaymentMethod(e.target.value)}>
                <option value="cash">{t("app.fuel.sales.payment.cash")}</option>
                <option value="card">{t("app.fuel.sales.payment.card")}</option>
                <option value="transfer">{t("app.fuel.credit.payments.method.transfer")}</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.fuel.credit.payments.receivedAt")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" type="datetime-local" value={editPaymentReceivedAt} onChange={(e) => setEditPaymentReceivedAt(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.fuel.credit.payments.note")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={editPaymentNote} onChange={(e) => setEditPaymentNote(e.target.value)} />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              disabled={savingPaymentEdit}
              onClick={() => setEditPaymentOpen(false)}
            >
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={savingPaymentEdit || !editPaymentTarget || !invoice || !tenantId || invoice.invoice.status === "void"}
              onClick={async () => {
                if (!tenantId || !invoice || !editPaymentTarget) return;
                if (invoice.invoice.status === "void") {
                  setErrorKey("errors.invoiceVoided");
                  return;
                }
                const amount = Number(editPaymentAmount);
                if (!Number.isFinite(amount) || amount <= 0) {
                  setErrorKey("errors.validationError");
                  return;
                }
                const receivedAt = editPaymentReceivedAt.trim();
                if (!receivedAt) {
                  setErrorKey("errors.validationError");
                  return;
                }
                setSavingPaymentEdit(true);
                setErrorKey(null);
                try {
                  const invoiceNumber = invoice.invoice.invoiceNumber;
                  const res = await apiFetch(
                    `/api/fuel/credit/invoices/${encodeURIComponent(invoiceNumber)}/payments/${encodeURIComponent(editPaymentTarget.id)}`,
                    {
                      method: "PATCH",
                      headers: { "X-Tenant-Id": tenantId, "Content-Type": "application/json" },
                      body: JSON.stringify({
                        amount,
                        method: editPaymentMethod,
                        note: editPaymentNote.trim() || undefined,
                        receivedAt: new Date(receivedAt).toISOString()
                      })
                    }
                  );
                  const json = (await res.json()) as { data?: unknown; error?: { message_key?: string } };
                  if (!res.ok) {
                    setErrorKey(json.error?.message_key ?? "errors.internal");
                    return;
                  }
                  setEditPaymentOpen(false);
                  setEditPaymentTarget(null);
                  await openInvoice(invoiceNumber);
                  await reloadInvoices();
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setSavingPaymentEdit(false);
                }
              }}
            >
              {savingPaymentEdit ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
