"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { getApiBaseUrl } from "@/lib/api";
import { currencies } from "@/lib/currency-catalog";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type CustomerOption = { id: string; fullName: string; companyName: string | null; phone: string | null };

type QuotationLine = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  lineTotal: string;
};

type QuotationDetail = {
  id: string;
  quotationNumber: string | null;
  status: string;
  currencyCode: string;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  notes: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; fullName: string } | null;
  lines: QuotationLine[];
};

type QuotationDetailResponse = { data: QuotationDetail };

type BrandingSettings = {
  businessName: string | null;
  logoUrl: string | null;
  phone: string | null;
  address: string | null;
  email: string | null;
  taxNumber: string | null;
};

type SettingsResponse = { data: BrandingSettings };

export function PrintPressQuotationDetailClient(props: { tenantSlug: string; quotationId: string }) {
  const { t } = useClientI18n();
  const apiBase = getApiBaseUrl();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [quotation, setQuotation] = useState<QuotationDetail | null>(null);
  const [settings, setSettings] = useState<BrandingSettings | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [pdfQrDataUrl, setPdfQrDataUrl] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currencyCode, setCurrencyCode] = useState("USD");
  const [discount, setDiscount] = useState("0");
  const [tax, setTax] = useState("0");
  const [notes, setNotes] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);

  const [lineModalOpen, setLineModalOpen] = useState(false);
  const [lineSaving, setLineSaving] = useState(false);
  const [editingLine, setEditingLine] = useState<QuotationLine | null>(null);
  const [lineDescription, setLineDescription] = useState("");
  const [lineQuantity, setLineQuantity] = useState("1");
  const [lineUnitPrice, setLineUnitPrice] = useState("0");

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"deleteLine" | "issue" | "void" | "convert">("deleteLine");
  const [confirmTargetLineId, setConfirmTargetLineId] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const canEdit = quotation?.status === "draft" || quotation?.status === "issued";
  const summaryRows = useMemo(() => {
    if (!quotation) return [];
    return [
      { label: t("app.printpress.quotations.detail.summary.subtotal"), value: `${quotation.subtotal} ${quotation.currencyCode}` },
      { label: t("app.printpress.quotations.detail.summary.discount"), value: `${quotation.discount} ${quotation.currencyCode}` },
      { label: t("app.printpress.quotations.detail.summary.tax"), value: `${quotation.tax} ${quotation.currencyCode}` },
      { label: t("app.printpress.quotations.detail.summary.total"), value: `${quotation.total} ${quotation.currencyCode}` }
    ];
  }, [quotation, t]);

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

  const loadQuotation = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/printpress/quotations/${props.quotationId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as QuotationDetailResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const data = (json as QuotationDetailResponse).data;
      setQuotation(data);
      setCurrencyCode(data.currencyCode);
      setDiscount(data.discount);
      setTax(data.tax);
      setNotes(data.notes ?? "");
      setSelectedCustomer(data.customer ? { id: data.customer.id, fullName: data.customer.fullName, companyName: null, phone: null } : null);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [props.quotationId, tenantId]);

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

  useEffect(() => {
    void loadQuotation();
  }, [loadQuotation]);

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

  const pdfUrl = useMemo(() => `${apiBase}/api/printpress/quotations/${props.quotationId}/pdf`, [apiBase, props.quotationId]);

  useEffect(() => {
    let cancelled = false;
    async function buildQr() {
      try {
        const url = await QRCode.toDataURL(pdfUrl, { margin: 1, width: 140 });
        if (!cancelled) setPdfQrDataUrl(url);
      } catch {
        if (!cancelled) setPdfQrDataUrl(null);
      }
    }
    void buildQr();
    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  function shareEmail() {
    const ref = quotation?.quotationNumber ?? props.quotationId;
    const subject = `${t("app.printpress.quotations.detail.title")} ${ref}`;
    const body = `${subject}\n\n${t("app.printpress.quotations.share.pdfLink")}: ${pdfUrl}\n`;
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function shareWhatsApp() {
    const ref = quotation?.quotationNumber ?? props.quotationId;
    const subject = `${t("app.printpress.quotations.detail.title")} ${ref}`;
    const text = `${subject}\n${t("app.printpress.quotations.share.pdfLink")}: ${pdfUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  }

  const downloadPdf = useCallback(async () => {
    if (!tenantId) return;
    setDownloadingPdf(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/printpress/quotations/${encodeURIComponent(props.quotationId)}/pdf`, {
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
      a.download = `${quotation?.quotationNumber ?? props.quotationId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setDownloadingPdf(false);
    }
  }, [props.quotationId, quotation?.quotationNumber, tenantId]);

  async function saveHeader() {
    if (!tenantId) return;
    setSaving(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/printpress/quotations/${props.quotationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({
          customerId: selectedCustomer?.id ?? null,
          currencyCode: currencyCode.trim() || "USD",
          discount: discount.trim() || "0",
          tax: tax.trim() || "0",
          notes: notes.trim() || undefined
        })
      });
      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "errors.internal");
        return;
      }
      setEditOpen(false);
      await loadQuotation();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  }

  function openAddLine() {
    setEditingLine(null);
    setLineDescription("");
    setLineQuantity("1");
    setLineUnitPrice("0");
    setLineModalOpen(true);
  }

  function openEditLine(l: QuotationLine) {
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
        ? await apiFetch(`/api/printpress/quotations/${props.quotationId}/lines/${editingLine.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
            body: JSON.stringify(payload)
          })
        : await apiFetch(`/api/printpress/quotations/${props.quotationId}/lines`, {
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
      await loadQuotation();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLineSaving(false);
    }
  }

  function askDeleteLine(id: string) {
    setConfirmMode("deleteLine");
    setConfirmTargetLineId(id);
    setConfirmOpen(true);
  }

  function askIssue() {
    setConfirmMode("issue");
    setConfirmTargetLineId(null);
    setConfirmOpen(true);
  }

  function askVoid() {
    setConfirmMode("void");
    setConfirmTargetLineId(null);
    setConfirmOpen(true);
  }

  function askConvert() {
    setConfirmMode("convert");
    setConfirmTargetLineId(null);
    setConfirmOpen(true);
  }

  async function confirmAction() {
    if (!tenantId) return;
    setConfirmBusy(true);
    setErrorKey(null);
    try {
      if (confirmMode === "deleteLine") {
        if (!confirmTargetLineId) return;
        const res = await apiFetch(`/api/printpress/quotations/${props.quotationId}/lines/${confirmTargetLineId}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
        if (!res.ok) {
          setErrorKey(json?.error?.message_key ?? "errors.internal");
          return;
        }
        setConfirmOpen(false);
        await loadQuotation();
        return;
      }

      if (confirmMode === "issue") {
        const res = await apiFetch(`/api/printpress/quotations/${props.quotationId}/issue`, { method: "POST", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
        if (!res.ok) {
          setErrorKey(json?.error?.message_key ?? "errors.internal");
          return;
        }
        setConfirmOpen(false);
        await loadQuotation();
        return;
      }

      if (confirmMode === "void") {
        const res = await apiFetch(`/api/printpress/quotations/${props.quotationId}/void`, { method: "POST", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
        if (!res.ok) {
          setErrorKey(json?.error?.message_key ?? "errors.internal");
          return;
        }
        setConfirmOpen(false);
        await loadQuotation();
        return;
      }

      if (confirmMode === "convert") {
        const res = await apiFetch(`/api/printpress/quotations/${props.quotationId}/convert-to-invoice`, { method: "POST", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json().catch(() => null)) as { data?: { id?: string }; error?: { message_key?: string } } | null;
        if (!res.ok) {
          setErrorKey(json?.error?.message_key ?? "errors.internal");
          return;
        }
        const invoiceId = json?.data?.id ?? null;
        if (!invoiceId) {
          setErrorKey("errors.internal");
          return;
        }
        setConfirmOpen(false);
        window.location.href = `/t/${props.tenantSlug}/printpress/invoices/${invoiceId}`;
      }
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setConfirmBusy(false);
    }
  }

  const confirmTitle =
    confirmMode === "deleteLine"
      ? t("app.printpress.quotations.detail.confirm.deleteLine.title")
      : confirmMode === "issue"
        ? t("app.printpress.quotations.detail.confirm.issue.title")
        : confirmMode === "void"
          ? t("app.printpress.quotations.detail.confirm.void.title")
          : t("app.printpress.quotations.detail.confirm.convert.title");

  const confirmDescription =
    confirmMode === "deleteLine"
      ? t("app.printpress.quotations.detail.confirm.deleteLine.description")
      : confirmMode === "issue"
        ? t("app.printpress.quotations.detail.confirm.issue.description")
        : confirmMode === "void"
          ? t("app.printpress.quotations.detail.confirm.void.description")
          : t("app.printpress.quotations.detail.confirm.convert.description");

  const confirmLabel =
    confirmMode === "deleteLine"
      ? t("common.button.remove")
      : confirmMode === "issue"
        ? t("app.printpress.quotations.detail.action.issue")
        : confirmMode === "void"
          ? t("app.printpress.quotations.detail.action.void")
          : t("app.printpress.quotations.detail.action.convert");

  const confirmTone = confirmMode === "convert" ? "primary" : "danger";

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
              {t("app.printpress.quotations.detail.title")} {quotation?.quotationNumber ?? t("app.printpress.quotations.noNumber")}
            </div>
            {pdfQrDataUrl ? (
              <div className="mt-2 flex items-center justify-end gap-3">
                <div className="text-xs text-gray-600">{t("app.printpress.quotations.share.qrLabel")}</div>
                <img src={pdfQrDataUrl} alt="" className="h-[70px] w-[70px] rounded-md border border-gray-200 bg-white object-contain" />
              </div>
            ) : null}
            <div className="mt-2 grid gap-1 text-sm text-gray-700">
              <div>
                {t("app.printpress.quotations.detail.meta.customer")}: <span className="font-medium text-gray-900">{quotation?.customer?.fullName ?? "—"}</span>
              </div>
              <div>
                {t("app.printpress.quotations.detail.meta.createdAt")}: <span className="font-medium text-gray-900">{quotation ? new Date(quotation.createdAt).toLocaleString() : "—"}</span>
              </div>
              <div>
                {t("app.printpress.quotations.detail.meta.status")}: <span className="font-medium text-gray-900">{quotation ? t(`app.printpress.quotations.status.${quotation.status}`) : "—"}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-xs font-medium text-gray-600">{t("app.printpress.quotations.detail.meta.customer")}</div>
            <div className="mt-1 text-sm font-semibold text-gray-900">{quotation?.customer?.fullName ?? "—"}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-sm text-gray-700">
              {t("app.printpress.quotations.detail.meta.createdAt")}:{" "}
              <span className="font-medium text-gray-900">{quotation ? new Date(quotation.createdAt).toLocaleString() : "—"}</span>
            </div>
          </div>
        </div>

        {quotation?.notes ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <div className="text-xs font-medium text-gray-600">{t("app.printpress.quotations.field.notes")}</div>
            <div className="mt-1 whitespace-pre-wrap text-gray-900">{quotation.notes}</div>
          </div>
        ) : null}
      </div>

      <div className="print-hidden flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="text-xl font-semibold">{t("app.printpress.quotations.detail.title")}</div>
          <div className="mt-1 text-sm text-gray-700">
            {t("app.printpress.quotations.detail.subtitle")}{" "}
            <span className="font-medium text-gray-900">{quotation?.quotationNumber ?? t("app.printpress.quotations.noNumber")}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/t/${props.tenantSlug}/printpress/quotations`}
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
            onClick={shareEmail}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            {t("app.printpress.quotations.share.email")}
          </button>
          <button
            type="button"
            onClick={shareWhatsApp}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            {t("app.printpress.quotations.share.whatsapp")}
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
            disabled={!canEdit || (quotation?.status ?? "") === "void"}
            onClick={askIssue}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
          >
            {t("app.printpress.quotations.detail.action.issue")}
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={askConvert}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
          >
            {t("app.printpress.quotations.detail.action.convert")}
          </button>
          <button
            type="button"
            disabled={!canEdit}
            onClick={askVoid}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
          >
            {t("app.printpress.quotations.detail.action.void")}
          </button>
        </div>
      </div>

      {errorKey ? <div className="print-hidden rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
          <div className="text-sm font-medium text-gray-900">{t("app.printpress.quotations.detail.meta.title")}</div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-600">{t("app.printpress.quotations.detail.meta.status")}</dt>
              <dd className="font-medium text-gray-900">{quotation ? t(`app.printpress.quotations.status.${quotation.status}`) : "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-600">{t("app.printpress.quotations.detail.meta.customer")}</dt>
              <dd className="font-medium text-gray-900">{quotation?.customer?.fullName ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-gray-600">{t("app.printpress.quotations.detail.meta.createdAt")}</dt>
              <dd className="font-medium text-gray-900">{quotation ? new Date(quotation.createdAt).toLocaleString() : "—"}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
          <div className="text-sm font-medium text-gray-900">{t("app.printpress.quotations.detail.summary.title")}</div>
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
          <div className="text-sm font-medium text-gray-900">{t("app.printpress.quotations.detail.lines.title")}</div>
          <button
            type="button"
            disabled={!canEdit}
            onClick={openAddLine}
            className="inline-flex h-9 items-center rounded-xl bg-primary-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
          >
            {t("app.printpress.quotations.detail.lines.action.add")}
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-100 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.quotations.detail.lines.table.description")}</th>
                <th className="border-b border-gray-100 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.printpress.quotations.detail.lines.table.qty")}</th>
                <th className="border-b border-gray-100 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.printpress.quotations.detail.lines.table.unitPrice")}</th>
                <th className="border-b border-gray-100 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.printpress.quotations.detail.lines.table.total")}</th>
                <th className="border-b border-gray-100 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.quotations.detail.lines.table.actions")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={5}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : (quotation?.lines ?? []).length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={5}>
                    {t("app.printpress.quotations.detail.lines.empty")}
                  </td>
                </tr>
              ) : (
                (quotation?.lines ?? []).map((l) => (
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

      <Modal open={editOpen} onClose={() => setEditOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="text-xl font-semibold">{t("app.printpress.quotations.detail.edit.title")}</div>
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
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.quotations.field.customer")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={customerQuery}
                onChange={(e) => setCustomerQuery(e.target.value)}
                placeholder={t("app.printpress.quotations.field.customer.placeholder")}
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
                    <div className="px-3 py-3 text-sm text-gray-600">{t("app.printpress.quotations.field.customer.empty")}</div>
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

            <div className="grid gap-3 md:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.quotations.field.currency")}</label>
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
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.quotations.field.discount")}</label>
                <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={discount} onChange={(e) => setDiscount(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.quotations.field.tax")}</label>
                <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={tax} onChange={(e) => setTax(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.quotations.field.notes")}</label>
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

      <Modal open={lineModalOpen} onClose={() => setLineModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="text-xl font-semibold">{editingLine ? t("app.printpress.quotations.detail.lines.modal.edit") : t("app.printpress.quotations.detail.lines.modal.add")}</div>
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
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.quotations.detail.lines.field.description")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={lineDescription}
                onChange={(e) => setLineDescription(e.target.value)}
              />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.quotations.detail.lines.field.qty")}</label>
                <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={lineQuantity} onChange={(e) => setLineQuantity(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.printpress.quotations.detail.lines.field.unitPrice")}</label>
                <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={lineUnitPrice} onChange={(e) => setLineUnitPrice(e.target.value)} />
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
