"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type Location = { id: string; name: string };
type LocationsResponse = { data: Location[] };

type Supplier = { id: string; name: string };
type SuppliersResponse = { data: { items: Supplier[] } };

type Product = { id: string; name: string; sku: string | null; unit: { id: string; name: string; symbol: string | null } | null; sellPrice: string; costPrice: string | null };
type ProductsResponse = { data: { items: Product[] } };

type PurchaseLine = {
  id: string;
  product: { id: string; name: string; sku: string | null; unit: { id: string; name: string; symbol: string | null } | null };
  quantity: string;
  receivedQty: string;
  unitCost: string;
  lineTotal: string;
};

type PurchaseResponse = {
  data: {
    id: string;
    kind: "purchase" | "refund";
    status: "draft" | "posted" | "void";
    purchaseNumber: string | null;
    refundOf: { id: string; purchaseNumber: string | null } | null;
    supplier: Supplier | null;
    location: Location;
    currencyCode: string;
    notes: string | null;
    subtotal: string;
    paidTotal: string;
    createdAt: string;
    postedAt: string | null;
    lines: PurchaseLine[];
    payments: { id: string; direction: "in" | "out"; method: string; amount: string; note: string | null; createdAt: string }[];
  };
};

type PaymentMethod = { id: string; name: string; kind: "cash" | "card" | "bank" | "mobile" | "other" };
type PaymentMethodsResponse = { data: PaymentMethod[] };

type DraftLine = {
  lineId: string;
  productId: string;
  name: string;
  sku: string | null;
  unit: { id: string; name: string; symbol: string | null } | null;
  quantity: string;
  unitCost: string;
  receivedQty: string;
};

function toMoneyString(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

export function PurchaseInvoiceClient(props: { tenantSlug: string; purchaseId: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [invoice, setInvoice] = useState<PurchaseResponse["data"] | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);

  const [locationId, setLocationId] = useState("");
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierMatches, setSupplierMatches] = useState<Supplier[]>([]);

  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);

  const [productQuery, setProductQuery] = useState("");
  const [productMatches, setProductMatches] = useState<Product[]>([]);

  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [receiving, setReceiving] = useState(false);

  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveMap, setReceiveMap] = useState<Record<string, string>>({});
  const [receiveLotMap, setReceiveLotMap] = useState<Record<string, string>>({});
  const [receiveExpiryMap, setReceiveExpiryMap] = useState<Record<string, string>>({});

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethodName, setPaymentMethodName] = useState("Cash");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [addingPayment, setAddingPayment] = useState(false);

  const isDraft = invoice?.status === "draft";
  const isRefund = invoice?.kind === "refund";

  const subtotal = useMemo(() => {
    let total = 0;
    for (const l of lines) {
      const qty = Number(l.quantity);
      const cost = Number(l.unitCost);
      if (!Number.isFinite(qty) || !Number.isFinite(cost) || qty <= 0 || cost < 0) continue;
      total += qty * cost;
    }
    return toMoneyString(total);
  }, [lines]);

  const canEditLines = useMemo(() => {
    if (!isDraft) return false;
    if (isRefund) return true;
    return lines.every((l) => Number(l.receivedQty || "0") <= 0);
  }, [isDraft, isRefund, lines]);

  const fullyReceived = useMemo(() => {
    if (isRefund) return true;
    if (!lines.length) return false;
    for (const l of lines) {
      const qty = Number(l.quantity || "0");
      const recv = Number(l.receivedQty || "0");
      if (!Number.isFinite(qty) || !Number.isFinite(recv)) return false;
      if (recv + 1e-9 < qty) return false;
    }
    return true;
  }, [isRefund, lines]);

  const paidTotal = Number(invoice?.paidTotal ?? "0");
  const balance = Math.max(0, Number(invoice?.subtotal ?? subtotal) - paidTotal).toFixed(2);

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
        const [locRes, payRes, invRes] = await Promise.all([
          apiFetch("/api/shop/locations", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch("/api/shop/payment-methods", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/purchases/${props.purchaseId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);
        const invJson = (await invRes.json()) as PurchaseResponse | { error?: { message_key?: string } };
        if (!locRes.ok || !invRes.ok) {
          setErrorKey((invJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const locJson = (await locRes.json()) as LocationsResponse;
        const payJson = payRes.ok ? ((await payRes.json()) as PaymentMethodsResponse) : null;
        if (!cancelled) {
          setLocations(locJson.data ?? []);
          if (payJson?.data) setPaymentMethods(payJson.data);
          const inv = (invJson as PurchaseResponse).data;
          setInvoice(inv);
          setLocationId(inv.location.id);
          setSupplier(inv.supplier);
          setNotes(inv.notes ?? "");
          setLines(
            inv.lines.map((l) => ({
              lineId: l.id,
              productId: l.product.id,
              name: l.product.name,
              sku: l.product.sku,
              unit: l.product.unit,
              quantity: l.quantity,
              unitCost: l.unitCost,
              receivedQty: l.receivedQty
            }))
          );
          setPaymentMethodName(payJson?.data?.[0]?.name ?? "Cash");
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
  }, [props.purchaseId, tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function searchSuppliers() {
      if (!tenantId) return;
      if (!supplierQuery.trim()) {
        setSupplierMatches([]);
        return;
      }
      try {
        const p = new URLSearchParams();
        p.set("q", supplierQuery.trim());
        p.set("status", "active");
        p.set("page", "1");
        p.set("pageSize", "10");
        const res = await apiFetch(`/api/shop/suppliers?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as SuppliersResponse;
        if (!cancelled) setSupplierMatches(json.data.items ?? []);
      } catch {}
    }
    const h = setTimeout(searchSuppliers, 250);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [supplierQuery, tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function searchProducts() {
      if (!tenantId) return;
      if (!productQuery.trim()) {
        setProductMatches([]);
        return;
      }
      try {
        const p = new URLSearchParams();
        p.set("q", productQuery.trim());
        const res = await apiFetch(`/api/shop/products?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as ProductsResponse;
        if (!cancelled) setProductMatches(json.data.items ?? []);
      } catch {}
    }
    const h = setTimeout(searchProducts, 250);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [productQuery, tenantId]);

  async function refresh() {
    if (!tenantId) return;
    const invRes = await apiFetch(`/api/shop/purchases/${props.purchaseId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
    const invJson = (await invRes.json()) as PurchaseResponse | { error?: { message_key?: string } };
    if (!invRes.ok) {
      setErrorKey((invJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
      return;
    }
    const inv = (invJson as PurchaseResponse).data;
    setInvoice(inv);
    setLocationId(inv.location.id);
    setSupplier(inv.supplier);
    setNotes(inv.notes ?? "");
    setLines(
      inv.lines.map((l) => ({
        lineId: l.id,
        productId: l.product.id,
        name: l.product.name,
        sku: l.product.sku,
        unit: l.product.unit,
        quantity: l.quantity,
        unitCost: l.unitCost,
        receivedQty: l.receivedQty
      }))
    );
  }

  async function saveDraft() {
    if (!tenantId || !invoice) return;
    setSaving(true);
    setErrorKey(null);
    try {
      const payload = {
        locationId,
        supplierId: supplier?.id ?? null,
        notes: notes.trim() ? notes.trim() : null,
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost }))
      };
      const res = await apiFetch(`/api/shop/purchases/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { data?: unknown; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      await refresh();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  }

  function addProduct(p: Product) {
    setLines((prev) => {
      const existing = prev.find((x) => x.productId === p.id) ?? null;
      if (existing) return prev;
      return [
        {
          lineId: `new-${p.id}`,
          productId: p.id,
          name: p.name,
          sku: p.sku,
          unit: p.unit,
          quantity: "1",
          unitCost: p.costPrice ?? "0.00",
          receivedQty: "0"
        },
        ...prev
      ];
    });
  }

  function makePrintKey(): string {
    try {
      return crypto.randomUUID();
    } catch {
      return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  }

  async function openPrintLabelsFromReceived(payloadLines: Array<{ lineId: string; qty: string }>) {
    if (!tenantId) return;
    const rows = payloadLines
      .map((pl) => {
        const line = lines.find((l) => l.lineId === pl.lineId) ?? null;
        if (!line) return null;
        const qty = Number(pl.qty);
        if (!Number.isFinite(qty) || qty <= 0) return null;
        return { productId: line.productId, qty: Math.min(999, Math.max(1, Math.ceil(qty))) };
      })
      .filter((x): x is { productId: string; qty: number } => Boolean(x));
    if (!rows.length) return;

    try {
      const settingsRes = await apiFetch("/api/shop/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const settingsJson = (await settingsRes.json()) as { data?: { sellCurrencyCode?: string } };
      const sellCurrencyCode = settingsJson.data?.sellCurrencyCode ?? "USD";

      const productResponses = await Promise.all(
        rows.map(async (r) => {
          const res = await apiFetch(`/api/shop/products/${r.productId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
          const json = (await res.json()) as { data?: { id: string; name: string; sku: string | null; unit: { symbol: string | null } | null; sellPrice: string; barcodes: string[] } };
          if (!res.ok || !json.data) return null;
          return { ...json.data, qty: r.qty };
        })
      );

      const items = productResponses
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => ({
          productId: p.id,
          name: p.name,
          sku: p.sku,
          unitSymbol: p.unit?.symbol ?? null,
          sellPrice: p.sellPrice,
          barcode: p.barcodes?.[0] ?? p.sku ?? null,
          qty: p.qty
        }));
      if (!items.length) return;

      const payload = { templateId: "40x30" as const, currencyCode: sellCurrencyCode, items };
      const key = makePrintKey();
      localStorage.setItem(`labelsPrint:${key}`, JSON.stringify(payload));
      window.open(`/t/${props.tenantSlug}/shop/labels/print?key=${encodeURIComponent(key)}`, "_blank", "noopener,noreferrer");
    } catch {}
  }

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700">{t("common.loading")}</div>;
  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  if (!invoice) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700">{t("errors.notFound")}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link className="text-sm font-medium text-gray-600 hover:text-gray-900" href={`/t/${props.tenantSlug}/shop/purchases`}>
                {t("app.shop.purchases.back")}
              </Link>
              <div className="text-sm text-gray-500">/</div>
              <div className="truncate text-2xl font-semibold text-gray-900">
                {invoice.purchaseNumber ?? (invoice.kind === "refund" ? t("app.shop.purchaseRefund.titleDraft") : t("app.shop.purchase.titleDraft"))}
              </div>
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-700">{t(`app.shop.purchases.kind.${invoice.kind}`)}</span>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700">{t(`app.shop.purchases.status.${invoice.status}`)}</span>
            </div>
            <div className="mt-2 text-sm text-gray-700">
              {t("app.shop.purchase.meta.created")}: {new Date(invoice.createdAt).toLocaleString()}
              {invoice.postedAt ? ` · ${t("app.shop.purchase.meta.posted")}: ${new Date(invoice.postedAt).toLocaleString()}` : ""}
              {invoice.refundOf?.purchaseNumber ? ` · ${t("app.shop.purchaseRefund.refundOf")}: ${invoice.refundOf.purchaseNumber}` : ""}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/shop/purchases/${invoice.id}/print?paper=thermal80`} target="_blank" rel="noreferrer">
              {t("app.shop.purchase.action.print")}
            </Link>
            {invoice.status === "draft" ? (
              <>
                <button
                  type="button"
                  disabled={posting || (invoice.kind === "purchase" ? !fullyReceived : lines.length === 0)}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                  onClick={async () => {
                    if (!tenantId) return;
                    setPosting(true);
                    setErrorKey(null);
                    try {
                      const res = await apiFetch(`/api/shop/purchases/${invoice.id}/post`, { method: "POST", headers: { "X-Tenant-Id": tenantId } });
                      const json = (await res.json()) as { error?: { message_key?: string } };
                      if (!res.ok) {
                        setErrorKey(json.error?.message_key ?? "errors.internal");
                        return;
                      }
                      await refresh();
                    } catch {
                      setErrorKey("errors.internal");
                    } finally {
                      setPosting(false);
                    }
                  }}
                >
                  {posting ? t("app.shop.purchase.action.working") : t("app.shop.purchase.action.post")}
                </button>
                {invoice.kind === "purchase" ? (
                  <button
                    type="button"
                    disabled={!lines.length || receiving}
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                    onClick={() => {
                      const map: Record<string, string> = {};
                      const lotMap: Record<string, string> = {};
                      const expMap: Record<string, string> = {};
                      for (const l of lines) {
                        const remaining = Math.max(0, Number(l.quantity) - Number(l.receivedQty)).toFixed(3);
                        map[l.lineId] = remaining === "0.000" ? "0" : remaining;
                        lotMap[l.lineId] = "";
                        expMap[l.lineId] = "";
                      }
                      setReceiveMap(map);
                      setReceiveLotMap(lotMap);
                      setReceiveExpiryMap(expMap);
                      setReceiveModalOpen(true);
                    }}
                  >
                    {t("app.shop.purchase.action.receive")}
                  </button>
                ) : null}
              </>
            ) : invoice.status === "posted" ? (
              <>
                {invoice.kind === "purchase" ? (
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                    disabled={!tenantId}
                    onClick={async () => {
                      if (!tenantId) return;
                      setErrorKey(null);
                      try {
                        const res = await apiFetch(`/api/shop/purchases/${invoice.id}/refund-draft`, { method: "POST", headers: { "X-Tenant-Id": tenantId } });
                        const json = (await res.json()) as { data?: { id: string }; error?: { message_key?: string } };
                        if (!res.ok || !json.data?.id) {
                          setErrorKey(json.error?.message_key ?? "errors.internal");
                          return;
                        }
                        window.location.href = `/t/${props.tenantSlug}/shop/purchases/${json.data.id}`;
                      } catch {
                        setErrorKey("errors.internal");
                      }
                    }}
                  >
                    {t("app.shop.purchaseRefund.action.create")}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={Number(balance) <= 0}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                  onClick={() => {
                    setPaymentAmount(balance);
                    setPaymentNote("");
                    setPaymentModalOpen(true);
                  }}
                >
                  {invoice.kind === "refund" ? t("app.shop.purchaseRefund.action.receivePayment") : t("app.shop.purchase.action.pay")}
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="text-lg font-semibold">{t("app.shop.purchase.section.lines")}</div>
              {invoice.status === "draft" ? (
                <div className="w-full md:w-96">
                  <label className="block text-xs font-medium text-gray-700">{t("app.shop.purchase.field.addProduct")}</label>
                  <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder={t("app.shop.purchase.field.addProduct.placeholder")} />
                  {productMatches.length ? (
                    <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white">
                      {productMatches.slice(0, 6).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
                          onClick={() => {
                            addProduct(p);
                            setProductQuery("");
                            setProductMatches([]);
                          }}
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-gray-900">{p.name}</div>
                            <div className="mt-0.5 text-xs text-gray-500">{p.sku ?? "—"}</div>
                          </div>
                          <div className="shrink-0 text-xs text-gray-600">{p.unit?.symbol ?? ""}</div>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-[980px] w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.purchase.table.product")}</th>
                    <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.purchase.table.qty")}</th>
                    <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.purchase.table.received")}</th>
                    <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.purchase.table.unitCost")}</th>
                    <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.purchase.table.total")}</th>
                    <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.purchase.table.actions")}</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {lines.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-gray-600" colSpan={6}>
                        {t("app.shop.purchase.lines.empty")}
                      </td>
                    </tr>
                  ) : (
                    lines.map((l) => {
                      const lineTotal = toMoneyString(Math.max(0, Number(l.quantity || "0") * Number(l.unitCost || "0")));
                      const remaining = Math.max(0, Number(l.quantity || "0") - Number(l.receivedQty || "0"));
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
                              disabled={!canEditLines}
                              className="h-10 w-24 rounded-xl border border-gray-200 px-3 text-sm disabled:opacity-60"
                              value={l.quantity}
                              onChange={(e) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, quantity: e.target.value } : x)))}
                            />
                          </td>
                          <td className="border-b border-gray-100 px-4 py-3 text-gray-900 tabular">
                            {Number(l.receivedQty || "0").toFixed(3)}
                            {remaining > 0 ? <span className="ml-2 text-xs text-gray-500">({t("app.shop.purchase.table.remaining")}: {remaining.toFixed(3)})</span> : null}
                          </td>
                          <td className="border-b border-gray-100 px-4 py-3">
                            <input
                              disabled={!canEditLines}
                              className="h-10 w-28 rounded-xl border border-gray-200 px-3 text-sm disabled:opacity-60"
                              value={l.unitCost}
                              onChange={(e) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, unitCost: e.target.value } : x)))}
                            />
                          </td>
                          <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900 tabular">{formatMoney(lineTotal, invoice.currencyCode)}</td>
                          <td className="border-b border-gray-100 px-4 py-3 text-right">
                            <button
                              type="button"
                              disabled={!canEditLines}
                              className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                              onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))}
                            >
                              {t("app.shop.purchase.action.removeLine")}
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
                  <div className="text-gray-700">{t("app.shop.purchase.summary.subtotal")}</div>
                  <div className="text-lg font-semibold text-gray-900 tabular">{formatMoney(isDraft ? subtotal : invoice.subtotal, invoice.currencyCode)}</div>
                </div>
              </div>
            </div>

            {invoice.status === "draft" ? (
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" disabled={!tenantId || saving} className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60" onClick={saveDraft}>
                  {saving ? t("app.shop.purchase.action.working") : t("app.shop.purchase.action.save")}
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
            <div className="text-lg font-semibold">{t("app.shop.purchase.section.details")}</div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.shop.purchase.field.location")}</label>
                <select
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm"
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  disabled={!isDraft || isRefund}
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.shop.purchase.field.supplier")}</label>
                {isDraft && !isRefund ? (
                  <>
                    <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={supplierQuery} onChange={(e) => setSupplierQuery(e.target.value)} placeholder={t("app.shop.purchase.field.supplier.placeholder")} />
                    {supplierMatches.length ? (
                      <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white">
                        {supplierMatches.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
                            onClick={() => {
                              setSupplier(s);
                              setSupplierQuery("");
                              setSupplierMatches([]);
                            }}
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium text-gray-900">{s.name}</div>
                            </div>
                            <div className="shrink-0 text-xs text-gray-500">{t("app.shop.purchase.action.select")}</div>
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {supplier ? (
                      <div className="mt-2 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
                        <div className="font-medium text-gray-900">{supplier.name}</div>
                        <button type="button" className="text-xs font-medium text-gray-700 hover:text-gray-900" onClick={() => setSupplier(null)}>
                          {t("app.shop.purchase.action.clear")}
                        </button>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-900">{invoice.supplier?.name ?? "—"}</div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.shop.purchase.field.notes")}</label>
                <textarea disabled={!isDraft} className="mt-1 min-h-[90px] w-full rounded-xl border border-gray-200 px-3 py-2 text-sm disabled:opacity-60" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("app.shop.purchase.field.notes.placeholder")} />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
            <div className="text-lg font-semibold">{t("app.shop.purchase.section.payments")}</div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="text-gray-700">{t("app.shop.purchase.summary.total")}</div>
                <div className="font-semibold text-gray-900 tabular">{formatMoney(invoice.subtotal, invoice.currencyCode)}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-gray-700">{t("app.shop.purchase.summary.paid")}</div>
                <div className="font-semibold text-gray-900 tabular">{formatMoney(invoice.paidTotal, invoice.currencyCode)}</div>
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 pt-3">
                <div className="text-gray-700">{t("app.shop.purchase.summary.balance")}</div>
                <div className="text-lg font-semibold text-gray-900 tabular">{formatMoney(balance, invoice.currencyCode)}</div>
              </div>
            </div>

            {invoice.payments.length ? (
              <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-900">
                  {isRefund ? t("app.shop.purchaseRefund.payments.title") : t("app.shop.purchase.payments.title")}
                </div>
                <div className="divide-y divide-gray-100">
                  {invoice.payments.map((p) => (
                    <div key={p.id} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900">{p.method}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          {new Date(p.createdAt).toLocaleString()}
                          {` • ${t(p.direction === "in" ? "app.shop.purchaseRefund.payments.direction.in" : "app.shop.purchaseRefund.payments.direction.out")}`}
                          {p.note?.trim() ? ` • ${p.note.trim()}` : ""}
                        </div>
                      </div>
                      <div className="shrink-0 text-right font-semibold text-gray-900 tabular">{formatMoney(p.amount, invoice.currencyCode)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <Modal open={receiveModalOpen} onClose={() => setReceiveModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.shop.purchase.receive.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.shop.purchase.receive.subtitle")}</div>

          <div className="mt-6 space-y-3">
            {lines.map((l) => {
              const remaining = Math.max(0, Number(l.quantity || "0") - Number(l.receivedQty || "0"));
              return (
                <div key={l.lineId} className="rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">{l.name}</div>
                      <div className="mt-1 text-xs text-gray-500">
                        {t("app.shop.purchase.receive.remaining")}: <span className="tabular">{remaining.toFixed(3)}</span>
                      </div>
                    </div>
                    <div className="w-36">
                      <input
                        className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm"
                        value={receiveMap[l.lineId] ?? "0"}
                        onChange={(e) => setReceiveMap((prev) => ({ ...prev, [l.lineId]: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700">{t("app.shop.purchase.receive.lotNumber")}</label>
                      <input
                        className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
                        value={receiveLotMap[l.lineId] ?? ""}
                        onChange={(e) => setReceiveLotMap((prev) => ({ ...prev, [l.lineId]: e.target.value }))}
                        placeholder={t("app.shop.purchase.receive.lotNumber.placeholder")}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700">{t("app.shop.purchase.receive.expiryDate")}</label>
                      <input
                        type="date"
                        className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
                        value={receiveExpiryMap[l.lineId] ?? ""}
                        onChange={(e) => setReceiveExpiryMap((prev) => ({ ...prev, [l.lineId]: e.target.value }))}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 flex flex-col gap-3 md:flex-row md:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setReceiveModalOpen(false)} disabled={receiving}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              disabled={receiving || !tenantId}
              onClick={async () => {
                if (!tenantId) return;
                const payloadLines = Object.entries(receiveMap)
                  .map(([lineId, qty]) => ({
                    lineId,
                    qty: qty.trim() || "0",
                    lotNumber: (receiveLotMap[lineId] ?? "").trim() || undefined,
                    expiryDate: (receiveExpiryMap[lineId] ?? "").trim() || undefined
                  }))
                  .filter((x) => Number(x.qty) > 0);
                if (!payloadLines.length) {
                  setReceiveModalOpen(false);
                  return;
                }
                setReceiving(true);
                setErrorKey(null);
                try {
                  const res = await apiFetch(`/api/shop/purchases/${invoice.id}/receive`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                    body: JSON.stringify({ lines: payloadLines })
                  });
                  const json = (await res.json()) as { error?: { message_key?: string } };
                  if (!res.ok) {
                    setErrorKey(json.error?.message_key ?? "errors.internal");
                    return;
                  }
                  setReceiveModalOpen(false);
                  await refresh();
                  await openPrintLabelsFromReceived(payloadLines);
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setReceiving(false);
                }
              }}
            >
              {receiving ? t("app.shop.purchase.action.working") : t("app.shop.purchase.receive.printLabels")}
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={receiving || !tenantId}
              onClick={async () => {
                if (!tenantId) return;
                const payloadLines = Object.entries(receiveMap)
                  .map(([lineId, qty]) => ({
                    lineId,
                    qty: qty.trim() || "0",
                    lotNumber: (receiveLotMap[lineId] ?? "").trim() || undefined,
                    expiryDate: (receiveExpiryMap[lineId] ?? "").trim() || undefined
                  }))
                  .filter((x) => Number(x.qty) > 0);
                if (!payloadLines.length) {
                  setReceiveModalOpen(false);
                  return;
                }
                setReceiving(true);
                setErrorKey(null);
                try {
                  const res = await apiFetch(`/api/shop/purchases/${invoice.id}/receive`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                    body: JSON.stringify({ lines: payloadLines })
                  });
                  const json = (await res.json()) as { error?: { message_key?: string } };
                  if (!res.ok) {
                    setErrorKey(json.error?.message_key ?? "errors.internal");
                    return;
                  }
                  setReceiveModalOpen(false);
                  await refresh();
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setReceiving(false);
                }
              }}
            >
              {receiving ? t("app.shop.purchase.action.working") : t("app.shop.purchase.receive.action")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={paymentModalOpen} onClose={() => setPaymentModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{isRefund ? t("app.shop.purchaseRefund.payments.addTitle") : t("app.shop.purchase.payments.addTitle")}</div>
          <div className="mt-2 text-sm text-gray-700">{isRefund ? t("app.shop.purchaseRefund.payments.addSubtitle") : t("app.shop.purchase.payments.addSubtitle")}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.purchase.payments.method")}</label>
              <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={paymentMethodName} onChange={(e) => setPaymentMethodName(e.target.value)}>
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.purchase.payments.amount")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={paymentAmount} onChange={(e) => setPaymentAmount(e.target.value)} />
              <div className="mt-2 text-xs text-gray-600">
                {t("app.shop.purchase.payments.balance")}: <span className="font-medium text-gray-900">{formatMoney(balance, invoice.currencyCode)}</span>
              </div>
              <button type="button" className="mt-2 inline-flex h-8 items-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-900 hover:bg-gray-50" onClick={() => setPaymentAmount(balance)}>
                {t("app.shop.purchase.payments.payFull")}
              </button>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-900">{t("app.shop.purchase.payments.note")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder={t("app.shop.purchase.payments.note.placeholder")} />
            </div>
          </div>

          <div className="mt-8 flex flex-col gap-3 md:flex-row md:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setPaymentModalOpen(false)} disabled={addingPayment}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={addingPayment || !tenantId || !paymentMethodName.trim() || !paymentAmount.trim() || Number(balance) <= 0 || Number(paymentAmount) > Number(balance) + 1e-9}
              onClick={async () => {
                if (!tenantId) return;
                setAddingPayment(true);
                setErrorKey(null);
                try {
                  const res = await apiFetch(`/api/shop/purchases/${invoice.id}/payments`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                    body: JSON.stringify({ method: paymentMethodName, amount: paymentAmount.trim(), note: paymentNote.trim() || undefined })
                  });
                  const json = (await res.json()) as { error?: { message_key?: string } };
                  if (!res.ok) {
                    setErrorKey(json.error?.message_key ?? "errors.internal");
                    return;
                  }
                  setPaymentModalOpen(false);
                  await refresh();
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setAddingPayment(false);
                }
              }}
            >
              {addingPayment ? t("app.shop.purchase.action.working") : t("common.button.submit")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
