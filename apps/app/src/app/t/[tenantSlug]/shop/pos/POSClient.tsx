"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
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

type LocationsResponse = { data: Location[] };
type CustomersResponse = { data: { items: { id: string; name: string }[] } };

type ShopSettingsResponse = { data: { sellCurrencyCode: string; taxEnabled: boolean; taxRate: string; cashRoundingIncrement: string } };

type ProductsResponse = {
  data: {
    items: { id: string; name: string; sku: string | null; sellPrice: string; unit: { id: string; name: string; symbol: string | null } | null; barcodes: string[] }[];
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

type CreateInvoiceResponse = { data: { id: string } };

function toMoneyString(n: number): string {
  if (!Number.isFinite(n)) return "0.00";
  return n.toFixed(2);
}

export function POSClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const router = useRouter();

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState<string>("");

  const [sellCurrencyCode, setSellCurrencyCode] = useState("USD");
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState("0");
  const [cashRoundingIncrement, setCashRoundingIncrement] = useState("0");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentMethodName, setPaymentMethodName] = useState("Cash");
  const [invoiceDiscountAmount, setInvoiceDiscountAmount] = useState("0");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);

  const [lines, setLines] = useState<DraftLine[]>([]);

  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductsResponse["data"]["items"]>([]);
  const [productLoading, setProductLoading] = useState(false);

  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const suppressCameraAutoOpenRef = useRef(false);
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanCandidates, setScanCandidates] = useState<Array<{ product: ProductsResponse["data"]["items"][number]; multiplier: string; packagingLabel: string | null }>>([]);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [posting, setPosting] = useState(false);

  function roundToIncrementAmount(amount: number, increment: number): number {
    if (!Number.isFinite(amount) || !Number.isFinite(increment) || increment <= 0) return amount;
    const amountCents = Math.round(amount * 100);
    const incCents = Math.round(increment * 100);
    if (incCents <= 0) return amount;
    const q = amountCents / incCents;
    const rq = Math.round(q);
    return Number(((rq * incCents) / 100).toFixed(2));
  }

  const totals = useMemo(() => {
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
      const discRaw = Number(l.discountAmount || "0");
      const disc = Number.isFinite(discRaw) ? clamp(discRaw, 0, lineTotal) : 0;
      grossSubtotal += lineTotal;
      lineDiscountTotal += disc;
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
      grossSubtotal: toMoneyString(grossSubtotal),
      discountTotal: toMoneyString(discountTotal),
      taxTotal: toMoneyString(taxTotal),
      total: toMoneyString(total)
    };
  }, [lines, invoiceDiscountAmount, taxEnabled, taxRate]);

  const selectedMethodKind = paymentMethods.find((m) => m.name === paymentMethodName)?.kind ?? null;
  const totalNumber = useMemo(() => Number(totals.total), [totals.total]);
  const roundingIncNumber = useMemo(() => Number(cashRoundingIncrement || "0"), [cashRoundingIncrement]);
  const roundedTotalNumber = useMemo(() => {
    if (selectedMethodKind === "cash" && Number.isFinite(roundingIncNumber) && roundingIncNumber > 0) {
      return roundToIncrementAmount(totalNumber, roundingIncNumber);
    }
    return totalNumber;
  }, [selectedMethodKind, totalNumber, roundingIncNumber]);
  const payableTotal = useMemo(() => toMoneyString(roundedTotalNumber), [roundedTotalNumber]);
  const roundingAdjustment = useMemo(() => toMoneyString(roundedTotalNumber - totalNumber), [roundedTotalNumber, totalNumber]);

  const payNumber = useMemo(() => {
    const n = Number(payAmount);
    return Number.isFinite(n) ? n : 0;
  }, [payAmount]);
  const changeDue = useMemo(() => Math.max(0, payNumber - roundedTotalNumber), [payNumber, roundedTotalNumber]);
  const outstanding = useMemo(() => Math.max(0, roundedTotalNumber - payNumber), [payNumber, roundedTotalNumber]);

  useEffect(() => {
    setPayAmount(payableTotal);
  }, [payableTotal]);

  function focusScanner() {
    try {
      scanInputRef.current?.focus();
    } catch {}
  }

  function clearSale() {
    setLines([]);
    setCustomer(null);
    setCustomerQuery("");
    setCustomerResults([]);
    setProductQuery("");
    setProductResults([]);
    setScanError(null);
    setCheckoutOpen(false);
    setPayAmount("0.00");
    setTimeout(() => focusScanner(), 50);
  }

  function addProductToCart(p: ProductsResponse["data"]["items"][number], multiplier?: string) {
    const addQty = Number(multiplier ?? "1");
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === p.id) ?? null;
      if (!existing) {
        return [{ productId: p.id, name: p.name, sku: p.sku, unit: p.unit, quantity: String(addQty || 1), unitPrice: p.sellPrice, discountAmount: "0" }, ...prev];
      }
      return prev.map((l) => (l.productId === p.id ? { ...l, quantity: String(Number(l.quantity || "0") + (addQty || 1)) } : l));
    });
  }

  async function resolveCode(codeRaw: string) {
    const code = codeRaw.trim();
    if (!tenantId) return;
    if (!code) return;
    setLastScannedCode(code);
    setScanError(null);
    setScanCandidates([]);
    try {
      const resolveParams = new URLSearchParams();
      resolveParams.set("code", code);
      const resolveRes = await apiFetch(`/api/shop/pos/resolve?${resolveParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      if (resolveRes.ok) {
        const resolveJson = (await resolveRes.json()) as { data: { items: Array<{ product: ProductsResponse["data"]["items"][number]; multiplier: string; packagingLabel: string | null }> } };
        const resolved = resolveJson.data.items ?? [];
        if (resolved.length === 1) {
          addProductToCart(resolved[0].product, resolved[0].multiplier);
          setProductQuery("");
          setProductResults([]);
          focusScanner();
          return;
        }
        if (resolved.length > 1) {
          setScanCandidates(resolved);
          setScanModalOpen(true);
          return;
        }
      }

      const p = new URLSearchParams();
      p.set("q", code);
      p.set("page", "1");
      p.set("pageSize", "10");
      const res = await apiFetch(`/api/shop/products?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      if (!res.ok) {
        setScanError("errors.internal");
        return;
      }
      const json = (await res.json()) as ProductsResponse;
      const items = json.data.items ?? [];
      const exact = items.filter((i) => i.sku === code || i.barcodes.includes(code));
      if (exact.length === 1) {
        addProductToCart(exact[0], "1");
        setProductQuery("");
        setProductResults([]);
        focusScanner();
        return;
      }
      if (exact.length > 1) {
        setScanCandidates(exact.map((x) => ({ product: x, multiplier: "1", packagingLabel: null })));
        setScanModalOpen(true);
        return;
      }
      if (items.length === 1) {
        addProductToCart(items[0], "1");
        setProductQuery("");
        setProductResults([]);
        focusScanner();
        return;
      }
      if (items.length > 1) {
        setScanCandidates(items.map((x) => ({ product: x, multiplier: "1", packagingLabel: null })));
        setScanModalOpen(true);
        return;
      }
      setScanError("app.shop.pos.scan.notFound");
    } catch {
      setScanError("errors.internal");
    }
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
    async function loadConfig() {
      if (!tenantId) return;
      try {
        const [locRes, settingsRes, methodsRes] = await Promise.all([
          apiFetch("/api/shop/locations", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch("/api/shop/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch("/api/shop/payment-methods", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);

        if (locRes.ok) {
          const locJson = (await locRes.json()) as LocationsResponse;
          const next = locJson.data ?? [];
          if (!cancelled) {
            setLocations(next);
            setLocationId((prev) => prev || next[0]?.id || "");
          }
        }
        if (settingsRes.ok) {
          const settingsJson = (await settingsRes.json()) as ShopSettingsResponse;
          if (!cancelled) {
            setSellCurrencyCode(settingsJson.data.sellCurrencyCode ?? "USD");
            setTaxEnabled(Boolean(settingsJson.data.taxEnabled));
            setTaxRate(settingsJson.data.taxRate ?? "0");
            setCashRoundingIncrement(settingsJson.data.cashRoundingIncrement ?? "0");
          }
        }
        if (methodsRes.ok) {
          const methodsJson = (await methodsRes.json()) as PaymentMethodsResponse;
          const next = methodsJson.data ?? [];
          if (!cancelled) {
            setPaymentMethods(next);
            if (next.length) setPaymentMethodName(next[0].name);
          }
        }
      } catch {}
    }
    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    if (!productQuery.trim()) {
      setProductResults([]);
      return;
    }
    let cancelled = false;
    setProductLoading(true);
    const timer = setTimeout(async () => {
      try {
        const p = new URLSearchParams();
        p.set("q", productQuery.trim());
        p.set("page", "1");
        p.set("pageSize", "8");
        const res = await apiFetch(`/api/shop/products?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as ProductsResponse;
        if (!cancelled) setProductResults(json.data.items ?? []);
      } finally {
        if (!cancelled) setProductLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tenantId, productQuery]);

  useEffect(() => {
    if (!tenantId) return;
    if (!customerQuery.trim()) {
      setCustomerResults([]);
      return;
    }
    let cancelled = false;
    setCustomerLoading(true);
    const timer = setTimeout(async () => {
      try {
        const p = new URLSearchParams();
        p.set("q", customerQuery.trim());
        p.set("page", "1");
        p.set("pageSize", "8");
        const res = await apiFetch(`/api/shop/customers?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as CustomersResponse;
        if (!cancelled) setCustomerResults((json.data.items ?? []).map((c) => ({ id: c.id, name: c.name })));
      } finally {
        if (!cancelled) setCustomerLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [tenantId, customerQuery]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        focusScanner();
      }
      if (e.key === "F4") {
        e.preventDefault();
        setCheckoutOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  async function checkout() {
    if (!tenantId) return;
    if (!locationId) {
      setErrorKey("app.shop.pos.error.locationRequired");
      return;
    }
    if (lines.length === 0) {
      setErrorKey("app.shop.pos.error.emptyCart");
      return;
    }

    setPosting(true);
    setErrorKey(null);
    try {
      const createRes = await apiFetch("/api/shop/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({ locationId, customerId: customer?.id })
      });
      const createJson = (await createRes.json()) as CreateInvoiceResponse | { error?: { message_key?: string } };
      if (!createRes.ok) {
        setErrorKey((createJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const invoiceId = (createJson as CreateInvoiceResponse).data.id;

      const updateRes = await apiFetch(`/api/shop/invoices/${invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({
          locationId,
          customerId: customer?.id ?? null,
          lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity || "0", unitPrice: l.unitPrice || "0", discountAmount: l.discountAmount || "0" })),
          invoiceDiscountAmount
        })
      });
      const updateJson = (await updateRes.json()) as { data?: unknown; error?: { message_key?: string } };
      if (!updateRes.ok) {
        setErrorKey(updateJson.error?.message_key ?? "errors.internal");
        return;
      }

      const postRes = await apiFetch(`/api/shop/invoices/${invoiceId}/post`, { method: "POST", headers: { "X-Tenant-Id": tenantId } });
      const postJson = (await postRes.json()) as { data?: unknown; error?: { message_key?: string } };
      if (!postRes.ok) {
        setErrorKey(postJson.error?.message_key ?? "errors.internal");
        return;
      }

      const pay = Number(payAmount);
      const recordAmount = Math.min(Math.max(0, pay), roundedTotalNumber);
      if (Number.isFinite(recordAmount) && recordAmount > 0) {
        const payRes = await apiFetch(`/api/shop/invoices/${invoiceId}/payments`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
          body: JSON.stringify({ method: paymentMethodName, amount: toMoneyString(recordAmount) })
        });
        const payJson = (await payRes.json()) as { data?: unknown; error?: { message_key?: string } };
        if (!payRes.ok) {
          setErrorKey(payJson.error?.message_key ?? "errors.internal");
          return;
        }
      }

      const printUrl = `/t/${props.tenantSlug}/shop/orders/${invoiceId}/print?paper=thermal80`;
      window.open(printUrl, "_blank", "noopener,noreferrer");
      clearSale();
      setCheckoutOpen(false);
      router.refresh();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setPosting(false);
    }
  }

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">{t("app.shop.pos.loading")}</div>;
  }
  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 md:p-6">{t(errorKey)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.shop.pos.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.shop.pos.subtitle")}</div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/shop`}>
              {t("common.button.back")}
            </Link>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => {
                clearSale();
              }}
            >
              {t("app.shop.pos.action.clear")}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.pos.field.location")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">{t("app.shop.pos.location.placeholder")}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.pos.field.customer")}</label>
            <div className="mt-1 flex gap-2">
              <input
                className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm"
                value={customerQuery}
                placeholder={customer ? customer.name : t("app.shop.pos.customer.placeholder")}
                onChange={(e) => {
                  setCustomer(null);
                  setCustomerQuery(e.target.value);
                }}
              />
              {customer ? (
                <button
                  type="button"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  onClick={() => {
                    setCustomer(null);
                    setCustomerQuery("");
                    setCustomerResults([]);
                  }}
                >
                  {t("common.button.close")}
                </button>
              ) : null}
            </div>
            {customerLoading ? <div className="mt-2 text-xs text-gray-500">Searching…</div> : null}
            {!customer && customerResults.length ? (
              <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200">
                {customerResults.slice(0, 8).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className="flex w-full items-center justify-between border-b border-gray-100 px-4 py-3 text-left text-sm hover:bg-gray-50 last:border-b-0"
                    onClick={() => {
                      setCustomer(c);
                      setCustomerQuery("");
                      setCustomerResults([]);
                    }}
                  >
                    <span className="font-medium text-gray-900">{c.name}</span>
                    <span className="text-xs text-gray-500">{t("app.shop.pos.action.select")}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.pos.field.scan")}</label>
            <input
              ref={scanInputRef}
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm"
              inputMode="none"
              autoCapitalize="none"
              autoCorrect="off"
              placeholder={t("app.shop.pos.scan.placeholder")}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void resolveCode((e.target as HTMLInputElement).value);
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
            {scanError ? (
              <div className="mt-2 space-y-2">
                <div className="text-xs text-red-600">{t(scanError)}</div>
                {scanError === "app.shop.pos.scan.notFound" && lastScannedCode ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-900 hover:bg-gray-50"
                      href={`/t/${props.tenantSlug}/shop/products?newBarcode=${encodeURIComponent(lastScannedCode)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("app.shop.pos.scan.createProduct")}
                    </Link>
                    <div className="text-xs text-gray-500">{t("app.shop.pos.scan.createProduct.hint")}</div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => {
                setCameraScannerOpen(true);
              }}
            >
              {t("app.shop.pos.action.cameraScan")}
            </button>
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-xs font-medium text-gray-700">{t("app.shop.pos.field.search")}</label>
          <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder={t("app.shop.pos.search.placeholder")} />
          {productLoading ? <div className="mt-2 text-xs text-gray-500">Searching…</div> : null}
          {productResults.length ? (
            <div className="mt-2 overflow-hidden rounded-2xl border border-gray-200">
              {productResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-start justify-between gap-4 border-b border-gray-100 px-4 py-3 text-left text-sm hover:bg-gray-50 last:border-b-0"
                  onClick={() => addProductToCart(p)}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-900">{p.name}</div>
                    <div className="mt-1 truncate text-xs text-gray-500">{p.sku ?? "—"}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-semibold text-gray-900">{formatMoney(p.sellPrice, sellCurrencyCode)}</div>
                    <div className="mt-1 text-xs text-gray-500">{t("app.shop.pos.action.add")}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold">{t("app.shop.pos.cart.title")}</div>
            <div className="text-sm text-gray-700">
              {t("app.shop.pos.cart.items")}: <span className="font-semibold text-gray-900">{lines.length}</span>
            </div>
          </div>

          {lines.length === 0 ? (
            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-600">{t("app.shop.pos.cart.empty")}</div>
          ) : (
            <div className="mt-4 space-y-3">
              {lines.map((l) => (
                <div key={l.productId} className="rounded-2xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-gray-900">{l.name}</div>
                      <div className="mt-1 text-xs text-gray-600">
                        {l.sku ?? "—"}
                        {l.unit ? ` · ${l.unit.name}${l.unit.symbol ? ` (${l.unit.symbol})` : ""}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-semibold text-gray-900">
                      {formatMoney(
                        toMoneyString(Math.max(0, Number(l.quantity) * Number(l.unitPrice) - Math.min(Number(l.discountAmount || "0"), Number(l.quantity) * Number(l.unitPrice)))),
                        sellCurrencyCode
                      )}
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
                        onClick={() =>
                          setLines((prev) =>
                            prev
                              .map((x) => (x.productId === l.productId ? { ...x, quantity: String(Math.max(0, Number(x.quantity || "0") - 1)) } : x))
                              .filter((x) => Number(x.quantity || "0") > 0)
                          )
                        }
                      >
                        −
                      </button>
                      <input
                        className="h-10 w-20 rounded-xl border border-gray-200 px-3 text-sm"
                        value={l.quantity}
                        onChange={(e) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, quantity: e.target.value } : x)))}
                      />
                      <button
                        type="button"
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
                        onClick={() => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, quantity: String(Number(x.quantity || "0") + 1) } : x)))}
                      >
                        +
                      </button>
                    </div>
                    <div>
                      <input
                        className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
                        value={l.unitPrice}
                        onChange={(e) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, unitPrice: e.target.value } : x)))}
                      />
                    </div>
                    <div>
                      <input
                        className="h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
                        value={l.discountAmount}
                        onChange={(e) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, discountAmount: e.target.value } : x)))}
                        placeholder={t("app.shop.pos.checkout.discount")}
                      />
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                      onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))}
                    >
                      {t("app.shop.pos.action.remove")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
          <div className="text-lg font-semibold">{t("app.shop.pos.checkout.title")}</div>
          <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between text-sm">
              <div className="text-gray-700">{t("app.shop.pos.checkout.subtotal")}</div>
              <div className="font-semibold text-gray-900">{formatMoney(totals.grossSubtotal, sellCurrencyCode)}</div>
            </div>
            {Number(totals.discountTotal) > 0 ? (
              <div className="mt-2 flex items-center justify-between text-sm">
                <div className="text-gray-700">{t("app.shop.pos.checkout.discount")}</div>
                <div className="font-semibold text-gray-900">-{formatMoney(totals.discountTotal, sellCurrencyCode)}</div>
              </div>
            ) : null}
            {taxEnabled && Number(totals.taxTotal) > 0 ? (
              <div className="mt-2 flex items-center justify-between text-sm">
                <div className="text-gray-700">
                  {t("app.shop.pos.checkout.tax")} ({taxRate}%)
                </div>
                <div className="font-semibold text-gray-900">{formatMoney(totals.taxTotal, sellCurrencyCode)}</div>
              </div>
            ) : null}
            {selectedMethodKind === "cash" && Number(roundingAdjustment) !== 0 ? (
              <div className="mt-2 flex items-center justify-between text-sm">
                <div className="text-gray-700">{t("app.shop.pos.checkout.rounding")}</div>
                <div className="font-semibold text-gray-900">{formatMoney(roundingAdjustment, sellCurrencyCode)}</div>
              </div>
            ) : null}
            <div className="mt-2 flex items-center justify-between text-sm">
              <div className="text-gray-700">{t("app.shop.pos.checkout.total")}</div>
              <div className="font-semibold text-gray-900">{formatMoney(payableTotal, sellCurrencyCode)}</div>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.pos.checkout.discount")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={invoiceDiscountAmount} onChange={(e) => setInvoiceDiscountAmount(e.target.value)} />
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.pos.checkout.method")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={paymentMethodName} onChange={(e) => setPaymentMethodName(e.target.value)}>
              {paymentMethods.map((m) => (
                <option key={m.id} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.pos.checkout.payAmount")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
          </div>
          <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            {changeDue > 0 ? (
              <div className="flex items-center justify-between text-sm">
                <div className="text-gray-700">{t("app.shop.pos.checkout.changeDue")}</div>
                <div className="font-semibold text-gray-900">{formatMoney(toMoneyString(changeDue), sellCurrencyCode)}</div>
              </div>
            ) : (
              <div className="flex items-center justify-between text-sm">
                <div className="text-gray-700">{t("app.shop.pos.checkout.outstanding")}</div>
                <div className="font-semibold text-gray-900">{formatMoney(toMoneyString(outstanding), sellCurrencyCode)}</div>
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={posting || lines.length === 0}
            className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
            onClick={() => setCheckoutOpen(true)}
          >
            {t("app.shop.pos.action.checkout")}
          </button>
          <div className="mt-3 text-xs text-gray-500">
            {t("app.shop.pos.hint.shortcuts")} <span className="font-medium text-gray-700">F2</span>, <span className="font-medium text-gray-700">F4</span>
          </div>
        </div>
      </div>

      <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.shop.pos.checkout.confirmTitle")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.shop.pos.checkout.confirmDesc")}</div>
          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between text-sm">
              <div className="text-gray-700">{t("app.shop.pos.checkout.subtotal")}</div>
              <div className="font-semibold text-gray-900">{formatMoney(totals.grossSubtotal, sellCurrencyCode)}</div>
            </div>
            {Number(totals.discountTotal) > 0 ? (
              <div className="mt-2 flex items-center justify-between text-sm">
                <div className="text-gray-700">{t("app.shop.pos.checkout.discount")}</div>
                <div className="font-semibold text-gray-900">-{formatMoney(totals.discountTotal, sellCurrencyCode)}</div>
              </div>
            ) : null}
            {taxEnabled && Number(totals.taxTotal) > 0 ? (
              <div className="mt-2 flex items-center justify-between text-sm">
                <div className="text-gray-700">
                  {t("app.shop.pos.checkout.tax")} ({taxRate}%)
                </div>
                <div className="font-semibold text-gray-900">{formatMoney(totals.taxTotal, sellCurrencyCode)}</div>
              </div>
            ) : null}
            {selectedMethodKind === "cash" && Number(roundingAdjustment) !== 0 ? (
              <div className="mt-2 flex items-center justify-between text-sm">
                <div className="text-gray-700">{t("app.shop.pos.checkout.rounding")}</div>
                <div className="font-semibold text-gray-900">{formatMoney(roundingAdjustment, sellCurrencyCode)}</div>
              </div>
            ) : null}
            <div className="mt-2 flex items-center justify-between text-sm">
              <div className="text-gray-700">{t("app.shop.pos.checkout.total")}</div>
              <div className="font-semibold text-gray-900">{formatMoney(payableTotal, sellCurrencyCode)}</div>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <div className="text-gray-700">{t("app.shop.pos.checkout.method")}</div>
              <div className="font-semibold text-gray-900">{paymentMethodName}</div>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <div className="text-gray-700">{t("app.shop.pos.checkout.payAmount")}</div>
              <div className="font-semibold text-gray-900">{formatMoney(payAmount, sellCurrencyCode)}</div>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <div className="text-gray-700">{changeDue > 0 ? t("app.shop.pos.checkout.changeDue") : t("app.shop.pos.checkout.outstanding")}</div>
              <div className="font-semibold text-gray-900">
                {changeDue > 0 ? formatMoney(toMoneyString(changeDue), sellCurrencyCode) : formatMoney(toMoneyString(outstanding), sellCurrencyCode)}
              </div>
            </div>
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => setCheckoutOpen(false)}
              disabled={posting}
            >
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              onClick={() => void checkout()}
              disabled={posting}
            >
              {posting ? t("app.shop.products.action.working") : t("app.shop.pos.action.complete")}
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
              <div className="text-xl font-semibold">{t("app.shop.pos.scan.title")}</div>
              <div className="mt-2 text-sm text-gray-700">{t("app.shop.pos.scan.multiple")}</div>
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => {
                setScanModalOpen(false);
                setScanCandidates([]);
                focusScanner();
              }}
            >
              {t("common.button.close")}
            </button>
          </div>
          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
            {scanCandidates.map((c) => (
              <button
                key={`${c.product.id}:${c.multiplier}:${c.packagingLabel ?? ""}`}
                type="button"
                className="flex w-full items-start justify-between gap-4 border-b border-gray-100 px-4 py-3 text-left text-sm hover:bg-gray-50 last:border-b-0"
                onClick={() => {
                  addProductToCart(c.product, c.multiplier);
                  setScanModalOpen(false);
                  setScanCandidates([]);
                  focusScanner();
                }}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-gray-900">{c.product.name}</div>
                  <div className="mt-1 truncate text-xs text-gray-500">
                    {c.product.sku ?? "—"}
                    {c.packagingLabel ? ` · ${c.packagingLabel} ×${c.multiplier}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs font-semibold text-gray-900">{formatMoney(c.product.sellPrice, sellCurrencyCode)}</div>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <BarcodeScannerModal
        open={cameraScannerOpen}
        onClose={() => setCameraScannerOpen(false)}
        onDetected={(code) => {
          suppressCameraAutoOpenRef.current = true;
          setTimeout(() => {
            suppressCameraAutoOpenRef.current = false;
          }, 800);
          setCameraScannerOpen(false);
          void resolveCode(code);
        }}
      />
    </div>
  );
}

