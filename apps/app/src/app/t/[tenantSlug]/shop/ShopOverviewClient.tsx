"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { currencies } from "@/lib/currency-catalog";
import { Modal } from "@/components/Modal";

type MeResponse = {
  data: {
    memberships: { tenantId: string; tenantSlug: string }[];
  };
};

type OverviewResponse = {
  data: {
    counts: { productsActive: number; productsArchived: number; categories: number };
    currencies: { base: string; sell: string; buy: string };
    recentProducts: { id: string; name: string; sellPrice: string; createdAt: string }[];
  };
};

type ShopSettingsResponse = {
  data: { sellCurrencyCode: string; buyCurrencyCode: string; taxEnabled: boolean; taxRate: string; cashRoundingIncrement: string };
};

export function ShopOverviewClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewResponse["data"] | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sellCurrency, setSellCurrency] = useState("USD");
  const [buyCurrency, setBuyCurrency] = useState("USD");
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState("0");
  const [cashRoundingIncrement, setCashRoundingIncrement] = useState("0");

  const steps = useMemo(
    () => [
      { title: t("app.shop.overview.guide.step1.title"), desc: t("app.shop.overview.guide.step1.desc"), href: `/t/${props.tenantSlug}/modules` },
      { title: t("app.shop.overview.guide.step2.title"), desc: t("app.shop.overview.guide.step2.desc"), href: `/t/${props.tenantSlug}/shop/products` },
      { title: t("app.shop.overview.guide.step3.title"), desc: t("app.shop.overview.guide.step3.desc"), href: `/t/${props.tenantSlug}/shop/inventory` },
      { title: t("app.shop.overview.guide.step4.title"), desc: t("app.shop.overview.guide.step4.desc"), href: `/t/${props.tenantSlug}/shop/audit` }
    ],
    [props.tenantSlug, t]
  );

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
    async function loadOverview() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const res = await apiFetch("/api/shop/overview", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as OverviewResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        if (!cancelled) setOverview((json as OverviewResponse).data);
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadOverview();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  useEffect(() => {
    let cancelled = false;
    async function loadSettings() {
      if (!tenantId || !settingsOpen) return;
      try {
        const res = await apiFetch("/api/shop/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        if (!res.ok) return;
        const json = (await res.json()) as ShopSettingsResponse;
        if (!cancelled) {
          setSellCurrency(json.data.sellCurrencyCode ?? "USD");
          setBuyCurrency(json.data.buyCurrencyCode ?? "USD");
          setTaxEnabled(Boolean(json.data.taxEnabled));
          setTaxRate(json.data.taxRate ?? "0");
          setCashRoundingIncrement(json.data.cashRoundingIncrement ?? "0");
        }
      } catch {}
    }
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [tenantId, settingsOpen]);

  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }

  const counts = overview?.counts ?? { productsActive: 0, productsArchived: 0, categories: 0 };
  const currencyInfo = overview?.currencies ?? { base: "USD", sell: "USD", buy: "USD" };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-primary-50 p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.shop.overview.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.shop.overview.subtitle")}</div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
              href={`/t/${props.tenantSlug}/shop/products`}
            >
              {t("app.shop.overview.cta.products")}
            </Link>
            <Link
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              href={`/t/${props.tenantSlug}/shop/orders`}
            >
              {t("app.shop.overview.cta.sales")}
            </Link>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={<IconBox />} label={t("app.shop.overview.stat.products")} value={String(counts.productsActive)} hint={t("app.shop.overview.stat.productsHint")} />
        <StatCard icon={<IconTag />} label={t("app.shop.overview.stat.categories")} value={String(counts.categories)} hint={t("app.shop.overview.stat.categoriesHint")} />
        <StatCard icon={<IconArchive />} label={t("app.shop.overview.stat.archived")} value={String(counts.productsArchived)} hint={t("app.shop.overview.stat.archivedHint")} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">{t("app.shop.overview.recent.title")}</div>
              <div className="mt-1 text-sm text-gray-700">{t("app.shop.overview.recent.subtitle")}</div>
            </div>
            <Link className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/shop/products`}>
              {t("app.shop.overview.recent.cta")}
            </Link>
          </div>

          <div className="mt-5 divide-y divide-gray-100">
            {loading && !overview ? (
              <div className="py-6 text-sm text-gray-600">Loading…</div>
            ) : overview?.recentProducts?.length ? (
              overview.recentProducts.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">{p.name}</div>
                    <div className="mt-1 text-xs text-gray-500">{new Date(p.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="shrink-0 text-sm font-medium text-gray-900">{p.sellPrice}</div>
                </div>
              ))
            ) : (
              <div className="py-6 text-sm text-gray-600">{t("app.shop.overview.recent.empty")}</div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">{t("app.shop.overview.currency.title")}</div>
                <div className="mt-2 text-sm text-gray-700">{t("app.shop.overview.currency.subtitle")}</div>
              </div>
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50"
                onClick={() => {
                  setSettingsOpen(true);
                }}
              >
                {t("app.shop.overview.currency.edit")}
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-sm text-gray-700">{t("app.shop.overview.currency.base")}</div>
                <div className="text-sm font-semibold text-gray-900">{currencyInfo.base}</div>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-sm text-gray-700">{t("app.shop.overview.currency.sell")}</div>
                <div className="text-sm font-semibold text-gray-900">{currencyInfo.sell}</div>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="text-sm text-gray-700">{t("app.shop.overview.currency.buy")}</div>
                <div className="text-sm font-semibold text-gray-900">{currencyInfo.buy}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
            <div className="text-lg font-semibold">{t("app.shop.overview.guide.title")}</div>
            <div className="mt-2 text-sm text-gray-700">{t("app.shop.overview.guide.subtitle")}</div>
            <div className="mt-5 space-y-3">
              {steps.map((s, idx) => (
                <Link key={idx} href={s.href} className="block rounded-2xl border border-gray-200 bg-gray-50 p-4 hover:bg-gray-100">
                  <div className="text-sm font-semibold text-gray-900">{s.title}</div>
                  <div className="mt-1 text-sm text-gray-700">{s.desc}</div>
                </Link>
              ))}
            </div>
            <div className="mt-6">
              <Link
                className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
                href={`/t/${props.tenantSlug}/shop/products`}
              >
                {t("app.shop.overview.cta.start")}
              </Link>
            </div>
          </div>
        </div>
      </div>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">{t("app.shop.overview.currency.modal.title")}</div>
              <div className="mt-2 text-sm text-gray-700">{t("app.shop.overview.currency.modal.subtitle")}</div>
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setSettingsOpen(false)}
            >
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <CurrencyField label={t("app.shop.overview.currency.sell")} value={sellCurrency} onChange={setSellCurrency} />
            <CurrencyField label={t("app.shop.overview.currency.buy")} value={buyCurrency} onChange={setBuyCurrency} />
          </div>

          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <div className="grid gap-4 md:grid-cols-3">
              <label className="inline-flex items-center gap-2 text-sm font-medium text-gray-900">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  checked={taxEnabled}
                  onChange={(e) => setTaxEnabled(e.target.checked)}
                />
                {t("app.shop.overview.tax.enabled")}
              </label>
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-gray-900">{t("app.shop.overview.tax.rate")}</label>
                <input
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  disabled={!taxEnabled}
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-gray-900">{t("app.shop.overview.rounding.increment")}</label>
                <input
                  className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={cashRoundingIncrement}
                  onChange={(e) => setCashRoundingIncrement(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => setSettingsOpen(false)}
            >
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              disabled={!tenantId || savingSettings || !/^[A-Z]{3}$/.test(sellCurrency) || !/^[A-Z]{3}$/.test(buyCurrency)}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              onClick={async () => {
                if (!tenantId) return;
                setSavingSettings(true);
                setErrorKey(null);
                try {
                  const res = await apiFetch("/api/shop/settings", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                    body: JSON.stringify({ sellCurrencyCode: sellCurrency, buyCurrencyCode: buyCurrency, taxEnabled, taxRate, cashRoundingIncrement })
                  });
                  if (!res.ok) {
                    const json = (await res.json()) as { error?: { message_key?: string } };
                    setErrorKey(json.error?.message_key ?? "errors.internal");
                    return;
                  }
                  setOverview((prev) => (prev ? { ...prev, currencies: { ...prev.currencies, sell: sellCurrency, buy: buyCurrency } } : prev));
                  setSettingsOpen(false);
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setSavingSettings(false);
                }
              }}
            >
              {savingSettings ? t("app.shop.products.action.working") : t("common.button.submit")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function CurrencyField(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-900">{props.label}</label>
      <input
        className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
        list="currency-list"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value.toUpperCase())}
      />
      <datalist id="currency-list">
        {currencies.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} — {c.name}
          </option>
        ))}
      </datalist>
    </div>
  );
}

function StatCard(props: { icon: React.ReactNode; label: string; value: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-gray-700">{props.label}</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900">{props.value}</div>
          <div className="mt-2 text-sm text-gray-600">{props.hint}</div>
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">{props.icon}</div>
      </div>
    </div>
  );
}

function IconBox() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M4 7l8 4 8-4" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 11v10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconTag() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 13 13 20 4 11V4h7l9 9Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7.5 7.5h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function IconArchive() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16v14H4V7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3 3h18v4H3V3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
