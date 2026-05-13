"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type Location = { id: string; name: string };
type LocationsResponse = { data: Location[] };

type PaymentMethod = { id: string; name: string; kind: "cash" | "card" | "bank" | "mobile" | "other" };
type PaymentMethodsResponse = { data: PaymentMethod[] };

type Supplier = { id: string; name: string };
type SuppliersResponse = { data: { items: Supplier[] } };

type ProductLite = { id: string; name: string; sku: string | null };
type ProductsResponse = { data: { items: ProductLite[] } };

type PurchaseLine = { id: string; product: ProductLite; quantity: string; receivedQty: string; unitCost: string; lineTotal: string };
type PurchasePayment = { id: string; direction: "in" | "out"; method: string; amount: string; note: string | null; createdAt: string; actor: { id: string; fullName: string | null } | null };

type PurchaseInvoiceResponse = {
  data: {
    id: string;
    kind: "purchase" | "refund";
    status: "draft" | "posted" | "void";
    purchaseNumber: string | null;
    refundOf: { id: string; purchaseNumber: string | null } | null;
    currencyCode: string;
    notes: string | null;
    subtotal: string;
    paidTotal: string;
    createdAt: string;
    postedAt: string | null;
    supplier: Supplier | null;
    location: Location;
    lines: PurchaseLine[];
    payments: PurchasePayment[];
  };
};

type ReceiveLineDraft = { lineId: string; qty: string; lotNumber: string; expiryDate: string };

export function PharmacyPurchaseInvoiceClient(props: { tenantSlug: string; purchaseId: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [invoice, setInvoice] = useState<PurchaseInvoiceResponse["data"] | null>(null);
  const isDraft = invoice?.status === "draft";
  const isRefund = invoice?.kind === "refund";

  const [locations, setLocations] = useState<Location[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const [locationId, setLocationId] = useState<string>("");
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [notes, setNotes] = useState("");

  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [voiding, setVoiding] = useState(false);

  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductLite[]>([]);
  const [productScannerOpen, setProductScannerOpen] = useState(false);

  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierResults, setSupplierResults] = useState<Supplier[]>([]);

  const [lines, setLines] = useState<Array<{ id: string; product: ProductLite; quantity: string; receivedQty: string; unitCost: string }>>([]);

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveDraft, setReceiveDraft] = useState<ReceiveLineDraft[]>([]);
  const [receiving, setReceiving] = useState(false);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [addingPayment, setAddingPayment] = useState(false);

  const currencyCode = invoice?.currencyCode ?? "USD";

  const totals = useMemo(() => {
    const subtotal = lines.reduce((acc, l) => acc + (Number(l.quantity || 0) * Number(l.unitCost || 0)), 0);
    return { subtotal };
  }, [lines]);

  useEffect(() => {
    let cancelled = false;
    async function loadTenant() {
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
      }
    }
    void loadTenant();
    return () => {
      cancelled = true;
    };
  }, [props.tenantSlug]);

  useEffect(() => {
    let cancelled = false;
    async function loadLists() {
      if (!tenantId) return;
      try {
        const [locRes, pmRes] = await Promise.all([
          apiFetch("/api/pharmacy/locations", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch("/api/pharmacy/payment-methods", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);
        if (locRes.ok) {
          const json = (await locRes.json()) as LocationsResponse;
          if (!cancelled) setLocations(json.data ?? []);
        }
        if (pmRes.ok) {
          const json = (await pmRes.json()) as PaymentMethodsResponse;
          if (!cancelled) {
            setPaymentMethods(json.data ?? []);
            const first = (json.data ?? [])[0]?.name ?? "Cash";
            setPaymentMethod(first);
          }
        }
      } catch {
        if (!cancelled) setErrorKey("errors.internal");
      }
    }
    void loadLists();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function loadInvoice() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const res = await apiFetch(`/api/pharmacy/purchases/${props.purchaseId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as PurchaseInvoiceResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const data = (json as PurchaseInvoiceResponse).data;
        if (!cancelled) {
          setInvoice(data);
          setLocationId(data.location.id);
          setSupplier(data.supplier);
          setNotes(data.notes ?? "");
          setLines(data.lines.map((l) => ({ id: l.id, product: l.product, quantity: l.quantity, receivedQty: l.receivedQty, unitCost: l.unitCost })));
        }
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadInvoice();
    return () => {
      cancelled = true;
    };
  }, [props.purchaseId, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const q = productQuery.trim();
    if (!q) {
      setProductResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        params.set("q", q);
        params.set("status", "active");
        params.set("page", "1");
        params.set("pageSize", "8");
        const res = await apiFetch(`/api/pharmacy/products?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as ProductsResponse;
        if (!cancelled) setProductResults(json.data.items ?? []);
      } catch {
        if (!cancelled) setErrorKey("errors.internal");
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [productQuery, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    const q = supplierQuery.trim();
    if (!q) {
      setSupplierResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        params.set("q", q);
        params.set("status", "active");
        params.set("page", "1");
        params.set("pageSize", "8");
        const res = await apiFetch(`/api/pharmacy/suppliers?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as SuppliersResponse;
        if (!cancelled) setSupplierResults(json.data.items ?? []);
      } catch {
        if (!cancelled) setErrorKey("errors.internal");
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [supplierQuery, tenantId]);

  async function save() {
    if (!tenantId) return;
    if (!isDraft) return;
    setSaving(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/pharmacy/purchases/${props.purchaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({
          locationId,
          supplierId: supplier?.id ?? null,
          notes: notes.trim() || null,
          lines: lines.map((l) => ({ productId: l.product.id, quantity: l.quantity || "0", unitCost: l.unitCost || "0" }))
        })
      });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      const reload = await apiFetch(`/api/pharmacy/purchases/${props.purchaseId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      if (reload.ok) {
        const next = (await reload.json()) as PurchaseInvoiceResponse;
        setInvoice(next.data);
        setLines(next.data.lines.map((l) => ({ id: l.id, product: l.product, quantity: l.quantity, receivedQty: l.receivedQty, unitCost: l.unitCost })));
      }
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  }

  async function post() {
    if (!tenantId) return;
    setPosting(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/pharmacy/purchases/${props.purchaseId}/post`, { method: "POST", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      window.location.reload();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setPosting(false);
    }
  }

  async function voidDraft() {
    if (!tenantId) return;
    setVoiding(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/pharmacy/purchases/${props.purchaseId}/void`, { method: "POST", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      window.location.reload();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setVoiding(false);
    }
  }

  function openReceive() {
    if (!invoice) return;
    const draft = invoice.lines
      .map((l) => {
        const remaining = Number(l.quantity) - Number(l.receivedQty);
        return remaining > 0 ? { lineId: l.id, qty: String(remaining), lotNumber: "", expiryDate: "" } : null;
      })
      .filter((x): x is ReceiveLineDraft => !!x);
    setReceiveDraft(draft);
    setReceiveOpen(true);
  }

  async function submitReceive() {
    if (!tenantId) return;
    setReceiving(true);
    setErrorKey(null);
    try {
      const payload = {
        lines: receiveDraft
          .filter((l) => Number(l.qty) > 0)
          .map((l) => ({ lineId: l.lineId, qty: l.qty, lotNumber: l.lotNumber, expiryDate: l.expiryDate }))
      };
      const res = await apiFetch(`/api/pharmacy/purchases/${props.purchaseId}/receive`, { method: "POST", headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId }, body: JSON.stringify(payload) });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setReceiveOpen(false);
      window.location.reload();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setReceiving(false);
    }
  }

  async function addPayment() {
    if (!tenantId || !invoice) return;
    const amount = paymentAmount.trim();
    if (!amount || Number(amount) <= 0) return;
    setAddingPayment(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/pharmacy/purchases/${props.purchaseId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({ method: paymentMethod, amount, note: paymentNote.trim() || undefined })
      });
      const json = (await res.json()) as { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setPaymentOpen(false);
      window.location.reload();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setAddingPayment(false);
    }
  }

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700 shadow-card">{t("common.loading")}</div>;
  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  if (!invoice) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700 shadow-card">{t("errors.notFound")}</div>;

  const balance = String(Number(invoice.subtotal) - Number(invoice.paidTotal));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link className="text-sm font-medium text-gray-600 hover:text-gray-900" href={`/t/${props.tenantSlug}/pharmacy/purchases`}>
                {t("app.pharmacy.purchases.back")}
              </Link>
              <div className="text-sm text-gray-500">/</div>
              <div className="truncate text-2xl font-semibold text-gray-900">
                {invoice.purchaseNumber ?? (invoice.kind === "refund" ? t("app.pharmacy.purchaseRefund.titleDraft") : t("app.pharmacy.purchase.titleDraft"))}
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-700">
              {t("app.pharmacy.purchase.meta.created")}: {new Date(invoice.createdAt).toLocaleString()}
              {invoice.postedAt ? ` · ${t("app.pharmacy.purchase.meta.posted")}: ${new Date(invoice.postedAt).toLocaleString()}` : ""}
              {invoice.refundOf?.purchaseNumber ? ` · ${t("app.pharmacy.purchaseRefund.refundOf")}: ${invoice.refundOf.purchaseNumber}` : ""}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {isDraft ? (
              <>
                <button type="button" disabled={saving} className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={save}>
                  {saving ? t("app.pharmacy.purchase.action.working") : t("app.pharmacy.purchase.action.save")}
                </button>
                <button type="button" disabled={voiding} className="inline-flex h-10 items-center justify-center rounded-xl border border-red-200 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60" onClick={voidDraft}>
                  {voiding ? t("app.pharmacy.purchase.action.working") : t("app.pharmacy.purchase.action.void")}
                </button>
                <button type="button" disabled={posting} className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60" onClick={post}>
                  {posting ? t("app.pharmacy.purchase.action.working") : t("app.pharmacy.purchase.action.post")}
                </button>
              </>
            ) : null}
            {invoice.status === "draft" && invoice.kind === "purchase" ? (
              <button type="button" disabled={receiving} className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={openReceive}>
                {t("app.pharmacy.purchase.action.receive")}
              </button>
            ) : null}
            {invoice.status === "posted" ? (
              <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setPaymentOpen(true)}>
                {isRefund ? t("app.pharmacy.purchaseRefund.action.receivePayment") : t("app.pharmacy.purchase.action.pay")}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card lg:col-span-2 md:p-6">
          <div className="text-lg font-semibold">{t("app.pharmacy.purchase.section.lines")}</div>
          {isDraft ? (
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.purchase.field.addProduct")}</label>
              <div className="mt-1 flex items-center gap-2">
                <input className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder={t("app.pharmacy.purchase.field.addProduct.placeholder")} />
                <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800" onClick={() => setProductScannerOpen(true)}>
                  {t("app.shop.products.scan.open")}
                </button>
              </div>
              {productResults.length ? (
                <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200">
                  {productResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="flex w-full items-start justify-between gap-4 border-b border-gray-100 px-4 py-3 text-left text-sm hover:bg-gray-50 last:border-b-0"
                      onClick={() => {
                        setProductQuery("");
                        setProductResults([]);
                        setLines((prev) => (prev.some((x) => x.product.id === p.id) ? prev : [...prev, { id: `new:${p.id}`, product: p, quantity: "1", receivedQty: "0", unitCost: "0" }]));
                      }}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-900">{p.name}</div>
                        <div className="mt-1 text-xs text-gray-500">{p.sku ?? "—"}</div>
                      </div>
                      <div className="shrink-0 text-xs text-gray-500">{t("app.pharmacy.purchase.action.select")}</div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[900px] w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.purchase.table.product")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.purchase.table.qty")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.purchase.table.received")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.purchase.table.unitCost")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.pharmacy.purchase.table.total")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.pharmacy.purchase.table.actions")}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {lines.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-gray-600" colSpan={6}>
                      {t("app.pharmacy.purchase.lines.empty")}
                    </td>
                  </tr>
                ) : (
                  lines.map((l) => (
                    <tr key={l.id}>
                      <td className="border-b border-gray-100 px-4 py-3">
                        <div className="font-medium text-gray-900">{l.product.name}</div>
                        <div className="mt-1 text-xs text-gray-500">{l.product.sku ?? "—"}</div>
                      </td>
                      <td className="border-b border-gray-100 px-4 py-3">
                        <input disabled={!isDraft} className="h-10 w-28 rounded-xl border border-gray-200 px-3 text-sm tabular disabled:opacity-60" value={l.quantity} onChange={(e) => setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, quantity: e.target.value } : x)))} />
                      </td>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-700 tabular">{l.receivedQty}</td>
                      <td className="border-b border-gray-100 px-4 py-3">
                        <input disabled={!isDraft} className="h-10 w-28 rounded-xl border border-gray-200 px-3 text-sm tabular disabled:opacity-60" value={l.unitCost} onChange={(e) => setLines((prev) => prev.map((x) => (x.id === l.id ? { ...x, unitCost: e.target.value } : x)))} />
                      </td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900 tabular">{formatMoney(String(Number(l.quantity || 0) * Number(l.unitCost || 0)), currencyCode)}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right">
                        {isDraft ? (
                          <button type="button" className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setLines((prev) => prev.filter((x) => x.id !== l.id))}>
                            {t("app.pharmacy.purchase.action.removeLine")}
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-gray-700">{t("app.pharmacy.purchase.summary.subtotal")}</div>
            <div className="text-lg font-semibold text-gray-900">{formatMoney(String(totals.subtotal.toFixed(2)), currencyCode)}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
          <div className="text-lg font-semibold">{t("app.pharmacy.purchase.section.details")}</div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.purchase.field.location")}</label>
            <select disabled={!isDraft} className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm disabled:opacity-60" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.purchase.field.supplier")}</label>
            {supplier ? (
              <div className="mt-1 flex items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-sm font-medium text-gray-900">{supplier.name}</div>
                {isDraft ? (
                  <button type="button" className="text-xs font-medium text-gray-600 hover:text-gray-900" onClick={() => setSupplier(null)}>
                    {t("app.pharmacy.purchase.action.clear")}
                  </button>
                ) : null}
              </div>
            ) : (
              <>
                <input disabled={!isDraft} className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm disabled:opacity-60" value={supplierQuery} onChange={(e) => setSupplierQuery(e.target.value)} placeholder={t("app.pharmacy.purchase.field.supplier.placeholder")} />
                {isDraft && supplierResults.length ? (
                  <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200">
                    {supplierResults.slice(0, 8).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className="flex w-full items-start justify-between gap-4 border-b border-gray-100 px-4 py-3 text-left text-sm hover:bg-gray-50 last:border-b-0"
                        onClick={() => {
                          setSupplier(s);
                          setSupplierQuery("");
                          setSupplierResults([]);
                        }}
                      >
                        <div className="min-w-0 truncate font-medium text-gray-900">{s.name}</div>
                        <div className="shrink-0 text-xs text-gray-500">{t("app.pharmacy.purchase.action.select")}</div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.purchase.field.notes")}</label>
            <textarea disabled={!isDraft} className="mt-1 min-h-[90px] w-full rounded-xl border border-gray-200 px-3 py-2 text-sm disabled:opacity-60" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("app.pharmacy.purchase.field.notes.placeholder")} />
          </div>

          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between text-sm">
              <div className="text-gray-700">{t("app.pharmacy.purchase.summary.total")}</div>
              <div className="font-semibold text-gray-900">{formatMoney(invoice.subtotal, currencyCode)}</div>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <div className="text-gray-700">{t("app.pharmacy.purchase.summary.paid")}</div>
              <div className="font-semibold text-gray-900">{formatMoney(invoice.paidTotal, currencyCode)}</div>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <div className="text-gray-700">{t("app.pharmacy.purchase.summary.balance")}</div>
              <div className="font-semibold text-gray-900">{formatMoney(balance, currencyCode)}</div>
            </div>
          </div>

          <div className="mt-6">
            <div className="text-lg font-semibold">{t("app.pharmacy.purchase.section.payments")}</div>
            <div className="mt-3 space-y-2">
              {invoice.payments.length === 0 ? <div className="text-sm text-gray-600">{t("app.pharmacy.purchase.payments.empty")}</div> : null}
              {invoice.payments.map((p) => (
                <div key={p.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                  <div className="flex items-center justify-between text-sm">
                    <div className="font-medium text-gray-900">{p.method}</div>
                    <div className="font-semibold text-gray-900">{formatMoney(p.amount, currencyCode)}</div>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {new Date(p.createdAt).toLocaleString()}
                    {p.note ? ` · ${p.note}` : ""}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Modal open={receiveOpen} onClose={() => setReceiveOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.pharmacy.purchase.receive.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.pharmacy.purchase.receive.subtitle")}</div>

          <div className="mt-6 space-y-4">
            {receiveDraft.map((r, idx) => {
              const line = invoice.lines.find((l) => l.id === r.lineId) ?? null;
              if (!line) return null;
              const remaining = Number(line.quantity) - Number(line.receivedQty);
              return (
                <div key={r.lineId} className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-sm font-semibold text-gray-900">{line.product.name}</div>
                  <div className="mt-1 text-xs text-gray-600">
                    {t("app.pharmacy.purchase.receive.remaining")}: <span className="tabular">{remaining.toFixed(3)}</span>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.purchase.receive.qty")}</label>
                      <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm tabular" value={r.qty} onChange={(e) => setReceiveDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, qty: e.target.value } : x)))} />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.purchase.receive.lotNumber")}</label>
                      <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={r.lotNumber} onChange={(e) => setReceiveDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, lotNumber: e.target.value } : x)))} placeholder={t("app.pharmacy.purchase.receive.lotNumber.placeholder")} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.purchase.receive.expiryDate")}</label>
                      <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={r.expiryDate} onChange={(e) => setReceiveDraft((prev) => prev.map((x, i) => (i === idx ? { ...x, expiryDate: e.target.value } : x)))} placeholder="YYYY-MM-DD" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setReceiveOpen(false)} disabled={receiving}>
              {t("common.button.cancel")}
            </button>
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60" onClick={submitReceive} disabled={receiving}>
              {receiving ? t("app.pharmacy.purchase.action.working") : t("app.pharmacy.purchase.receive.action")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={paymentOpen} onClose={() => setPaymentOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{isRefund ? t("app.pharmacy.purchaseRefund.payments.addTitle") : t("app.pharmacy.purchase.payments.addTitle")}</div>
          <div className="mt-2 text-sm text-gray-700">{isRefund ? t("app.pharmacy.purchaseRefund.payments.addSubtitle") : t("app.pharmacy.purchase.payments.addSubtitle")}</div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.pharmacy.purchase.payments.method")}</label>
              <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.pharmacy.purchase.payments.amount")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm tabular" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
              <div className="mt-2 text-xs text-gray-600">
                {t("app.pharmacy.purchase.payments.balance")}: <span className="font-medium text-gray-900">{formatMoney(balance, currencyCode)}</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.pharmacy.purchase.payments.note")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder={t("app.pharmacy.purchase.payments.note.placeholder")} />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setPaymentOpen(false)} disabled={addingPayment}>
              {t("common.button.cancel")}
            </button>
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60" onClick={addPayment} disabled={addingPayment}>
              {addingPayment ? t("app.pharmacy.purchase.action.working") : t("common.button.submit")}
            </button>
          </div>
        </div>
      </Modal>

      <BarcodeScannerModal
        open={productScannerOpen}
        onClose={() => setProductScannerOpen(false)}
        onDetected={(code: string) => {
          const v = code.trim();
          if (!v) return;
          setProductQuery(v);
        }}
      />
    </div>
  );
}
