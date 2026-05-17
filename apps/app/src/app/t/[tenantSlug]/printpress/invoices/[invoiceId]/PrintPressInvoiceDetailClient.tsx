"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { getApiBaseUrl } from "@/lib/api";
import { currencies } from "@/lib/currency-catalog";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type CustomerOption = { id: string; fullName: string; companyName: string | null; phone: string | null };

type InvoiceLine = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
};

type InvoicePayment = {
  id: string;
  method: string;
  amount: string;
  note: string | null;
  createdAt: string;
};

type InvoiceDetail = {
  id: string;
  invoiceNumber: string | null;
  status: string;
  currencyCode: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  paidTotal: string;
  notes: string | null;
  issuedAt: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; fullName: string } | null;
  lines: InvoiceLine[];
  payments: InvoicePayment[];
};

type InvoiceDetailResponse = { data: InvoiceDetail };

type BrandingSettings = {
  businessName: string | null;
  logoUrl: string | null;
  phone: string | null;
  address: string | null;
  email: string | null;
  taxNumber: string | null;
};

type SettingsResponse = { data: BrandingSettings };

export function PrintPressInvoiceDetailClient(props: { tenantSlug: string; invoiceId: string }) {
  const { t } = useClientI18n();
  const apiBase = getApiBaseUrl();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [settings, setSettings] = useState<BrandingSettings | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingReceipt, setDownloadingReceipt] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [dueAt, setDueAt] = useState("");
  const [notes, setNotes] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);

  const [payOpen, setPayOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payMethod, setPayMethod] = useState("cash");
  const [payAmount, setPayAmount] = useState("");
  const [payNote, setPayNote] = useState("");
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"issue" | "void" | "deleteLine" | "deletePayment">("issue");
  const [confirmLineId, setConfirmLineId] = useState<string | null>(null);
  const [confirmPaymentId, setConfirmPaymentId] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const canEdit = invoice?.status !== "void";

  const [lineModalOpen, setLineModalOpen] = useState(false);
  const [lineSaving, setLineSaving] = useState(false);
  const [editingLine, setEditingLine] = useState<InvoiceLine | null>(null);
  const [lineDescription, setLineDescription] = useState("");
  const [lineQuantity, setLineQuantity] = useState("1");
  const [lineUnitPrice, setLineUnitPrice] = useState("0");

  const summaryRows = useMemo(() => {
    if (!invoice) return [];
    return [
      { label: t("app.printpress.invoices.detail.summary.subtotal"), value: `${invoice.subtotal} ${invoice.currencyCode}` },
      { label: t("app.printpress.invoices.detail.summary.discount"), value: `${invoice.discount} ${invoice.currencyCode}` },
      { label: t("app.printpress.invoices.detail.summary.tax"), value: `${invoice.tax} ${invoice.currencyCode}` },
      { label: t("app.printpress.invoices.detail.summary.total"), value: `${invoice.total} ${invoice.currencyCode}` },
      { label: t("app.printpress.invoices.detail.summary.paid"), value: `${invoice.paidTotal} ${invoice.currencyCode}` }
    ];
  }, [invoice, t]);

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

  const loadInvoice = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/printpress/invoices/${props.invoiceId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as InvoiceDetailResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const data = (json as InvoiceDetailResponse).data;
      setInvoice(data);
      setCurrencyCode(data.currencyCode);
      setDiscount(data.discount);
      setTax(data.tax);
      setDueAt(data.dueAt ? new Date(data.dueAt).toISOString().slice(0, 10) : "");
      setNotes(data.notes ?? "");
      setSelectedCustomer(data.customer ? { id: data.customer.id, fullName: data.customer.fullName, companyName: null, phone: null } : null);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [props.invoiceId, tenantId]);

  useEffect(() => {
    void loadInvoice();
  }, [loadInvoice]);

  useEffect(() => {
    if (!tenantId) return;
    const tid = tenantId;
    let cancelled = false;
    async function loadSettings() {
      try {
        const res = await apiFetch("/api/printpress/settings", { cache: "no-store", headers: { "X-Tenant-Id": tid } });
        if (!res.ok) return;
        const json = (await res.json()) as SettingsResponse;
        if (!cancelled) setSettings(json.data);
      } catch {
        if (!cancelled) setSettings(null);
      }
    }
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const logoFullUrl = useMemo(() => {
    const url = settings?.logoUrl ?? null;
    if (!url) return null;
    return `${apiBase}${url}`;
  }, [apiBase, settings?.logoUrl]);

  const downloadPdf = useCallback(async () => {
    if (!tenantId) return;
    setDownloadingPdf(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/printpress/invoices/${encodeURIComponent(props.invoiceId)}/pdf`, {
        headers: { "X-Tenant-Id": tenantId }
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${invoice?.invoiceNumber ?? props.invoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setDownloadingPdf(false);
    }
  }, [invoice?.invoiceNumber, props.invoiceId, tenantId]);

  const downloadReceiptPdf = useCallback(async () => {
    if (!tenantId) return;
    setDownloadingReceipt(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/printpress/invoices/${encodeURIComponent(props.invoiceId)}/receipt/pdf`, {
        headers: { "X-Tenant-Id": tenantId }
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Receipt-${invoice?.invoiceNumber ?? props.invoiceId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setDownloadingReceipt(false);
    }
  }, [invoice?.invoiceNumber, props.invoiceId, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    if (!editOpen) return;

    const q2 = customerQuery.trim();
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      setCustomerLoading(true);
      try {
        const res = await apiFetch(`/api/printpress/customers/lookup?q=${encodeURIComponent(q2)}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json().catch(() => null)) as { data?: { items?: CustomerOption[] } } | null;
        if (!cancelled) setCustomerOptions(json?.data?.items ?? []);
      } catch {
        if (!cancelled) setCustomerOptions([]);
      } finally {
        if (!cancelled) setCustomerLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [customerQuery, editOpen, tenantId]);

  async function saveHeader() {
    if (!tenantId) return;
    setSaving(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/printpress/invoices/${props.invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({
          customerId: selectedCustomer?.id ?? null,
          currencyCode: currencyCode.trim() || "USD",
          discount: discount.trim() || "0",
          tax: tax.trim() || "0",
          dueAt: dueAt ? new Date(dueAt).toISOString() : null,
          notes: notes.trim() || undefined
        })
      });
      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      setEditOpen(false);
      await loadInvoice();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  }

  function openPayment() {
    setEditingPaymentId(null);
    setPayMethod("cash");
    setPayAmount("");
    setPayNote("");
    setPayOpen(true);
  }

  function openEditPayment(p: InvoicePayment) {
    setEditingPaymentId(p.id);
    setPayMethod(p.method);
    setPayAmount(p.amount);
    setPayNote(p.note ?? "");
    setPayOpen(true);
  }

  async function addPayment() {
    if (!tenantId) return;
    if (!payAmount.trim()) {
      setErrorKey("errors.validation");
      return;
    }
    setPaying(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/printpress/invoices/${props.invoiceId}/payments${editingPaymentId ? `/${editingPaymentId}` : ""}`, {
        method: editingPaymentId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({ method: payMethod.trim() || "cash", amount: payAmount.trim(), note: payNote.trim() || undefined })
      });
      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      setPayOpen(false);
      setEditingPaymentId(null);
      await loadInvoice();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setPaying(false);
    }
  }

  function askIssue() {
    setConfirmMode("issue");
    setConfirmLineId(null);
    setConfirmOpen(true);
  }

  function askVoid() {
    setConfirmMode("void");
    setConfirmLineId(null);
    setConfirmOpen(true);
  }

  function openAddLine() {
    setEditingLine(null);
    setLineDescription("");
    setLineQuantity("1");
    setLineUnitPrice("0");
    setLineModalOpen(true);
  }

  function openEditLine(l: InvoiceLine) {
    setEditingLine(l);
    setLineDescription(l.description);
    setLineQuantity(l.quantity);
    setLineUnitPrice(l.unitPrice);
    setLineModalOpen(true);
  }

  async function saveLine() {
    if (!tenantId) return;
    if (!lineDescription.trim()) {
      setErrorKey("errors.validation");
      return;
    }
    setLineSaving(true);
    setErrorKey(null);
    try {
      const payload = { description: lineDescription.trim(), quantity: lineQuantity.trim() || "0", unitPrice: lineUnitPrice.trim() || "0" };
      const res = editingLine
        ? await apiFetch(`/api/printpress/invoices/${props.invoiceId}/lines/${editingLine.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
            body: JSON.stringify(payload)
          })
        : await apiFetch(`/api/printpress/invoices/${props.invoiceId}/lines`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
            body: JSON.stringify(payload)
          });
      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      setLineModalOpen(false);
      await loadInvoice();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLineSaving(false);
    }
  }

  function askDeleteLine(lineId: string) {
    setConfirmMode("deleteLine");
    setConfirmLineId(lineId);
    setConfirmOpen(true);
  }

  function askDeletePayment(paymentId: string) {
    setConfirmMode("deletePayment");
    setConfirmPaymentId(paymentId);
    setConfirmOpen(true);
  }

  async function confirmAction() {
    if (!tenantId) return;
    setConfirmBusy(true);
    setErrorKey(null);
    try {
      if (confirmMode === "deleteLine") {
        if (!confirmLineId) return;
        const res = await apiFetch(`/api/printpress/invoices/${props.invoiceId}/lines/${confirmLineId}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
        if (!res.ok) {
          setErrorKey(json?.error?.message_key ?? "errors.internal");
          return;
        }
        setConfirmOpen(false);
        await loadInvoice();
        return;
      }

      if (confirmMode === "deletePayment") {
        if (!confirmPaymentId) return;
        const res = await apiFetch(`/api/printpress/invoices/${props.invoiceId}/payments/${confirmPaymentId}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
        if (!res.ok) {
          setErrorKey(json?.error?.message_key ?? "errors.internal");
          return;
        }
        setConfirmOpen(false);
        await loadInvoice();
        return;
      }

      const url = confirmMode === "issue" ? `/api/printpress/invoices/${props.invoiceId}/issue` : `/api/printpress/invoices/${props.invoiceId}/void`;
      const res = await apiFetch(url, { method: "POST", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      setConfirmOpen(false);
      await loadInvoice();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setConfirmBusy(false);
    }
  }

  const confirmTitle =
    confirmMode === "issue"
      ? t("app.printpress.invoices.detail.confirm.issue.title")
      : confirmMode === "void"
        ? t("app.printpress.invoices.detail.confirm.void.title")
        : confirmMode === "deleteLine"
          ? t("app.printpress.invoices.detail.confirm.deleteLine.title")
          : t("app.printpress.invoices.detail.confirm.deletePayment.title");

  const confirmDescription =
    confirmMode === "issue"
      ? t("app.printpress.invoices.detail.confirm.issue.description")
      : confirmMode === "void"
        ? t("app.printpress.invoices.detail.confirm.void.description")
        : confirmMode === "deleteLine"
          ? t("app.printpress.invoices.detail.confirm.deleteLine.description")
          : t("app.printpress.invoices.detail.confirm.deletePayment.description");

  const confirmLabel =
    confirmMode === "issue"
      ? t("app.printpress.invoices.detail.action.issue")
      : confirmMode === "void"
        ? t("app.printpress.invoices.detail.action.void")
        : t("common.button.remove");

  const confirmTone = confirmMode === "issue" ? "primary" : "danger";

  return (
    <div className="space-y-6">
      <div className="print-only border-b border-gray-200 pb-4">
        <div className="flex items-start justify-between gap-8">
          <div className="flex items-start gap-4">
            {logoFullUrl ? <img src={logoFullUrl} alt="" className="h-14 w-auto object-contain" /> : null}
            <div className="min-w-0">
              {settings?.businessName ? <div className="text-lg font-semibold text-gray-900">{settings.businessName}</div> : null}
              {settings?.phone || settings?.email ? (
                <div className="mt-1 text-xs text-gray-700">{[settings.phone, settings.email].filter(Boolean).join(" • ")}</div>
              ) : null}
              {settings?.address ? <div className="mt-1 text-xs text-gray-700">{settings.address}</div> : null}
              {settings?.taxNumber ? (
                <div className="mt-1 text-xs text-gray-700">
                  {t("app.printpress.settings.field.taxNumber")}: {settings.taxNumber}
                </div>
              ) : null}
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-semibold text-gray-900">
              {t("app.printpress.invoices.detail.title")} {invoice?.invoiceNumber ?? t("app.printpress.invoices.noNumber")}
            </div>
            <div className="mt-2 grid gap-1 text-sm text-gray-700">
              <div>
                {t("app.printpress.invoices.detail.meta.customer")}: <span className="font-medium text-gray-900">{invoice?.customer?.fullName ?? "—"}</span>
              </div>
              <div>
                {t("app.printpress.invoices.detail.meta.createdAt")}: <span className="font-medium text-gray-900">{invoice ? new Date(invoice.createdAt).toLocaleString() : "—"}</span>
              </div>
              <div>
                {t("app.printpress.invoices.detail.meta.status")}: <span className="font-medium text-gray-900">{invoice ? t(`app.printpress.invoices.status.${invoice.status}`) : "—"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-xs font-medium text-gray-600">{t("app.printpress.invoices.detail.meta.customer")}</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">{invoice?.customer?.fullName ?? "—"}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="grid gap-1 text-sm text-gray-700">
              <div>
                {t("app.printpress.invoices.detail.meta.createdAt")}: <span className="font-medium text-gray-900">{invoice ? new Date(invoice.createdAt).toLocaleString() : "—"}</span>
              </div>
              {invoice?.dueAt ? (
                <div>
                  {t("app.printpress.invoices.field.dueDate")}: <span className="font-medium text-gray-900">{new Date(invoice.dueAt).toLocaleDateString()}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {invoice?.notes ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <div className="text-xs font-medium text-gray-600">{t("app.printpress.invoices.field.notes")}</div>
            <div className="mt-1 whitespace-pre-wrap text-gray-900">{invoice.notes}</div>
          </div>
        ) : null}
      </div>

      <div className="print-hidden flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xl font-semibold">{t("app.printpress.invoices.detail.title")}</div>
          <div className="mt-1 text-sm text-gray-700">
            {t("app.printpress.invoices.detail.subtitle")}{" "}
            <span className="font-medium text-gray-900">{invoice?.invoiceNumber ?? t("app.printpress.invoices.noNumber")}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/t/${props.tenantSlug}/printpress/invoices`}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            {t("common.button.back")}
          </Link>
          <button
            type="button"
            disabled={downloadingPdf}
            onClick={downloadPdf}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
          >
            {t("app.printpress.common.action.downloadPdf")}
          </button>
          <button
            type="button"
            disabled={downloadingReceipt}
            onClick={downloadReceiptPdf}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
          >
            {t("app.printpress.invoices.detail.action.downloadReceipt")}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            {t("app.printpress.common.action.print")}
          </button>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => setEditOpen(true)}
          className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
        >
          {t("common.button.edit")}
        </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={askIssue}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
          >
            {t("app.printpress.invoices.detail.action.issue")}
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={openPayment}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
          >
            {t("app.printpress.invoices.detail.action.addPayment")}
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={askVoid}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
          >
            {t("app.printpress.invoices.detail.action.void")}
          </button>
        </div>
      </div>

      {errorKey ? <div className="print-hidden rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
          <div className="text-sm font-medium text-gray-900">{t("app.printpress.invoices.detail.meta.title")}</div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-600">{t("app.printpress.invoices.detail.meta.status")}</dt>
              <dd className="font-medium text-gray-900">{invoice ? t(`app.printpress.invoices.status.${invoice.status}`) : "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-600">{t("app.printpress.invoices.detail.meta.customer")}</dt>
              <dd className="font-medium text-gray-900">{invoice?.customer?.fullName ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-600">{t("app.printpress.invoices.detail.meta.createdAt")}</dt>
              <dd className="font-medium text-gray-900">{invoice ? new Date(invoice.createdAt).toLocaleString() : "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
          <div className="text-sm font-medium text-gray-900">{t("app.printpress.invoices.detail.summary.title")}</div>
          <dl className="mt-4 space-y-2 text-sm">
            {summaryRows.map((r) => (
              <div key={r.label} className="flex items-center justify-between gap-4">
                <dt className="text-gray-600">{r.label}</dt>
                <dd className="font-medium text-gray-900">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div className="text-sm font-medium text-gray-900">{t("app.printpress.invoices.detail.lines.title")}</div>
          <button
            type="button"
            disabled={!canEdit}
            onClick={openAddLine}
            className="inline-flex h-9 items-center rounded-xl bg-primary-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
          >
            {t("app.printpress.invoices.detail.lines.action.add")}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-100 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.invoices.detail.lines.table.description")}</th>
                <th className="border-b border-gray-100 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.printpress.invoices.detail.lines.table.qty")}</th>
                <th className="border-b border-gray-100 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.printpress.invoices.detail.lines.table.unitPrice")}</th>
                <th className="border-b border-gray-100 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.printpress.invoices.detail.lines.table.total")}</th>
                <th className="border-b border-gray-100 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.invoices.detail.lines.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={5}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : (invoice?.lines ?? []).length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={5}>
                    {t("app.printpress.invoices.detail.lines.empty")}
                  </td>
                </tr>
              ) : (
                (invoice?.lines ?? []).map((l) => (
                  <tr key={l.id}>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{l.description}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-700">{l.quantity}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-700">{l.unitPrice}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right font-medium text-gray-900">{l.lineTotal}</td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => openEditLine(l)}
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                        >
                          {t("common.button.edit")}
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => askDeleteLine(l.id)}
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                        >
                          {t("common.button.remove")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-100 px-6 py-4 text-sm font-medium text-gray-900">{t("app.printpress.invoices.detail.payments.title")}</div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-100 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.invoices.detail.payments.table.method")}</th>
                <th className="border-b border-gray-100 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.invoices.detail.payments.table.amount")}</th>
                <th className="border-b border-gray-100 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.invoices.detail.payments.table.note")}</th>
                <th className="border-b border-gray-100 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.invoices.detail.payments.table.date")}</th>
                <th className="border-b border-gray-100 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.invoices.detail.payments.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={5}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : (invoice?.payments ?? []).length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={5}>
                    {t("app.printpress.invoices.detail.payments.empty")}
                  </td>
                </tr>
              ) : (
                (invoice?.payments ?? []).map((p) => (
                  <tr key={p.id}>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{p.method}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">
                      {p.amount} {invoice?.currencyCode ?? ""}
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{p.note ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{new Date(p.createdAt).toLocaleString()}</td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => openEditPayment(p)}
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                        >
                          {t("common.button.edit")}
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => askDeletePayment(p.id)}
                          className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                        >
                          {t("common.button.remove")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={payOpen} onClose={() => setPayOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="text-xl font-semibold">
              {editingPaymentId ? t("app.printpress.invoices.detail.payments.modal.editTitle") : t("app.printpress.invoices.detail.payments.modal.title")}
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setPayOpen(false)}
            >
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.invoices.detail.payments.field.method")}</label>
                <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={payMethod} onChange={(e) => setPayMethod(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.invoices.detail.payments.field.amount")}</label>
                <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.invoices.detail.payments.field.note")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={payNote} onChange={(e) => setPayNote(e.target.value)} />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                {t("common.button.cancel")}
              </button>
              <button
                type="button"
                disabled={!tenantId || paying}
                onClick={addPayment}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              >
                {paying ? t("common.loading") : t("common.button.save")}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={lineModalOpen} onClose={() => setLineModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="text-xl font-semibold">
              {editingLine ? t("app.printpress.invoices.detail.lines.modal.edit") : t("app.printpress.invoices.detail.lines.modal.add")}
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setLineModalOpen(false)}
            >
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.invoices.detail.lines.field.description")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={lineDescription}
                onChange={(e) => setLineDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.invoices.detail.lines.field.qty")}</label>
                <input
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={lineQuantity}
                  onChange={(e) => setLineQuantity(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.invoices.detail.lines.field.unitPrice")}</label>
                <input
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={lineUnitPrice}
                  onChange={(e) => setLineUnitPrice(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setLineModalOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                {t("common.button.cancel")}
              </button>
              <button
                type="button"
                disabled={!tenantId || lineSaving}
                onClick={saveLine}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              >
                {lineSaving ? t("common.loading") : t("common.button.save")}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="text-xl font-semibold">{t("app.printpress.invoices.detail.edit.title")}</div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setEditOpen(false)}
            >
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.invoices.field.customer")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder={t("app.printpress.invoices.field.customer.placeholder")}
              />

              {selectedCustomer ? (
                <div className="mt-2 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-900">{selectedCustomer.fullName}</div>
                    <div className="mt-0.5 truncate text-xs text-gray-600">
                      {[selectedCustomer.companyName, selectedCustomer.phone].filter(Boolean).join(" • ") || " "}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCustomer(null)}
                    className="ml-3 inline-flex h-9 shrink-0 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  >
                    {t("common.button.remove")}
                  </button>
                </div>
              ) : null}

              {!selectedCustomer ? (
                <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-gray-200">
                  {customerLoading ? (
                    <div className="px-3 py-3 text-sm text-gray-600">{t("common.loading")}</div>
                  ) : customerOptions.length === 0 ? (
                    <div className="px-3 py-3 text-sm text-gray-600">{t("app.printpress.invoices.field.customer.empty")}</div>
                  ) : (
                    customerOptions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedCustomer(c)}
                        className="block w-full border-b border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50"
                      >
                        <div className="font-medium text-gray-900">{c.fullName}</div>
                        <div className="mt-0.5 text-xs text-gray-600">{[c.companyName, c.phone].filter(Boolean).join(" • ") || " "}</div>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.invoices.field.currency")}</label>
                <select
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={currencyCode}
                  onChange={(e) => setCurrencyCode(e.target.value)}
                >
                  {!currencies.some((c) => c.code === currencyCode) ? <option value={currencyCode}>{currencyCode}</option> : null}
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.invoices.field.discount")}</label>
                <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.invoices.field.tax")}</label>
                <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={tax} onChange={(e) => setTax(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.invoices.field.dueDate")}</label>
              <input
                type="date"
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.invoices.field.notes")}</label>
              <textarea
                className="mt-1 min-h-28 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                {t("common.button.cancel")}
              </button>
              <button
                type="button"
                disabled={!tenantId || saving}
                onClick={saveHeader}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              >
                {saving ? t("common.loading") : t("common.button.save")}
              </button>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmLabel}
        cancelLabel={t("common.button.cancel")}
        confirmTone={confirmTone as "danger" | "primary"}
        busy={confirmBusy}
        onConfirm={confirmAction}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
