"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type Product = {
  id: string;
  name: string;
  sku: string | null;
  unit: { id: string; name: string; symbol: string | null } | null;
  sellPrice: string;
  barcodes: string[];
};

type ProductsResponse = { data: { items: Product[] } };
type ShopSettingsResponse = { data: { sellCurrencyCode: string } };

type TemplateId = "40x30" | "50x30" | "a4_3x8";

type LabelItem = {
  productId: string;
  name: string;
  sku: string | null;
  unitSymbol: string | null;
  sellPrice: string;
  barcode: string | null;
  qty: number;
};

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function makePrintKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export function LabelsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [sellCurrencyCode, setSellCurrencyCode] = useState("USD");
  const [templateId, setTemplateId] = useState<TemplateId>("40x30");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [items, setItems] = useState<LabelItem[]>([]);

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
    async function loadSettings() {
      if (!tenantId) return;
      try {
        const res = await apiFetch("/api/shop/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as ShopSettingsResponse;
        if (!cancelled) setSellCurrencyCode(json.data.sellCurrencyCode ?? "USD");
      } catch {}
    }
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function search() {
      if (!tenantId) return;
      const q = query.trim();
      if (!q) {
        setResults([]);
        return;
      }
      try {
        const params = new URLSearchParams();
        params.set("q", q);
        params.set("status", "active");
        params.set("page", "1");
        params.set("pageSize", "10");
        const res = await apiFetch(`/api/shop/products?${params.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as ProductsResponse;
        if (!cancelled) setResults(json.data.items ?? []);
      } catch {}
    }
    const h = setTimeout(search, 250);
    return () => {
      cancelled = true;
      clearTimeout(h);
    };
  }, [query, tenantId]);

  const totalLabels = useMemo(() => items.reduce((sum, it) => sum + it.qty, 0), [items]);

  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.shop.labels.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.shop.labels.subtitle")}</div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Link className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/shop/products`}>
              {t("app.shop.labels.action.products")}
            </Link>
            <button
              type="button"
              disabled={!tenantId || items.length === 0 || loading}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              onClick={() => {
                if (!tenantId || items.length === 0) return;
                const payload = { templateId, currencyCode: sellCurrencyCode, items };
                const key = makePrintKey();
                try {
                  localStorage.setItem(`labelsPrint:${key}`, JSON.stringify(payload));
                } catch {}
                window.open(`/t/${props.tenantSlug}/shop/labels/print?key=${encodeURIComponent(key)}`, "_blank", "noopener,noreferrer");
              }}
            >
              {t("app.shop.labels.action.print")} ({totalLabels})
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.labels.field.search")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm disabled:opacity-60"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("app.shop.labels.field.search.placeholder")}
              disabled={loading}
            />
            {results.length ? (
              <div className="mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
                    onClick={() => {
                      const code = p.barcodes?.[0] ?? null;
                      setItems((prev) => {
                        const existing = prev.find((x) => x.productId === p.id) ?? null;
                        if (existing) return prev.map((x) => (x.productId === p.id ? { ...x, qty: clampInt(x.qty + 1, 1, 999) } : x));
                        return [
                          {
                            productId: p.id,
                            name: p.name,
                            sku: p.sku,
                            unitSymbol: p.unit?.symbol ?? null,
                            sellPrice: p.sellPrice,
                            barcode: code,
                            qty: 1
                          },
                          ...prev
                        ];
                      });
                      setQuery("");
                      setResults([]);
                    }}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-900">{p.name}</div>
                      <div className="mt-0.5 text-xs text-gray-500">{p.sku ?? p.barcodes?.[0] ?? "—"}</div>
                    </div>
                    <div className="shrink-0 text-sm font-semibold text-gray-900">{formatMoney(p.sellPrice, sellCurrencyCode)}</div>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.labels.field.template")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={templateId} onChange={(e) => setTemplateId(e.target.value as TemplateId)} disabled={loading}>
              <option value="40x30">{t("app.shop.labels.template.40x30")}</option>
              <option value="50x30">{t("app.shop.labels.template.50x30")}</option>
              <option value="a4_3x8">{t("app.shop.labels.template.a4_3x8")}</option>
            </select>
            <div className="mt-2 text-xs text-gray-600">{t("app.shop.labels.hint")}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg font-semibold">{t("app.shop.labels.cart.title")}</div>
          {items.length ? (
            <button type="button" className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50" onClick={() => setItems([])}>
              {t("app.shop.labels.cart.clear")}
            </button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-700">{t("app.shop.labels.cart.empty")}</div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[820px] w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.labels.table.product")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.labels.table.barcode")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.labels.table.qty")}</th>
                  <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.labels.table.actions")}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {items.map((it) => (
                  <tr key={it.productId}>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-900">
                      <div className="font-medium">{it.name}</div>
                      <div className="mt-1 text-xs text-gray-500">{formatMoney(it.sellPrice, sellCurrencyCode)}</div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">
                      <div className="flex flex-col gap-2">
                        <div className="text-xs text-gray-500">{t("app.shop.labels.table.barcode.primary")}</div>
                        <input
                          className="h-10 w-72 rounded-xl border border-gray-200 px-3 text-sm"
                          value={it.barcode ?? ""}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            setItems((prev) => prev.map((x) => (x.productId === it.productId ? { ...x, barcode: v || null } : x)));
                          }}
                          placeholder={t("app.shop.labels.table.barcode.placeholder")}
                        />
                      </div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right">
                      <input
                        className="h-10 w-24 rounded-xl border border-gray-200 px-3 text-sm text-right tabular"
                        value={String(it.qty)}
                        onChange={(e) => {
                          const v = clampInt(Number(e.target.value), 1, 999);
                          setItems((prev) => prev.map((x) => (x.productId === it.productId ? { ...x, qty: v } : x)));
                        }}
                      />
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right">
                      <button
                        type="button"
                        className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50"
                        onClick={() => setItems((prev) => prev.filter((x) => x.productId !== it.productId))}
                      >
                        {t("app.shop.labels.action.remove")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
