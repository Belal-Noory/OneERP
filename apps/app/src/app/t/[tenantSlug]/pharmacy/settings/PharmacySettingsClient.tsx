"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { currencies } from "@/lib/currency-catalog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };
type SettingsResponse = {
  data: {
    baseCurrencyCode: string;
    sellCurrencyCode: string;
    buyCurrencyCode: string;
    taxEnabled: boolean;
    taxRate: string;
    cashRoundingIncrement: string;
    pharmacyReceivingRequireLotNumber: boolean;
    pharmacyReceivingRequireExpiryDate: boolean;
  };
};

export function PharmacySettingsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [baseCurrencyCode, setBaseCurrencyCode] = useState("USD");
  const [sellCurrencyCode, setSellCurrencyCode] = useState("USD");
  const [buyCurrencyCode, setBuyCurrencyCode] = useState("USD");
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxRate, setTaxRate] = useState("0");
  const [cashRoundingIncrement, setCashRoundingIncrement] = useState("0");
  const [requireLotNumber, setRequireLotNumber] = useState(false);
  const [requireExpiryDate, setRequireExpiryDate] = useState(false);

  const canSave = useMemo(() => /^[A-Z]{3}$/.test(sellCurrencyCode) && /^[A-Z]{3}$/.test(buyCurrencyCode), [buyCurrencyCode, sellCurrencyCode]);

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
      setLoading(true);
      setErrorKey(null);
      try {
        const res = await apiFetch("/api/pharmacy/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as SettingsResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        const data = (json as SettingsResponse).data;
        if (!cancelled) {
          setBaseCurrencyCode(data.baseCurrencyCode ?? "USD");
          setSellCurrencyCode(data.sellCurrencyCode ?? "USD");
          setBuyCurrencyCode(data.buyCurrencyCode ?? "USD");
          setTaxEnabled(Boolean(data.taxEnabled));
          setTaxRate(data.taxRate ?? "0");
          setCashRoundingIncrement(data.cashRoundingIncrement ?? "0");
          setRequireLotNumber(Boolean(data.pharmacyReceivingRequireLotNumber));
          setRequireExpiryDate(Boolean(data.pharmacyReceivingRequireExpiryDate));
        }
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Link className="text-sm font-medium text-gray-600 hover:text-gray-900" href={`/t/${props.tenantSlug}/pharmacy`}>
                {t("module.pharmacy.name")}
              </Link>
              <div className="text-sm text-gray-500">/</div>
              <div className="text-2xl font-semibold">{t("app.pharmacy.settings.title")}</div>
            </div>
            <div className="mt-2 text-gray-700">{t("app.pharmacy.settings.subtitle")}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-lg font-semibold text-gray-900">{t("app.pharmacy.settings.currency.title")}</div>
        <div className="mt-2 text-sm text-gray-700">{t("app.pharmacy.settings.currency.subtitle")}</div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-gray-900">{t("app.pharmacy.settings.currency.base")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm" value={baseCurrencyCode} readOnly />
          </div>
          <CurrencyField label={t("app.pharmacy.settings.currency.sell")} value={sellCurrencyCode} onChange={setSellCurrencyCode} />
          <CurrencyField label={t("app.pharmacy.settings.currency.buy")} value={buyCurrencyCode} onChange={setBuyCurrencyCode} />
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <div className="flex items-center gap-3">
            <input id="taxEnabled" type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" checked={taxEnabled} onChange={(e) => setTaxEnabled(e.target.checked)} />
            <label htmlFor="taxEnabled" className="text-sm font-medium text-gray-900">
              {t("app.pharmacy.settings.tax.enabled")}
            </label>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900">{t("app.pharmacy.settings.tax.rate")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm tabular" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900">{t("app.pharmacy.settings.rounding.increment")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm tabular" value={cashRoundingIncrement} onChange={(e) => setCashRoundingIncrement(e.target.value)} placeholder="0" />
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="inline-flex items-center gap-2 text-sm text-gray-900">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" checked={requireLotNumber} onChange={(e) => setRequireLotNumber(e.target.checked)} />
            {t("app.pharmacy.settings.receiving.requireLotNumber")}
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-gray-900">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" checked={requireExpiryDate} onChange={(e) => setRequireExpiryDate(e.target.checked)} />
            {t("app.pharmacy.settings.receiving.requireExpiryDate")}
          </label>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            type="button"
            disabled={!tenantId || saving || !canSave || loading}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
            onClick={async () => {
              if (!tenantId) return;
              setSaving(true);
              setErrorKey(null);
              try {
                const res = await apiFetch("/api/pharmacy/settings", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                  body: JSON.stringify({
                    sellCurrencyCode,
                    buyCurrencyCode,
                    taxEnabled,
                    taxRate,
                    cashRoundingIncrement,
                    pharmacyReceivingRequireLotNumber: requireLotNumber,
                    pharmacyReceivingRequireExpiryDate: requireExpiryDate
                  })
                });
                const json = (await res.json()) as { error?: { message_key?: string } };
                if (!res.ok) {
                  setErrorKey(json.error?.message_key ?? "errors.internal");
                  return;
                }
              } catch {
                setErrorKey("errors.internal");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving ? t("common.working") : t("common.button.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function CurrencyField(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-900">{props.label}</label>
      <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" list="currency-list" value={props.value} onChange={(e) => props.onChange(e.target.value.toUpperCase())} />
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
