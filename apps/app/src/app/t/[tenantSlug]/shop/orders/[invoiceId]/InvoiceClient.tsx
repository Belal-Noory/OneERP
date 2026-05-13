"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatMoney } from "@/lib/currency-catalog";
import { Modal } from "@/components/Modal";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";

type MeResponse = {
  data: {
    memberships: { tenantId: string; tenantSlug: string }[];
  };
};

type Location = { id: string; name: string };
type Customer = { id: string; name: string };

type InvoiceLine = {
  product: { id: string; name: string; sku: string | null; unit: { id: string; name: string; symbol: string | null } | null };
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  discountAmount: string;
  netTotal: string;
};

type InvoicePayment = {
  id: string;
  direction: "in" | "out";
  method: string;
  amount: string;
  note: string | null;
  createdAt: string;
  actor: { id: string; fullName: string | null } | null;
};

type InvoiceResponse = {
  data: {
    id: string;
    kind: "sale" | "refund";
    status: "draft" | "posted" | "void";
    invoiceNumber: string | null;
    refundOf: { id: string; invoiceNumber: string | null } | null;
    restockOnRefund: boolean;
    currencyCode: string;
    notes: string | null;
    grossSubtotal: string;
    invoiceDiscountAmount: string;
    discountTotal: string;
    taxEnabled: boolean;
    taxRate: string;
    taxTotal: string;
    roundingAdjustment: string;
    subtotal: string;
    paidTotal: string;
    createdAt: string;
    postedAt: string | null;
    customer: Customer | null;
    location: Location | null;
    payments: InvoicePayment[];
    lines: InvoiceLine[];
    refundable: { productId: string; quantity: string }[];
  };
};

type LocationsResponse = { data: Location[] };
type CustomersResponse = { data: { items: { id: string; name: string }[] } };
type ProductsResponse = {
  data: {
    items: { id: string; name: string; sku: string | null; sellPrice: string; unit: { id: string; name: string; symbol: string | null } | null }[];
  };
};

type PaymentMethod = { id: string; name: string; kind: "cash" | "card" | "bank" | "mobile" | "other" };
type PaymentMethodsResponse = { data: PaymentMethod[] };

type DraftLine = {
  productId: string;
  name: string;
  sku: string | null;
  unit: { id: string; name: string; symbol: string | null } | null;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
};

type ShopSettingsResponse = { data: { cashRoundingIncrement: string } };

export function InvoiceClient(props: { tenantSlug: string; invoiceId: string }) {
  const { t } = useClientI18n();
  const router = useRouter();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [invoice, setInvoice] = useState<InvoiceResponse["data"] | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);

  const [locationId, setLocationId] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [invoiceDiscountAmount, setInvoiceDiscountAmount] = useState("0");
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState("0");
  const [cashRoundingIncrement, setCashRoundingIncrement] = useState("0");

  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [creatingRefund, setCreatingRefund] = useState(false);
  const [refundLines, setRefundLines] = useState<{ productId: string; name: string; maxQty: string; qty: string }[]>([]);
  const [refundRestockOnRefund, setRefundRestockOnRefund] = useState(true);
  const [restockOnRefund, setRestockOnRefund] = useState(true);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentMethodName, setPaymentMethodName] = useState("Cash");
  const [showAddPaymentMethod, setShowAddPaymentMethod] = useState(false);
  const [creatingPaymentMethod, setCreatingPaymentMethod] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [addingPayment, setAddingPayment] = useState(false);

  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductsResponse["data"]["items"]>([]);
  const [productLoading, setProductLoading] = useState(false);
  const [scanCode, setScanCode] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanCandidates, setScanCandidates] = useState<ProductsResponse["data"]["items"]>([]);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);

  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);

  const calculated = useMemo(() => {
    function clamp(n: number, min: number, max: number): number {
      return Math.max(min, Math.min(max, n));
    }

    let grossSubtotal = 0;
    let lineDiscountTotal = 0;
    for (const l of lines) {
      const qty = Number(l.quantity);
      const price = Number(l.unitPrice);
      if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || price < 0) continue;
      const lineTotal = qty * price;
      const disc = Number(l.discountAmount || "0");
      const discNorm = Number.isFinite(disc) ? clamp(disc, 0, lineTotal) : 0;
      grossSubtotal += lineTotal;
      lineDiscountTotal += discNorm;
    }

    grossSubtotal = Number(grossSubtotal.toFixed(2));
    lineDiscountTotal = Number(lineDiscountTotal.toFixed(2));

    const netSubtotal = Number((grossSubtotal - lineDiscountTotal).toFixed(2));
    const invDiscRaw = Number(invoiceDiscountAmount || "0");
    const invDisc = Number.isFinite(invDiscRaw) ? clamp(invDiscRaw, 0, netSubtotal) : 0;
    const discountedSubtotal = Number((netSubtotal - invDisc).toFixed(2));

    const rateRaw = Number(taxRate || "0");
    const rate = Number.isFinite(rateRaw) ? clamp(rateRaw, 0, 100) : 0;
    const taxTotal = taxEnabled ? Number(((discountedSubtotal * rate) / 100).toFixed(2)) : 0;
    const total = Number((discountedSubtotal + taxTotal).toFixed(2));

    const discountTotal = Number((lineDiscountTotal + invDisc).toFixed(2));

    return {
      grossSubtotal: String(grossSubtotal.toFixed(2)),
      discountTotal: String(discountTotal.toFixed(2)),
      taxTotal: String(taxTotal.toFixed(2)),
      taxRate: String(rate.toFixed(2)),
      total: String(total.toFixed(2))
    };
  }, [lines, invoiceDiscountAmount, taxEnabled, taxRate]);

  function roundToIncrementAmount(amount: number, increment: number): number {
    if (!Number.isFinite(amount) || !Number.isFinite(increment) || increment <= 0) return amount;
    const amountCents = Math.round(amount * 100);
    const incCents = Math.round(increment * 100);
    if (incCents <= 0) return amount;
    const q = amountCents / incCents;
    const rq = Math.round(q);
    return Number(((rq * incCents) / 100).toFixed(2));
  }

  function addProductToInvoice(p: ProductsResponse["data"]["items"][number]) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id) ?? null;
      if (!existing) {
        return [{ productId: p.id, name: p.name, sku: p.sku, unit: p.unit, quantity: "1", unitPrice: p.sellPrice, discountAmount: "0" }, ...prev];
      }
      return prev.map((l) => (l.productId === p.id ? { ...l, quantity: String(Number(l.quantity || "0") + 1) } : l));
    });
  }

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
        const [locRes, invRes, settingsRes] = await Promise.all([
          apiFetch("/api/shop/locations", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/invoices/${props.invoiceId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch("/api/shop/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);
        if (!locRes.ok || !invRes.ok) {
          const json = (await invRes.json()) as { error?: { message_key?: string } };
          setErrorKey(json.error?.message_key ?? "errors.internal");
          return;
        }
        const locJson = (await locRes.json()) as LocationsResponse;
        const invJson = (await invRes.json()) as InvoiceResponse;
        const settingsJson = settingsRes.ok ? ((await settingsRes.json()) as ShopSettingsResponse) : null;
        if (!cancelled) {
          setLocations(locJson.data ?? []);
          setInvoice(invJson.data);
          setLocationId(invJson.data.location?.id ?? (locJson.data?.[0]?.id ?? ""));
          setCustomer(invJson.data.customer);
          setNotes(invJson.data.notes ?? "");
          setRestockOnRefund(Boolean(invJson.data.restockOnRefund));
          if (invJson.data.kind === "refund") {
            setInvoiceDiscountAmount("0");
            setTaxEnabled(false);
            setTaxRate("0");
          } else {
            setInvoiceDiscountAmount(invJson.data.invoiceDiscountAmount ?? "0");
            setTaxEnabled(Boolean(invJson.data.taxEnabled));
            setTaxRate(invJson.data.taxRate ?? "0");
          }
          if (settingsJson?.data?.cashRoundingIncrement !== undefined) setCashRoundingIncrement(settingsJson.data.cashRoundingIncrement);
          setLines(
            invJson.data.lines.map((l) => ({
              productId: l.product.id,
              name: l.product.name,
              sku: l.product.sku,
              unit: l.product.unit,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discountAmount: l.discountAmount ?? "0"
            }))
          );
          const refundableMap = new Map((invJson.data.refundable ?? []).map((r) => [r.productId, r.quantity]));
          if (invJson.data.kind === "sale" && invJson.data.status === "posted" && refundableMap.size) {
            setRefundLines(
              invJson.data.lines
                .map((l) => ({ productId: l.product.id, name: l.product.name, maxQty: refundableMap.get(l.product.id) ?? "0" }))
                .filter((l) => Number(l.maxQty) > 0)
                .map((l) => ({ ...l, qty: l.maxQty }))
            );
          } else {
            setRefundLines([]);
          }
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
  }, [tenantId, props.invoiceId]);

  useEffect(() => {
    let cancelled = false;
    async function searchProducts() {
      if (!tenantId) return;
      const q = productQuery.trim();
      if (q.length < 1) {
        setProductResults([]);
        return;
      }
      setProductLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("status", "active");
        params.set("q", q);
        params.set("page", "1");
        params.set("pageSize", "20");
        const res = await apiFetch(`/api/shop/products?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as ProductsResponse;
        if (!cancelled) setProductResults(json.data.items ?? []);
      } catch {} finally {
        if (!cancelled) setProductLoading(false);
      }
    }
    const handle = setTimeout(() => void searchProducts(), 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [tenantId, productQuery]);

  useEffect(() => {
    let cancelled = false;
    async function searchCustomers() {
      if (!tenantId) return;
      const q = customerQuery.trim();
      if (q.length < 1) {
        setCustomerResults([]);
        return;
      }
      setCustomerLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("status", "active");
        params.set("q", q);
        params.set("page", "1");
        params.set("pageSize", "10");
        const res = await apiFetch(`/api/shop/customers?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as CustomersResponse;
        if (!cancelled) setCustomerResults((json.data.items ?? []).map((c) => ({ id: c.id, name: c.name })));
      } catch {} finally {
        if (!cancelled) setCustomerLoading(false);
      }
    }
    const handle = setTimeout(() => void searchCustomers(), 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [tenantId, customerQuery]);

  useEffect(() => {
    let cancelled = false;
    async function loadPaymentMethods() {
      if (!tenantId || !paymentModalOpen) return;
      try {
        const res = await apiFetch("/api/shop/payment-methods", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as PaymentMethodsResponse;
        if (!cancelled) setPaymentMethods(json.data ?? []);
      } catch {}
    }
    void loadPaymentMethods();
    return () => {
      cancelled = true;
    };
  }, [tenantId, paymentModalOpen]);

  async function saveDraft() {
    if (!tenantId || !invoice) return;
    setSaving(true);
    setErrorKey(null);
    try {
      const payload = {
        locationId: locationId || null,
        customerId: customer?.id ?? null,
        notes: notes.trim() ? notes.trim() : null,
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, discountAmount: l.discountAmount })),
        invoiceDiscountAmount,
        taxEnabled,
        taxRate,
        ...(invoice.kind === "refund" ? { restockOnRefund } : {})
      };
      const res = await apiFetch(`/api/shop/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      const invRes = await apiFetch(`/api/shop/invoices/${invoice.id}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      if (!invRes.ok) return;
      const invJson = (await invRes.json()) as InvoiceResponse;
      setInvoice(invJson.data);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  }

  async function handleScanSubmit(forcedCode?: string) {
    if (!tenantId) return;
    const code = (forcedCode ?? scanCode).trim();
    if (!code) return;
    if (!isDraft) return;

    setScanError(null);
    setScanning(true);
    try {
      const params = new URLSearchParams();
      params.set("status", "active");
      params.set("q", code);
      params.set("page", "1");
      params.set("pageSize", "10");
      const res = await apiFetch(`/api/shop/products?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      if (!res.ok) {
        setScanError("errors.internal");
        return;
      }
      const json = (await res.json()) as ProductsResponse;
      const items = json.data.items ?? [];
      if (items.length === 0) {
        setScanError("app.shop.invoice.scan.notFound");
        return;
      }
      if (items.length === 1) {
        addProductToInvoice(items[0]);
        setScanCode("");
        return;
      }
      setScanCandidates(items);
      setScanModalOpen(true);
      setScanError("app.shop.invoice.scan.multiple");
    } catch {
      setScanError("errors.internal");
    } finally {
      setScanning(false);
    }
  }

  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }

  if (loading && !invoice) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card text-sm text-gray-700">Loading…</div>;
  }

  const currencyCode = invoice?.currencyCode ?? "USD";
  const isDraft = invoice?.status === "draft";
  const paidTotal = invoice?.paidTotal ? Number(invoice.paidTotal) : 0;
  const baseOutstanding = Math.max(0, Number(invoice?.subtotal ?? "0") - paidTotal).toFixed(2);
  const baseOutstandingNumber = Number(baseOutstanding);
  const selectedMethodKind = paymentMethods.find((m) => m.name === paymentMethodName)?.kind ?? null;
  const paymentOutstanding = (() => {
    if (!invoice) return baseOutstanding;
    const inc = Number(cashRoundingIncrement || "0");
    const invoiceSubtotal = Number(invoice.subtotal || "0");
    if (
      selectedMethodKind === "cash" &&
      Number.isFinite(inc) &&
      inc > 0 &&
      paidTotal === 0 &&
      Number(invoice.roundingAdjustment || "0") === 0
    ) {
      const rounded = roundToIncrementAmount(invoiceSubtotal, inc);
      return Math.max(0, rounded - paidTotal).toFixed(2);
    }
    return baseOutstanding;
  })();
  const paymentOutstandingNumber = Number(paymentOutstanding);
  const paymentAmountNumber = Number(paymentAmount);
  const paymentExceedsBalance = Number.isFinite(paymentAmountNumber) && paymentAmount.trim() !== "" && paymentAmountNumber - paymentOutstandingNumber > 1e-9;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">
              {invoice?.invoiceNumber
                ? invoice.invoiceNumber
                : invoice?.kind === "refund"
                  ? t("app.shop.invoice.titleRefundDraft")
                  : t("app.shop.invoice.titleDraft")}
            </div>
            <div className="mt-1 text-sm text-gray-700">{t(`app.shop.orders.status.${invoice?.status ?? "draft"}`)}</div>
            {invoice?.kind === "refund" && invoice.refundOf?.invoiceNumber ? (
              <div className="mt-1 text-xs text-gray-600">
                {t("app.shop.invoice.refund.of")} {invoice.refundOf.invoiceNumber}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              href={`/t/${props.tenantSlug}/shop/orders`}
            >
              {t("app.shop.invoice.action.back")}
            </Link>
            <div className="relative">
              <button
                type="button"
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
                onClick={() => setShowExportMenu((v) => !v)}
              >
                <span className="mr-2 inline-block h-4 w-4 text-gray-600">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M12 5v9m0 0l-3-3m3 3l3-3M5 19h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
                {t("app.shop.invoice.export.button")}
              </button>
              {showExportMenu ? (
                <div className="absolute right-0 z-20 mt-2 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
                  <a
                    className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                    href={`/t/${props.tenantSlug}/shop/orders/${props.invoiceId}/print?paper=thermal80`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="inline-block h-4 w-4 text-gray-600">
                      <svg viewBox="0 0 24 24" fill="none"><path d="M6 9V4h12v5M6 9h12M6 9v7h12V9M6 16h12M8 13h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                    {t("app.shop.invoice.export.receipt")}
                  </a>
                  <a
                    className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                    href={`/t/${props.tenantSlug}/shop/orders/${props.invoiceId}/print?paper=thermal58`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="inline-block h-4 w-4 text-gray-600">
                      <svg viewBox="0 0 24 24" fill="none"><path d="M6 9V4h12v5M6 9h12M6 9v7h12V9M6 16h12M8 13h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                    {t("app.shop.invoice.export.receipt58")}
                  </a>
                  <a
                    className="flex items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                    href={`/t/${props.tenantSlug}/shop/orders/${props.invoiceId}/print?paper=a4`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="inline-block h-4 w-4 text-gray-600">
                      <svg viewBox="0 0 24 24" fill="none"><path d="M7 4h10v16H7zM9 8h6M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                    {t("app.shop.invoice.export.a4")}
                  </a>
                  <a
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                    href={`/t/${props.tenantSlug}/shop/orders/${props.invoiceId}/print?paper=thermal80&download=pdf`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="inline-block h-4 w-4 text-gray-600">
                      <svg viewBox="0 0 24 24" fill="none"><path d="M6 4h8l4 4v12H6zM10 14h4M10 10h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                    {t("app.shop.invoice.export.pdf")}
                  </a>
                  <a
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                    href={`/t/${props.tenantSlug}/shop/orders/${props.invoiceId}/print?paper=thermal58&download=pdf`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span className="inline-block h-4 w-4 text-gray-600">
                      <svg viewBox="0 0 24 24" fill="none"><path d="M6 4h8l4 4v12H6zM10 14h4M10 10h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </span>
                    {t("app.shop.invoice.export.pdf58")}
                  </a>
                </div>
              ) : null}
            </div>
            {invoice?.kind === "sale" && invoice?.status === "posted" ? (
              <button
                type="button"
                disabled={creatingRefund || refundLines.length === 0}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                onClick={() => {
                  setRefundRestockOnRefund(true);
                  setRefundDialogOpen(true);
                }}
              >
                {creatingRefund ? t("app.shop.products.action.working") : t("app.shop.invoice.action.refund")}
              </button>
            ) : null}
            {invoice?.status === "posted" ? (
              <button
                type="button"
                disabled={voiding}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                onClick={() => setVoidDialogOpen(true)}
              >
                {voiding ? t("app.shop.products.action.working") : t("app.shop.invoice.action.void")}
              </button>
            ) : null}
            {isDraft ? (
              <button
                type="button"
                disabled={deleting}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                onClick={() => setDeleteDialogOpen(true)}
              >
                {deleting ? t("app.shop.products.action.working") : t("app.shop.invoice.action.deleteDraft")}
              </button>
            ) : null}
            <button
              type="button"
              disabled={!isDraft || saving}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={saveDraft}
            >
              {saving ? t("app.shop.products.action.working") : t("app.shop.invoice.action.save")}
            </button>
            <button
              type="button"
              disabled={!isDraft || posting}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              onClick={() => setPostDialogOpen(true)}
            >
              {posting
                ? t("app.shop.products.action.working")
                : invoice?.kind === "refund"
                  ? t("app.shop.invoice.action.postRefund")
                  : t("app.shop.invoice.action.post")}
            </button>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card lg:col-span-2">
          <div className="text-lg font-semibold">{t("app.shop.invoice.section.items")}</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 md:items-start">
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.shop.invoice.scan.title")}</label>
              <div className="mt-1 flex gap-2">
                <input
                  disabled={!isDraft}
                  inputMode="numeric"
                  className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
                  value={scanCode}
                  onChange={(e) => {
                    setScanCode(e.target.value);
                    setScanError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void handleScanSubmit();
                  }}
                  placeholder={t("app.shop.invoice.scan.placeholder")}
                />
                <button
                  type="button"
                  disabled={!isDraft}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                  onClick={() => setCameraScannerOpen(true)}
                  aria-label={t("app.shop.products.scan.open")}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M7 7h2M7 17h2M15 7h2M15 17h2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M6 10v4M18 10v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <path d="M9 6h6M9 18h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              {scanning ? <div className="mt-2 text-xs text-gray-500">Searching…</div> : null}
              {scanError ? <div className="mt-2 text-xs text-red-700">{t(scanError)}</div> : null}
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700">{t("app.shop.invoice.search.products")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder={t("app.shop.invoice.search.products.placeholder")}
              />
              {productLoading ? <div className="mt-2 text-xs text-gray-500">Searching…</div> : null}
              {productResults.length ? (
                <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200">
                  {productResults.slice(0, 8).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!isDraft}
                      className="flex w-full items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3 text-left text-sm hover:bg-gray-50 disabled:opacity-60"
                      onClick={() => {
                        setProductQuery("");
                        setProductResults([]);
                        addProductToInvoice(p);
                      }}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-900">{p.name}</div>
                        <div className="mt-1 text-xs text-gray-500">{p.sku ?? "—"}</div>
                      </div>
                      <div className="shrink-0 text-sm font-medium text-gray-900">{formatMoney(p.sellPrice, currencyCode)}</div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-[760px] w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.invoice.table.product")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.invoice.table.qty")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.invoice.table.unitPrice")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.invoice.table.discount")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.invoice.table.total")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.invoice.table.actions")}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {lines.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-gray-600" colSpan={6}>
                      {t("app.shop.invoice.lines.empty")}
                    </td>
                  </tr>
                ) : (
                  lines.map((l) => {
                    const qty = Number(l.quantity || "0");
                    const unitPrice = Number(l.unitPrice || "0");
                    const lineTotalNum = Number.isFinite(qty) && Number.isFinite(unitPrice) ? qty * unitPrice : 0;
                    const discRaw = Number(l.discountAmount || "0");
                    const disc = Number.isFinite(discRaw) ? Math.max(0, Math.min(discRaw, lineTotalNum)) : 0;
                    const net = Math.max(0, lineTotalNum - disc);
                    return (
                      <tr key={l.productId}>
                        <td className="border-b border-gray-100 px-4 py-3">
                          <div className="font-medium text-gray-900">{l.name}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            {l.sku ?? "—"}
                            {l.unit ? ` · ${l.unit.name}${l.unit.symbol ? ` (${l.unit.symbol})` : ""}` : ""}
                          </div>
                        </td>
                        <td className="border-b border-gray-100 px-4 py-3">
                          <input
                            disabled={!isDraft}
                            className="h-10 w-24 rounded-xl border border-gray-200 px-3 text-sm"
                            value={l.quantity}
                            onChange={(e) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, quantity: e.target.value } : x)))}
                          />
                        </td>
                        <td className="border-b border-gray-100 px-4 py-3">
                          <input
                            disabled={!isDraft}
                            className="h-10 w-28 rounded-xl border border-gray-200 px-3 text-sm"
                            value={l.unitPrice}
                            onChange={(e) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, unitPrice: e.target.value } : x)))}
                          />
                        </td>
                        <td className="border-b border-gray-100 px-4 py-3">
                          <input
                            disabled={!isDraft}
                            className="h-10 w-28 rounded-xl border border-gray-200 px-3 text-sm"
                            value={l.discountAmount}
                            onChange={(e) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, discountAmount: e.target.value } : x)))}
                          />
                        </td>
                        <td className="border-b border-gray-100 px-4 py-3 text-gray-900">
                          <div className="font-medium">{formatMoney(String(net.toFixed(2)), currencyCode)}</div>
                          {disc > 0 ? (
                            <div className="mt-1 text-xs text-gray-500">
                              <span className="line-through">{formatMoney(String(lineTotalNum.toFixed(2)), currencyCode)}</span> · -{formatMoney(String(disc.toFixed(2)), currencyCode)}
                            </div>
                          ) : null}
                        </td>
                        <td className="border-b border-gray-100 px-4 py-3">
                          <button
                            type="button"
                            disabled={!isDraft}
                            className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                            onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))}
                          >
                            {t("app.shop.invoice.action.removeLine")}
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex justify-end">
            <div className="w-full max-w-xs space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-gray-700">{t("app.shop.invoice.summary.grossSubtotal")}</div>
                <div className="font-medium text-gray-900 tabular">{formatMoney(isDraft ? calculated.grossSubtotal : invoice?.grossSubtotal ?? calculated.grossSubtotal, currencyCode)}</div>
              </div>
              {Number(isDraft ? calculated.discountTotal : invoice?.discountTotal ?? "0") > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-gray-700">{t("app.shop.invoice.summary.discountTotal")}</div>
                  <div className="font-medium text-gray-900 tabular">-{formatMoney(isDraft ? calculated.discountTotal : invoice?.discountTotal ?? calculated.discountTotal, currencyCode)}</div>
                </div>
              ) : null}
              {Boolean(isDraft ? taxEnabled : invoice?.taxEnabled) && Number(isDraft ? calculated.taxTotal : invoice?.taxTotal ?? "0") > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-gray-700">
                    {t("app.shop.invoice.summary.tax")} ({isDraft ? calculated.taxRate : invoice?.taxRate ?? calculated.taxRate}%)
                  </div>
                  <div className="font-medium text-gray-900 tabular">{formatMoney(isDraft ? calculated.taxTotal : invoice?.taxTotal ?? calculated.taxTotal, currencyCode)}</div>
                </div>
              ) : null}
              {!isDraft && invoice && Number(invoice.roundingAdjustment || "0") !== 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="text-gray-700">{t("app.shop.invoice.summary.rounding")}</div>
                  <div className="font-medium text-gray-900 tabular">{formatMoney(invoice.roundingAdjustment, currencyCode)}</div>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 border-t border-gray-200 pt-3">
                <div className="text-gray-700">{t("app.shop.invoice.summary.total")}</div>
                <div className="text-lg font-semibold text-gray-900 tabular">{formatMoney(isDraft ? calculated.total : invoice?.subtotal ?? calculated.total, currencyCode)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
            <div className="text-lg font-semibold">{t("app.shop.invoice.section.details")}</div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.shop.invoice.field.location")}</label>
                <select
                  disabled={!isDraft || invoice?.kind === "refund"}
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                >
                  <option value="">{t("app.shop.invoice.field.location.placeholder")}</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.shop.invoice.field.customer")}</label>
                <input
                  disabled={!isDraft || invoice?.kind === "refund"}
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
                  value={customer ? customer.name : customerQuery}
                  onChange={(e) => {
                    setCustomer(null);
                    setCustomerQuery(e.target.value);
                  }}
                  placeholder={t("app.shop.invoice.field.customer.placeholder")}
                />
                {customerLoading ? <div className="mt-2 text-xs text-gray-500">Searching…</div> : null}
                {!customer && customerResults.length ? (
                  <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200">
                    {customerResults.slice(0, 8).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        disabled={!isDraft}
                        className="flex w-full items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3 text-left text-sm hover:bg-gray-50 disabled:opacity-60"
                        onClick={() => {
                          setCustomer(c);
                          setCustomerQuery("");
                          setCustomerResults([]);
                        }}
                      >
                        <div className="truncate font-medium text-gray-900">{c.name}</div>
                      </button>
                    ))}
                  </div>
                ) : null}
                {customer ? (
                  <button
                    type="button"
                    disabled={!isDraft || invoice?.kind === "refund"}
                    className="mt-2 inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                    onClick={() => setCustomer(null)}
                  >
                    {t("app.shop.invoice.action.clearCustomer")}
                  </button>
                ) : null}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.shop.invoice.field.notes")}</label>
                <textarea
                  disabled={!isDraft}
                  className="mt-1 min-h-[90px] w-full rounded-xl border border-gray-200 px-3 py-2 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("app.shop.invoice.field.notes.placeholder")}
                />
              </div>

              {invoice?.kind === "refund" ? (
                <div>
                  <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700">
                    <input
                      type="checkbox"
                      disabled={!isDraft}
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-60"
                      checked={restockOnRefund}
                      onChange={(e) => setRestockOnRefund(e.target.checked)}
                    />
                    {t("app.shop.invoice.refund.restockOnRefund")}
                  </label>
                  <div className="mt-2 text-xs text-gray-500">{t("app.shop.invoice.refund.restockOnRefund.hint")}</div>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700">{t("app.shop.invoice.field.invoiceDiscount")}</label>
                    <input
                      disabled={!isDraft}
                      className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
                      value={invoiceDiscountAmount}
                      onChange={(e) => setInvoiceDiscountAmount(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col justify-end gap-2">
                    <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-700">
                      <input
                        type="checkbox"
                        disabled={!isDraft}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-60"
                        checked={taxEnabled}
                        onChange={(e) => setTaxEnabled(e.target.checked)}
                      />
                      {t("app.shop.invoice.field.taxEnabled")}
                    </label>
                    <div>
                      <label className="block text-xs font-medium text-gray-700">{t("app.shop.invoice.field.taxRate")}</label>
                      <input
                        disabled={!isDraft || !taxEnabled}
                        className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
                        value={taxRate}
                        onChange={(e) => setTaxRate(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {invoice?.status === "posted" ? (
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-lg font-semibold">
                    {invoice.kind === "refund" ? t("app.shop.invoice.section.refundPayments") : t("app.shop.invoice.section.payments")}
                  </div>
                  <div className="mt-1 text-sm text-gray-700">
                    {invoice.kind === "refund" ? t("app.shop.invoice.refundPayments.subtitle") : t("app.shop.invoice.payments.subtitle")}
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={baseOutstandingNumber <= 0}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                    onClick={() => {
                      setPaymentMethodName("Cash");
                      if (invoice) {
                        const inc = Number(cashRoundingIncrement || "0");
                        const invoiceSubtotal = Number(invoice.subtotal || "0");
                        if (paidTotal === 0 && Number(invoice.roundingAdjustment || "0") === 0 && Number.isFinite(inc) && inc > 0) {
                          const rounded = roundToIncrementAmount(invoiceSubtotal, inc);
                          setPaymentAmount(Math.max(0, rounded - paidTotal).toFixed(2));
                        } else {
                          setPaymentAmount(baseOutstanding);
                        }
                      } else {
                        setPaymentAmount(baseOutstanding);
                      }
                      setPaymentNote("");
                      setShowAddPaymentMethod(false);
                      setPaymentModalOpen(true);
                    }}
                  >
                    {invoice.kind === "refund" ? t("app.shop.invoice.refundPayments.payFull") : t("app.shop.invoice.payments.payFull")}
                  </button>
                  <button
                    type="button"
                    disabled={baseOutstandingNumber <= 0}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
                    onClick={() => {
                      setPaymentMethodName("Cash");
                      if (invoice) {
                        const inc = Number(cashRoundingIncrement || "0");
                        const invoiceSubtotal = Number(invoice.subtotal || "0");
                        if (paidTotal === 0 && Number(invoice.roundingAdjustment || "0") === 0 && Number.isFinite(inc) && inc > 0) {
                          const rounded = roundToIncrementAmount(invoiceSubtotal, inc);
                          setPaymentAmount(Math.max(0, rounded - paidTotal).toFixed(2));
                        } else {
                          setPaymentAmount(baseOutstanding);
                        }
                      } else {
                        setPaymentAmount(baseOutstanding);
                      }
                      setPaymentNote("");
                      setShowAddPaymentMethod(false);
                      setPaymentModalOpen(true);
                    }}
                  >
                    {invoice.kind === "refund" ? t("app.shop.invoice.refundPayments.add") : t("app.shop.invoice.payments.add")}
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="text-sm text-gray-700">
                    {invoice.kind === "refund" ? t("app.shop.invoice.refundPayments.paidOut") : t("app.shop.invoice.payments.paid")}
                  </div>
                  <div className="text-sm font-semibold text-gray-900">{formatMoney(String(paidTotal.toFixed(2)), currencyCode)}</div>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <div className="text-sm text-gray-700">
                    {invoice.kind === "refund" ? t("app.shop.invoice.refundPayments.remaining") : t("app.shop.invoice.payments.balance")}
                  </div>
                  <div className="text-sm font-semibold text-gray-900">{formatMoney(baseOutstanding, currencyCode)}</div>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-[680px] w-full border-separate border-spacing-0">
                  <thead>
                    <tr>
                      <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.invoice.payments.table.time")}</th>
                      <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.invoice.payments.table.method")}</th>
                      <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.invoice.payments.table.amount")}</th>
                      <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.invoice.payments.table.note")}</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {invoice.payments.length === 0 ? (
                      <tr>
                        <td className="px-4 py-6 text-gray-600" colSpan={4}>
                          {t("app.shop.invoice.payments.empty")}
                        </td>
                      </tr>
                    ) : (
                      invoice.payments.map((p) => (
                        <tr key={p.id}>
                          <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{new Date(p.createdAt).toLocaleString()}</td>
                          <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{p.method}</td>
                          <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{formatMoney(p.amount, currencyCode)}</td>
                          <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{p.note ?? "—"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmDialog
        open={postDialogOpen}
        title={invoice?.kind === "refund" ? t("app.shop.invoice.postRefund.title") : t("app.shop.invoice.post.title")}
        description={invoice?.kind === "refund" ? t("app.shop.invoice.postRefund.desc") : t("app.shop.invoice.post.desc")}
        confirmLabel={invoice?.kind === "refund" ? t("app.shop.invoice.action.postRefund") : t("app.shop.invoice.action.post")}
        cancelLabel={t("common.button.cancel")}
        confirmTone="primary"
        busy={posting}
        onCancel={() => setPostDialogOpen(false)}
        onConfirm={async () => {
          if (!tenantId || !invoice) return;
          setPosting(true);
          setErrorKey(null);
          try {
            await saveDraft();
            const res = await apiFetch(`/api/shop/invoices/${invoice.id}/post`, { method: "POST", headers: { "X-Tenant-Id": tenantId } });
            const json = (await res.json()) as { error?: { message_key?: string } };
            if (!res.ok) {
              setErrorKey(json.error?.message_key ?? "errors.internal");
              return;
            }
            const invRes = await apiFetch(`/api/shop/invoices/${invoice.id}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
            if (invRes.ok) {
              const invJson = (await invRes.json()) as InvoiceResponse;
              setInvoice(invJson.data);
            }
            setPostDialogOpen(false);
          } catch {
            setErrorKey("errors.internal");
          } finally {
            setPosting(false);
          }
        }}
      />

      <ConfirmDialog
        open={voidDialogOpen}
        title={t("app.shop.invoice.void.title")}
        description={t("app.shop.invoice.void.desc")}
        confirmLabel={t("app.shop.invoice.action.void")}
        cancelLabel={t("common.button.cancel")}
        confirmTone="danger"
        busy={voiding}
        onCancel={() => setVoidDialogOpen(false)}
        onConfirm={async () => {
          if (!tenantId || !invoice) return;
          setVoiding(true);
          setErrorKey(null);
          try {
            const res = await apiFetch(`/api/shop/invoices/${invoice.id}/void`, { method: "POST", headers: { "X-Tenant-Id": tenantId } });
            const json = (await res.json()) as { error?: { message_key?: string } };
            if (!res.ok) {
              setErrorKey(json.error?.message_key ?? "errors.internal");
              return;
            }
            const invRes = await apiFetch(`/api/shop/invoices/${invoice.id}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
            if (invRes.ok) {
              const invJson = (await invRes.json()) as InvoiceResponse;
              setInvoice(invJson.data);
            }
            setVoidDialogOpen(false);
          } catch {
            setErrorKey("errors.internal");
          } finally {
            setVoiding(false);
          }
        }}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        title={t("app.shop.invoice.delete.title")}
        description={t("app.shop.invoice.delete.desc")}
        confirmLabel={t("app.shop.invoice.action.deleteDraft")}
        cancelLabel={t("common.button.cancel")}
        confirmTone="danger"
        busy={deleting}
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={async () => {
          if (!tenantId || !invoice) return;
          setDeleting(true);
          setErrorKey(null);
          try {
            const res = await apiFetch(`/api/shop/invoices/${invoice.id}`, { method: "DELETE", headers: { "X-Tenant-Id": tenantId } });
            const json = (await res.json()) as { error?: { message_key?: string } };
            if (!res.ok) {
              setErrorKey(json.error?.message_key ?? "errors.internal");
              return;
            }
            router.replace(`/t/${props.tenantSlug}/shop/orders`);
          } catch {
            setErrorKey("errors.internal");
          } finally {
            setDeleting(false);
            setDeleteDialogOpen(false);
          }
        }}
      />

      <Modal open={refundDialogOpen} onClose={() => setRefundDialogOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">{t("app.shop.invoice.refund.title")}</div>
              <div className="mt-2 text-sm text-gray-700">{t("app.shop.invoice.refund.subtitle")}</div>
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setRefundDialogOpen(false)}
            >
              {t("common.button.close")}
            </button>
          </div>

          <label className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-gray-900">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              checked={refundRestockOnRefund}
              onChange={(e) => setRefundRestockOnRefund(e.target.checked)}
            />
            {t("app.shop.invoice.refund.restockOnRefund")}
          </label>
          <div className="mt-2 text-xs text-gray-600">{t("app.shop.invoice.refund.restockOnRefund.hint")}</div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-gray-200">
            <table className="min-w-[620px] w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.shop.invoice.refund.table.product")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{t("app.shop.invoice.refund.table.max")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{t("app.shop.invoice.refund.table.qty")}</th>
                </tr>
              </thead>
              <tbody>
                {refundLines.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-gray-600" colSpan={3}>
                      {t("app.shop.invoice.refund.empty")}
                    </td>
                  </tr>
                ) : (
                  refundLines.map((l) => (
                    <tr key={l.productId}>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{l.name}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-700">{l.maxQty}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right">
                        <input
                          className="h-10 w-28 rounded-xl border border-gray-200 px-3 text-sm text-right"
                          value={l.qty}
                          onChange={(e) => setRefundLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, qty: e.target.value } : x)))}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-col gap-3 md:flex-row md:justify-end">
            <button
              type="button"
              disabled={creatingRefund}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setRefundDialogOpen(false)}
            >
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              disabled={creatingRefund || refundLines.length === 0}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              onClick={async () => {
                if (!tenantId || !invoice) return;
                setCreatingRefund(true);
                setErrorKey(null);
                try {
                  const linesPayload = refundLines
                    .map((l) => ({ productId: l.productId, quantity: l.qty.trim() }))
                    .filter((l) => l.quantity && Number(l.quantity) > 0);
                  const res = await apiFetch(`/api/shop/invoices/${invoice.id}/refund-draft`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                    body: JSON.stringify({ restockOnRefund: refundRestockOnRefund, lines: linesPayload })
                  });
                  const json = (await res.json()) as { data?: { id: string }; error?: { message_key?: string } };
                  if (!res.ok || !json.data?.id) {
                    setErrorKey(json.error?.message_key ?? "errors.internal");
                    return;
                  }
                  setRefundDialogOpen(false);
                  router.push(`/t/${props.tenantSlug}/shop/orders/${json.data.id}`);
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setCreatingRefund(false);
                }
              }}
            >
              {creatingRefund ? t("app.shop.products.action.working") : t("app.shop.invoice.refund.action.create")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">
                {invoice?.kind === "refund" ? t("app.shop.invoice.refundPayments.modal.title") : t("app.shop.invoice.payments.modal.title")}
              </div>
              <div className="mt-2 text-sm text-gray-700">
                {invoice?.kind === "refund" ? t("app.shop.invoice.refundPayments.modal.subtitle") : t("app.shop.invoice.payments.modal.subtitle")}
              </div>
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setPaymentModalOpen(false)}
            >
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.invoice.payments.field.method")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                list="payment-methods"
                value={paymentMethodName}
                onChange={(e) => {
                  setPaymentMethodName(e.target.value);
                  setShowAddPaymentMethod(true);
                }}
              />
              <datalist id="payment-methods">
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.name} />
                ))}
              </datalist>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  onClick={async () => {
                    if (!tenantId || !paymentModalOpen) return;
                    try {
                      const res = await apiFetch("/api/shop/payment-methods", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
                      if (!res.ok) return;
                      const json = (await res.json()) as PaymentMethodsResponse;
                      setPaymentMethods(json.data ?? []);
                    } catch {}
                  }}
                >
                  {t("app.shop.invoice.payments.method.refresh")}
                </button>

                {showAddPaymentMethod && paymentMethodName.trim().length >= 2 ? (
                  <button
                    type="button"
                    disabled={!tenantId || creatingPaymentMethod || paymentMethods.some((m) => m.name.toLowerCase() === paymentMethodName.trim().toLowerCase())}
                    className="inline-flex h-9 items-center rounded-xl bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                    onClick={async () => {
                      if (!tenantId) return;
                      setCreatingPaymentMethod(true);
                      setErrorKey(null);
                      try {
                        const res = await apiFetch("/api/shop/payment-methods", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                          body: JSON.stringify({ name: paymentMethodName.trim() })
                        });
                        const json = (await res.json()) as { data?: PaymentMethod; error?: { message_key?: string } };
                        if (!res.ok || !json.data) {
                          setErrorKey(json.error?.message_key ?? "errors.internal");
                          return;
                        }
                        setPaymentMethods((prev) => [...prev, json.data!].sort((a, b) => a.name.localeCompare(b.name)));
                        setShowAddPaymentMethod(false);
                      } catch {
                        setErrorKey("errors.internal");
                      } finally {
                        setCreatingPaymentMethod(false);
                      }
                    }}
                  >
                    {creatingPaymentMethod ? t("app.shop.products.action.working") : t("app.shop.invoice.payments.method.add")}
                  </button>
                ) : null}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.invoice.payments.field.amount")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="text-gray-600">
                  {t("app.shop.invoice.payments.balance")}: <span className="font-medium text-gray-900">{formatMoney(paymentOutstanding, currencyCode)}</span>
                </div>
                <button
                  type="button"
                  className="inline-flex h-8 items-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-900 hover:bg-gray-50"
                  onClick={() => setPaymentAmount(paymentOutstanding)}
                >
                  {invoice?.kind === "refund" ? t("app.shop.invoice.refundPayments.payFull") : t("app.shop.invoice.payments.payFull")}
                </button>
              </div>
              {paymentExceedsBalance ? <div className="mt-2 text-xs text-red-700">{t("errors.paymentExceedsBalance")}</div> : null}
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.invoice.payments.field.note")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder={t("app.shop.invoice.payments.field.note.placeholder")}
              />
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 md:flex-row md:justify-end">
            <button
              type="button"
              disabled={addingPayment}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setPaymentModalOpen(false)}
            >
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              disabled={addingPayment || !paymentMethodName.trim() || !paymentAmount.trim() || paymentExceedsBalance || paymentOutstandingNumber <= 0}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              onClick={async () => {
                if (!tenantId || !invoice) return;
                if (paymentExceedsBalance || paymentOutstandingNumber <= 0) {
                  setErrorKey(paymentOutstandingNumber <= 0 ? "errors.invoiceFullyPaid" : "errors.paymentExceedsBalance");
                  return;
                }
                setAddingPayment(true);
                setErrorKey(null);
                try {
                  const res = await apiFetch(`/api/shop/invoices/${invoice.id}/payments`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                    body: JSON.stringify({ method: paymentMethodName.trim(), amount: paymentAmount, note: paymentNote.trim() || undefined })
                  });
                  const json = (await res.json()) as { error?: { message_key?: string } };
                  if (!res.ok) {
                    setErrorKey(json.error?.message_key ?? "errors.internal");
                    return;
                  }
                  const invRes = await apiFetch(`/api/shop/invoices/${invoice.id}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
                  if (invRes.ok) {
                    const invJson = (await invRes.json()) as InvoiceResponse;
                    setInvoice(invJson.data);
                  }
                  setPaymentModalOpen(false);
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setAddingPayment(false);
                }
              }}
            >
              {addingPayment
                ? t("app.shop.products.action.working")
                : invoice?.kind === "refund"
                  ? t("app.shop.invoice.refundPayments.modal.submit")
                  : t("app.shop.invoice.payments.modal.submit")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={scanModalOpen}
        onClose={() => {
          setScanModalOpen(false);
          setScanCandidates([]);
        }}
      >
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">{t("app.shop.invoice.scan.title")}</div>
              <div className="mt-2 text-sm text-gray-700">{t("app.shop.invoice.scan.multiple")}</div>
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setScanModalOpen(false)}
            >
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
            {scanCandidates.map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={!isDraft}
                className="flex w-full items-center justify-between gap-3 border-b border-gray-100 bg-white px-4 py-3 text-left text-sm hover:bg-gray-50 disabled:opacity-60"
                onClick={() => {
                  addProductToInvoice(p);
                  setScanCode("");
                  setScanCandidates([]);
                  setScanModalOpen(false);
                }}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-gray-900">{p.name}</div>
                  <div className="mt-1 text-xs text-gray-500">{p.sku ?? "—"}</div>
                </div>
                <div className="shrink-0 text-sm font-medium text-gray-900">{formatMoney(p.sellPrice, currencyCode)}</div>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <BarcodeScannerModal
        open={cameraScannerOpen}
        onClose={() => setCameraScannerOpen(false)}
        onDetected={(code) => {
          const v = code.trim();
          if (!v) return;
          setScanCode(v);
          void handleScanSubmit(v);
        }}
      />
    </div>
  );
}
