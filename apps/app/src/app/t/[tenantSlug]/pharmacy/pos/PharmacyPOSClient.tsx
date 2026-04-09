"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { formatMoney } from "@/lib/currency-catalog";
import { Modal } from "@/components/Modal";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type Location = { id: string; name: string };
type LocationsResponse = { data: Location[] };

type SettingsResponse = { data: { sellCurrencyCode: string; taxEnabled: boolean; taxRate: string; cashRoundingIncrement: string } };

type ProductLite = { id: string; name: string; sku: string | null; sellPrice: string; unit: { id: string; name: string; symbol: string | null } | null; barcodes: string[] };
type ProductsResponse = { data: { items: ProductLite[] } };

type PaymentMethod = { id: string; name: string; kind: "cash" | "card" | "bank" | "mobile" | "other" };
type PaymentMethodsResponse = { data: PaymentMethod[] };

type Customer = { id: string; name: string; phone?: string | null; email?: string | null };
type CustomersResponse = { data: { items: Customer[] } };
type CreateCustomerResponse = { data: { id: string; name: string; phone: string | null; email: string | null } };

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

export function PharmacyPOSClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const router = useRouter();

  const scanInputRef = useRef<HTMLInputElement | null>(null);
  const suppressCameraAutoOpenRef = useRef(false);

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loadingTenant, setLoadingTenant] = useState(true);

  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [sellCurrencyCode, setSellCurrencyCode] = useState("USD");
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState("0");
  const [cashRoundingIncrement, setCashRoundingIncrement] = useState("0");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentMethodName, setPaymentMethodName] = useState("Cash");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<Customer[]>([]);
  const [customerLoading, setCustomerLoading] = useState(false);
  const [createCustomerOpen, setCreateCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [invoiceDiscountAmount, setInvoiceDiscountAmount] = useState("0.00");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("0.00");
  const [posting, setPosting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<ProductLite[]>([]);

  const [scanCandidates, setScanCandidates] = useState<Array<{ product: ProductLite; multiplier: string; packagingLabel: string | null }>>([]);
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);

  const grossSubtotal = useMemo(() => {
    const total = lines.reduce((acc, l) => acc + Number(l.quantity || "0") * Number(l.unitPrice || "0"), 0);
    return Number.isFinite(total) ? total : 0;
  }, [lines]);

  const lineDiscountTotal = useMemo(() => {
    const total = lines.reduce((acc, l) => acc + Number(l.discountAmount || "0"), 0);
    return Number.isFinite(total) ? total : 0;
  }, [lines]);

  const invoiceDiscount = useMemo(() => {
    const n = Number(invoiceDiscountAmount || "0");
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }, [invoiceDiscountAmount]);

  const discountedSubtotal = useMemo(() => {
    const net = Math.max(0, grossSubtotal - lineDiscountTotal);
    return Math.max(0, net - Math.min(invoiceDiscount, net));
  }, [grossSubtotal, invoiceDiscount, lineDiscountTotal]);

  const taxTotal = useMemo(() => {
    if (!taxEnabled) return 0;
    const rate = Number(taxRate || "0");
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return (discountedSubtotal * rate) / 100;
  }, [discountedSubtotal, taxEnabled, taxRate]);

  const totalNumber = useMemo(() => discountedSubtotal + taxTotal, [discountedSubtotal, taxTotal]);

  const roundedTotalNumber = useMemo(() => {
    const inc = Number(cashRoundingIncrement || "0");
    if (!Number.isFinite(inc) || inc <= 0) return totalNumber;
    const q = totalNumber / inc;
    const roundedQ = Math.round(q);
    const rounded = roundedQ * inc;
    return Number.isFinite(rounded) ? Number(rounded.toFixed(2)) : totalNumber;
  }, [cashRoundingIncrement, totalNumber]);

  const outstanding = useMemo(() => {
    const pay = Number(payAmount || "0");
    if (!Number.isFinite(pay)) return roundedTotalNumber;
    return Math.max(0, roundedTotalNumber - Math.max(0, pay));
  }, [payAmount, roundedTotalNumber]);

  const changeDue = useMemo(() => {
    const pay = Number(payAmount || "0");
    if (!Number.isFinite(pay)) return 0;
    return Math.max(0, pay - roundedTotalNumber);
  }, [payAmount, roundedTotalNumber]);

  function focusScanner() {
    try {
      scanInputRef.current?.focus();
    } catch {}
  }

  function clearSale() {
    setLines([]);
    setProductQuery("");
    setProductResults([]);
    setCustomer(null);
    setCustomerQuery("");
    setCustomerResults([]);
    setScanError(null);
    setCheckoutOpen(false);
    setPayAmount("0.00");
    setTimeout(() => focusScanner(), 50);
  }

  function addProductToCart(p: ProductLite, multiplier?: string) {
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
      const resolveRes = await apiFetch(`/api/pharmacy/pos/resolve?${resolveParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      if (resolveRes.ok) {
        const resolveJson = (await resolveRes.json()) as { data: { items: Array<{ product: ProductLite; multiplier: string; packagingLabel: string | null }> } };
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
      const res = await apiFetch(`/api/pharmacy/products?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as ProductsResponse;
      if (!res.ok) {
        setScanError("errors.internal");
        return;
      }
      const items = json.data.items ?? [];
      const exact = items.filter((x) => x.sku === code || x.barcodes.includes(code));
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
      setScanError("app.pharmacy.pos.scan.notFound");
    } catch {
      setScanError("errors.internal");
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadTenantId() {
      setLoadingTenant(true);
      try {
        const meRes = await apiFetch("/api/me", { cache: "no-store" });
        const me = (await meRes.json()) as MeResponse;
        if (!meRes.ok) return;
        const membership = me.data.memberships.find((m) => m.tenantSlug === props.tenantSlug) ?? null;
        if (!membership) return;
        if (!cancelled) setTenantId(membership.tenantId);
      } finally {
        if (!cancelled) setLoadingTenant(false);
      }
    }
    void loadTenantId();
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
          apiFetch("/api/pharmacy/locations", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch("/api/pharmacy/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch("/api/pharmacy/payment-methods", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
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
          const settingsJson = (await settingsRes.json()) as SettingsResponse;
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
    const query = productQuery.trim();
    if (!query) {
      setProductResults([]);
      return;
    }
    const headerTenantId = tenantId;
    let cancelled = false;
    async function search() {
      try {
        const p = new URLSearchParams();
        p.set("q", query);
        p.set("page", "1");
        p.set("pageSize", "8");
        const res = await apiFetch(`/api/pharmacy/products?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": headerTenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as ProductsResponse;
        if (!cancelled) setProductResults(json.data.items ?? []);
      } catch {}
    }
    const id = window.setTimeout(search, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
    };
  }, [productQuery, tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    if (!customerQuery.trim()) {
      setCustomerResults([]);
      return;
    }
    const headerTenantId = tenantId;
    let cancelled = false;
    setCustomerLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const p = new URLSearchParams();
        p.set("q", customerQuery.trim());
        p.set("page", "1");
        p.set("pageSize", "8");
        const res = await apiFetch(`/api/pharmacy/customers?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": headerTenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as CustomersResponse;
        if (!cancelled) setCustomerResults((json.data.items ?? []).map((c) => ({ id: c.id, name: c.name })));
      } finally {
        if (!cancelled) setCustomerLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customerQuery, tenantId]);

  async function submitCreateCustomer() {
    if (!tenantId) return;
    const name = newCustomerName.trim();
    if (name.length < 2) return;
    setPosting(true);
    try {
      const res = await apiFetch("/api/pharmacy/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({ name, phone: newCustomerPhone.trim() || undefined, email: newCustomerEmail.trim() || undefined })
      });
      const json = (await res.json()) as CreateCustomerResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const created = (json as CreateCustomerResponse).data;
      setCustomer({ id: created.id, name: created.name, phone: created.phone, email: created.email });
      setCustomerQuery("");
      setCustomerResults([]);
      setCreateCustomerOpen(false);
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerEmail("");
    } finally {
      setPosting(false);
    }
  }

  async function checkout() {
    if (!tenantId) return;
    if (!locationId) {
      setErrorKey("app.pharmacy.pos.error.locationRequired");
      return;
    }
    if (lines.length === 0) {
      setErrorKey("app.pharmacy.pos.error.emptyCart");
      return;
    }

    setPosting(true);
    setErrorKey(null);
    try {
      const createRes = await apiFetch("/api/pharmacy/invoices", {
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

      const updateRes = await apiFetch(`/api/pharmacy/invoices/${invoiceId}`, {
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

      const postRes = await apiFetch(`/api/pharmacy/invoices/${invoiceId}/post`, { method: "POST", headers: { "X-Tenant-Id": tenantId } });
      const postJson = (await postRes.json()) as { data?: unknown; error?: { message_key?: string } };
      if (!postRes.ok) {
        setErrorKey(postJson.error?.message_key ?? "errors.internal");
        return;
      }

      const pay = Number(payAmount);
      const recordAmount = Math.min(Math.max(0, pay), roundedTotalNumber);
      if (Number.isFinite(recordAmount) && recordAmount > 0) {
        const payRes = await apiFetch(`/api/pharmacy/invoices/${invoiceId}/payments`, {
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

      const printUrl = `/t/${props.tenantSlug}/pharmacy/orders/${invoiceId}/print?paper=thermal80`;
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

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Link className="text-sm font-medium text-gray-600 hover:text-gray-900" href={`/t/${props.tenantSlug}/pharmacy`}>
                {t("module.pharmacy.name")}
              </Link>
              <div className="text-sm text-gray-500">/</div>
              <div className="text-2xl font-semibold text-gray-900">{t("app.pharmacy.tab.pos")}</div>
            </div>
            <div className="mt-2 text-sm text-gray-700">{t("app.pharmacy.pos.subtitle")}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => {
                setBarcodeModalOpen(true);
              }}
            >
              {t("app.pharmacy.pos.action.camera")}
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={clearSale}>
              {t("app.pharmacy.pos.action.clear")}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.pos.field.scan")}</label>
            <input
              ref={scanInputRef}
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm"
              placeholder={t("app.pharmacy.pos.field.scan.placeholder")}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                const value = (e.currentTarget.value || "").trim();
                if (!value) return;
                e.currentTarget.value = "";
                void resolveCode(value);
              }}
            />
            <div className="mt-2 flex items-center justify-between text-xs text-gray-600">
              <div>{t("app.pharmacy.pos.hint.shortcuts")}</div>
              <div className="font-medium">{lastScannedCode ? `${t("app.pharmacy.pos.hint.last")}: ${lastScannedCode}` : ""}</div>
            </div>
            {scanError ? <div className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t(scanError)}</div> : null}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.pos.field.location")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={loadingTenant}>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.pos.field.customer")}</label>
          <div className="mt-1 flex gap-2">
            <input
              className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm"
              value={customerQuery}
              placeholder={customer ? customer.name : t("app.pharmacy.pos.customer.placeholder")}
              onChange={(e) => {
                setCustomer(null);
                setCustomerQuery(e.target.value);
              }}
              disabled={loadingTenant}
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
            ) : (
              <button
                type="button"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
                onClick={() => {
                  setErrorKey(null);
                  setCreateCustomerOpen(true);
                  setNewCustomerName(customerQuery.trim());
                }}
              >
                {t("app.pharmacy.pos.customer.action.add")}
              </button>
            )}
          </div>
          {customerLoading ? <div className="mt-2 text-xs text-gray-500">{t("app.pharmacy.pos.customer.searching")}</div> : null}
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
                  <span className="text-xs text-gray-500">{t("app.pharmacy.pos.action.select")}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="mt-6">
          <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.pos.field.search")}</label>
          <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} placeholder={t("app.pharmacy.pos.field.search.placeholder")} />
          {productResults.length ? (
            <div className="mt-3 overflow-hidden rounded-2xl border border-gray-200">
              {productResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-start justify-between gap-4 border-b border-gray-100 px-4 py-3 text-left text-sm hover:bg-gray-50 last:border-b-0"
                  onClick={() => {
                    addProductToCart(p, "1");
                    setProductQuery("");
                    setProductResults([]);
                    focusScanner();
                  }}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-gray-900">{p.name}</div>
                    <div className="mt-1 truncate text-xs text-gray-500">{p.sku ?? "—"}</div>
                  </div>
                  <div className="shrink-0 text-right text-xs font-semibold text-gray-900">{formatMoney(p.sellPrice, sellCurrencyCode)}</div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-gray-900">{t("app.pharmacy.pos.cart.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.pharmacy.pos.cart.subtitle")}</div>
          </div>
          <button
            type="button"
            disabled={posting || lines.length === 0}
            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
            onClick={() => {
              setPayAmount(toMoneyString(roundedTotalNumber));
              setCheckoutOpen(true);
              setErrorKey(null);
            }}
          >
            {t("app.pharmacy.pos.action.checkout")}
          </button>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl border border-gray-200">
          {lines.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-700">{t("app.pharmacy.pos.cart.empty")}</div>
          ) : (
            lines.map((l) => (
              <div key={l.productId} className="border-b border-gray-100 px-4 py-3 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">{l.name}</div>
                    <div className="mt-1 truncate text-xs text-gray-500">{l.sku ?? "—"}</div>
                  </div>
                  <button type="button" className="shrink-0 text-xs text-red-600 hover:text-red-700" onClick={() => setLines((prev) => prev.filter((x) => x.productId !== l.productId))}>
                    {t("common.button.remove")}
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-xs text-gray-700">{t("app.pharmacy.pos.line.qty")}</div>
                    <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm tabular" value={l.quantity} onChange={(e) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, quantity: e.target.value } : x)))} />
                  </div>
                  <div>
                    <div className="text-xs text-gray-700">{t("app.pharmacy.pos.line.price")}</div>
                    <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm tabular" value={l.unitPrice} onChange={(e) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, unitPrice: e.target.value } : x)))} />
                  </div>
                  <div>
                    <div className="text-xs text-gray-700">{t("app.pharmacy.pos.line.discount")}</div>
                    <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm tabular" value={l.discountAmount} onChange={(e) => setLines((prev) => prev.map((x) => (x.productId === l.productId ? { ...x, discountAmount: e.target.value } : x)))} />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex items-center justify-between text-sm">
            <div className="text-gray-700">{t("app.pharmacy.pos.summary.subtotal")}</div>
            <div className="font-semibold text-gray-900">{formatMoney(toMoneyString(grossSubtotal), sellCurrencyCode)}</div>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <div className="text-gray-700">{t("app.pharmacy.pos.summary.discounts")}</div>
            <div className="font-semibold text-gray-900">{formatMoney(toMoneyString(lineDiscountTotal + invoiceDiscount), sellCurrencyCode)}</div>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <div className="text-gray-700">{t("app.pharmacy.pos.summary.tax")}</div>
            <div className="font-semibold text-gray-900">{formatMoney(toMoneyString(taxTotal), sellCurrencyCode)}</div>
          </div>
          <div className="mt-3 border-t border-gray-200 pt-3">
            <div className="flex items-center justify-between text-sm">
              <div className="text-gray-700">{t("app.pharmacy.pos.summary.total")}</div>
              <div className="text-lg font-semibold text-gray-900">{formatMoney(toMoneyString(roundedTotalNumber), sellCurrencyCode)}</div>
            </div>
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-xs font-medium text-gray-700">{t("app.shop.invoice.field.invoiceDiscount")}</label>
          <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm tabular" value={invoiceDiscountAmount} onChange={(e) => setInvoiceDiscountAmount(e.target.value)} />
        </div>
      </div>

      <Modal open={checkoutOpen} onClose={() => setCheckoutOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold text-gray-900">{t("app.pharmacy.pos.checkout.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.pharmacy.pos.checkout.subtitle")}</div>

          {errorKey ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{t(errorKey)}</div> : null}

          <div className="mt-5 space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between text-sm">
                <div className="text-gray-700">{t("app.pharmacy.pos.checkout.total")}</div>
                <div className="font-semibold text-gray-900">{formatMoney(toMoneyString(roundedTotalNumber), sellCurrencyCode)}</div>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <div className="text-gray-700">{t("app.pharmacy.pos.checkout.method")}</div>
                <div className="font-semibold text-gray-900">{paymentMethodName}</div>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <div className="text-gray-700">{t("app.pharmacy.pos.checkout.payAmount")}</div>
                <div className="font-semibold text-gray-900">{formatMoney(payAmount, sellCurrencyCode)}</div>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <div className="text-gray-700">{changeDue > 0 ? t("app.pharmacy.pos.checkout.changeDue") : t("app.pharmacy.pos.checkout.outstanding")}</div>
                <div className="font-semibold text-gray-900">
                  {changeDue > 0 ? formatMoney(toMoneyString(changeDue), sellCurrencyCode) : formatMoney(toMoneyString(outstanding), sellCurrencyCode)}
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.pos.checkout.method")}</label>
                <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={paymentMethodName} onChange={(e) => setPaymentMethodName(e.target.value)}>
                  {paymentMethods.map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.pos.checkout.payAmount")}</label>
                <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm tabular" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setCheckoutOpen(false)} disabled={posting}>
              {t("common.button.cancel")}
            </button>
            <button type="button" disabled={posting} className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60" onClick={checkout}>
              {posting ? t("common.working") : t("app.pharmacy.pos.checkout.confirm")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={scanModalOpen} onClose={() => setScanModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold text-gray-900">{t("app.pharmacy.pos.scan.pickTitle")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.pharmacy.pos.scan.pickSubtitle")}</div>
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
        open={barcodeModalOpen}
        onClose={() => setBarcodeModalOpen(false)}
        onDetected={(code: string) => {
          suppressCameraAutoOpenRef.current = true;
          setTimeout(() => {
            suppressCameraAutoOpenRef.current = false;
          }, 800);
          setBarcodeModalOpen(false);
          void resolveCode(code);
        }}
      />

      <Modal open={createCustomerOpen} onClose={() => setCreateCustomerOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold text-gray-900">{t("app.pharmacy.pos.customer.modal.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.pharmacy.pos.customer.modal.subtitle")}</div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.pos.customer.field.name")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.pos.customer.field.phone")}</label>
                <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.pos.customer.field.email")}</label>
                <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setCreateCustomerOpen(false)} disabled={posting}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              onClick={submitCreateCustomer}
              disabled={posting || newCustomerName.trim().length < 2}
            >
              {posting ? t("common.working") : t("common.button.create")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
