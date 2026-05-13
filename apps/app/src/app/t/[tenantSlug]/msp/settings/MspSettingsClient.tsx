"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type ComplianceThreshold = { currencyCode: string; amount: string };
type SettingsResponse = {
  data: {
    baseCurrencyCode: string;
    compliance?: {
      kyc?: { enforceMode?: "always" | "above_threshold"; requireCustomerAboveThreshold?: boolean; requiredAbove?: ComplianceThreshold[] };
      aml?: { largeTx?: ComplianceThreshold[]; structuringWindowHours?: number; structuringMinCount?: number };
    };
  };
};
type Currency = { id: string; code: string; name: string; symbol: string | null; decimals: number; isActive: boolean; updatedAt: string };
type CurrenciesResponse = { data: Currency[] };

type RateItem = { id: string; baseCode: string; quoteCode: string; buyRate: string; sellRate: string; updatedAt: string; updatedByUserId: string | null };
type RatesResponse = { data: { effectiveDate: string; items: RateItem[] } };

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function MspSettingsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [baseCurrencyCode, setBaseCurrencyCode] = useState<string>("AFN");
  const [savingBase, setSavingBase] = useState(false);

  const [complianceSaving, setComplianceSaving] = useState(false);
  const [kycEnforceMode, setKycEnforceMode] = useState<"always" | "above_threshold">("always");
  const [kycRequireCustomerAbove, setKycRequireCustomerAbove] = useState(true);
  const [kycRequiredAboveMap, setKycRequiredAboveMap] = useState<Map<string, string>>(new Map());
  const [amlLargeTxMap, setAmlLargeTxMap] = useState<Map<string, string>>(new Map());
  const [structuringWindowHours, setStructuringWindowHours] = useState("24");
  const [structuringMinCount, setStructuringMinCount] = useState("3");

  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [currencyModalOpen, setCurrencyModalOpen] = useState(false);
  const [currencyForm, setCurrencyForm] = useState<{ code: string; name: string; symbol: string; decimals: string; isActive: boolean }>({
    code: "",
    name: "",
    symbol: "",
    decimals: "2",
    isActive: true
  });
  const [savingCurrency, setSavingCurrency] = useState(false);

  const [effectiveDate, setEffectiveDate] = useState(() => isoDate(new Date()));
  const [ratesBaseCode, setRatesBaseCode] = useState<string>("AFN");
  const [ratesMap, setRatesMap] = useState<Map<string, { buyRate: string; sellRate: string }>>(new Map());
  const [savingRates, setSavingRates] = useState(false);

  const activeCurrencies = useMemo(() => currencies.filter((c) => c.isActive), [currencies]);

  const quoteCurrencies = useMemo(() => activeCurrencies.filter((c) => c.code !== ratesBaseCode), [activeCurrencies, ratesBaseCode]);

  const loadTenant = useCallback(async () => {
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
      setTenantId(membership.tenantId);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [props.tenantSlug]);

  const loadAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setErrorKey(null);
    try {
      const [settingsRes, currenciesRes] = await Promise.all([
        apiFetch("/api/msp/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
        apiFetch("/api/msp/currencies", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
      ]);
      const settingsJson = (await settingsRes.json()) as SettingsResponse | { error?: { message_key?: string } };
      const currenciesJson = (await currenciesRes.json()) as CurrenciesResponse | { error?: { message_key?: string } };
      if (!settingsRes.ok) {
        setErrorKey((settingsJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      if (!currenciesRes.ok) {
        setErrorKey((currenciesJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }

      const base = (settingsJson as SettingsResponse).data.baseCurrencyCode ?? "AFN";
      setBaseCurrencyCode(base);
      setRatesBaseCode((prev) => (prev ? prev : base));
      setCurrencies((currenciesJson as CurrenciesResponse).data ?? []);

      const compliance = (settingsJson as SettingsResponse).data.compliance ?? null;
      const kyc = compliance?.kyc ?? null;
      setKycEnforceMode(kyc?.enforceMode ?? "always");
      setKycRequireCustomerAbove(typeof kyc?.requireCustomerAboveThreshold === "boolean" ? kyc.requireCustomerAboveThreshold : true);
      setKycRequiredAboveMap(() => {
        const m = new Map<string, string>();
        for (const it of kyc?.requiredAbove ?? []) {
          if (!it?.currencyCode || !it.amount) continue;
          m.set(it.currencyCode, it.amount);
        }
        return m;
      });

      const aml = compliance?.aml ?? null;
      setAmlLargeTxMap(() => {
        const m = new Map<string, string>();
        for (const it of aml?.largeTx ?? []) {
          if (!it?.currencyCode || !it.amount) continue;
          m.set(it.currencyCode, it.amount);
        }
        return m;
      });
      setStructuringWindowHours(String(aml?.structuringWindowHours ?? 24));
      setStructuringMinCount(String(aml?.structuringMinCount ?? 3));
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const loadRates = useCallback(async () => {
    if (!tenantId) return;
    setErrorKey(null);
    try {
      const p = new URLSearchParams();
      p.set("date", effectiveDate);
      p.set("baseCode", ratesBaseCode);
      const res = await apiFetch(`/api/msp/rates?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as RatesResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const items = (json as RatesResponse).data.items ?? [];
      const map = new Map<string, { buyRate: string; sellRate: string }>();
      for (const it of items) {
        map.set(it.quoteCode, { buyRate: it.buyRate, sellRate: it.sellRate });
      }
      setRatesMap(map);
    } catch {
      setErrorKey("errors.internal");
    }
  }, [effectiveDate, ratesBaseCode, tenantId]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!tenantId) return;
    void loadRates();
  }, [loadRates, tenantId]);

  const openAddCurrency = useCallback(() => {
    setCurrencyForm({ code: "", name: "", symbol: "", decimals: "2", isActive: true });
    setCurrencyModalOpen(true);
  }, []);

  const openEditCurrency = useCallback((c: Currency) => {
    setCurrencyForm({
      code: c.code,
      name: c.name,
      symbol: c.symbol ?? "",
      decimals: String(c.decimals ?? 2),
      isActive: c.isActive
    });
    setCurrencyModalOpen(true);
  }, []);

  const saveCurrency = useCallback(async () => {
    if (!tenantId) return;
    setSavingCurrency(true);
    setErrorKey(null);
    try {
      const payload = {
        code: currencyForm.code.trim().toUpperCase(),
        name: currencyForm.name.trim(),
        symbol: currencyForm.symbol.trim() || undefined,
        decimals: Number(currencyForm.decimals),
        isActive: currencyForm.isActive
      };
      const res = await apiFetch("/api/msp/currencies", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { data?: { success: boolean }; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setCurrencyModalOpen(false);
      await loadAll();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSavingCurrency(false);
    }
  }, [currencyForm, loadAll, tenantId]);

  const saveBaseCurrency = useCallback(async () => {
    if (!tenantId) return;
    setSavingBase(true);
    setErrorKey(null);
    try {
      const res = await apiFetch("/api/msp/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({ baseCurrencyCode })
      });
      const json = (await res.json()) as { data?: { success: boolean }; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      await loadAll();
      await loadRates();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSavingBase(false);
    }
  }, [baseCurrencyCode, loadAll, loadRates, tenantId]);

  const saveCompliance = useCallback(async () => {
    if (!tenantId) return;
    setComplianceSaving(true);
    setErrorKey(null);
    try {
      const requiredAbove: ComplianceThreshold[] = [];
      const largeTx: ComplianceThreshold[] = [];
      for (const c of activeCurrencies) {
        const kycVal = (kycRequiredAboveMap.get(c.code) ?? "").trim();
        if (kycVal) requiredAbove.push({ currencyCode: c.code, amount: kycVal });
        const amlVal = (amlLargeTxMap.get(c.code) ?? "").trim();
        if (amlVal) largeTx.push({ currencyCode: c.code, amount: amlVal });
      }

      const res = await apiFetch("/api/msp/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({
          compliance: {
            kyc: { enforceMode: kycEnforceMode, requireCustomerAboveThreshold: kycRequireCustomerAbove, requiredAbove },
            aml: { largeTx, structuringWindowHours: Number(structuringWindowHours), structuringMinCount: Number(structuringMinCount) }
          }
        })
      });
      const json = (await res.json()) as { data?: { success: boolean }; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      await loadAll();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setComplianceSaving(false);
    }
  }, [activeCurrencies, amlLargeTxMap, kycEnforceMode, kycRequireCustomerAbove, kycRequiredAboveMap, loadAll, structuringMinCount, structuringWindowHours, tenantId]);

  const setRate = useCallback((quoteCode: string, field: "buyRate" | "sellRate", value: string) => {
    setRatesMap((prev) => {
      const next = new Map(prev);
      const current = next.get(quoteCode) ?? { buyRate: "", sellRate: "" };
      next.set(quoteCode, { ...current, [field]: value });
      return next;
    });
  }, []);

  const saveRates = useCallback(async () => {
    if (!tenantId) return;
    setSavingRates(true);
    setErrorKey(null);
    try {
      const items = quoteCurrencies
        .map((c) => {
          const r = ratesMap.get(c.code) ?? { buyRate: "", sellRate: "" };
          const buyRate = r.buyRate.trim();
          const sellRate = r.sellRate.trim();
          if (!buyRate || !sellRate) return null;
          return { quoteCode: c.code, buyRate, sellRate };
        })
        .filter(Boolean) as Array<{ quoteCode: string; buyRate: string; sellRate: string }>;

      const res = await apiFetch("/api/msp/rates/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({ baseCode: ratesBaseCode, effectiveDate, items })
      });
      const json = (await res.json()) as { data?: { success: boolean }; error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      await loadRates();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSavingRates(false);
    }
  }, [effectiveDate, loadRates, quoteCurrencies, ratesBaseCode, ratesMap, tenantId]);

  if (loading && !tenantId) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card text-sm text-gray-700">{t("common.loading")}</div>;
  }

  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold">{t("app.msp.settings.baseCurrency.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.msp.settings.baseCurrency.subtitle")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm"
              value={baseCurrencyCode}
              onChange={(e) => setBaseCurrencyCode(e.target.value)}
            >
              {activeCurrencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={savingBase}
              onClick={() => void saveBaseCurrency()}
            >
              {savingBase ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold">{t("app.msp.settings.compliance.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.msp.settings.compliance.subtitle")}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={complianceSaving}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              onClick={() => void saveCompliance()}
            >
              {complianceSaving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.settings.compliance.kycMode")}</label>
            <select className="mt-1 h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={kycEnforceMode} onChange={(e) => setKycEnforceMode(e.target.value as "always" | "above_threshold")}>
              <option value="always">{t("app.msp.settings.compliance.kycMode.always")}</option>
              <option value="above_threshold">{t("app.msp.settings.compliance.kycMode.above")}</option>
            </select>
          </div>
          <div className="flex items-end gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="h-4 w-4 rounded border-gray-300" checked={kycRequireCustomerAbove} onChange={(e) => setKycRequireCustomerAbove(e.target.checked)} />
              {t("app.msp.settings.compliance.requireCustomerAbove")}
            </label>
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.settings.compliance.structuringWindowHours")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" inputMode="numeric" value={structuringWindowHours} onChange={(e) => setStructuringWindowHours(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.settings.compliance.structuringMinCount")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" inputMode="numeric" value={structuringMinCount} onChange={(e) => setStructuringMinCount(e.target.value)} />
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">{t("app.msp.settings.compliance.currency")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.settings.compliance.kycAbove")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.settings.compliance.amlLarge")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {activeCurrencies.map((c) => (
                <tr key={c.code} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    {c.code} — {c.name}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className="h-9 w-full rounded-xl border border-gray-200 px-3 text-right text-sm tabular-nums"
                      inputMode="decimal"
                      value={kycRequiredAboveMap.get(c.code) ?? ""}
                      onChange={(e) =>
                        setKycRequiredAboveMap((prev) => {
                          const next = new Map(prev);
                          next.set(c.code, e.target.value);
                          return next;
                        })
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className="h-9 w-full rounded-xl border border-gray-200 px-3 text-right text-sm tabular-nums"
                      inputMode="decimal"
                      value={amlLargeTxMap.get(c.code) ?? ""}
                      onChange={(e) =>
                        setAmlLargeTxMap((prev) => {
                          const next = new Map(prev);
                          next.set(c.code, e.target.value);
                          return next;
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold">{t("app.msp.settings.currencies.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.msp.settings.currencies.subtitle")}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
              onClick={openAddCurrency}
            >
              {t("app.msp.settings.currencies.add")}
            </button>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">{t("app.msp.currency.code")}</th>
                <th className="px-4 py-3 text-left">{t("app.msp.currency.name")}</th>
                <th className="px-4 py-3 text-left">{t("app.msp.currency.symbol")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.currency.decimals")}</th>
                <th className="px-4 py-3 text-left">{t("app.msp.currency.active")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.currency.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {currencies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    {t("app.msp.settings.currencies.empty")}
                  </td>
                </tr>
              ) : (
                currencies.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{c.code}</td>
                    <td className="px-4 py-3 text-gray-700">{c.name}</td>
                    <td className="px-4 py-3 text-gray-700">{c.symbol ?? "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-700">{c.decimals}</td>
                    <td className="px-4 py-3 text-gray-700">
                      <span className={c.isActive ? "inline-flex rounded-full bg-primary-50 px-2 py-1 text-xs text-primary-700" : "inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700"}>
                        {c.isActive ? t("common.status.active") : t("common.status.inactive")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                        onClick={() => openEditCurrency(c)}
                      >
                        {t("common.button.edit")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold">{t("app.msp.settings.rates.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.msp.settings.rates.subtitle")}</div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.settings.rates.date")}</label>
              <input type="date" className="mt-1 h-10 rounded-xl border border-gray-200 px-3 text-sm" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.settings.rates.base")}</label>
              <select className="mt-1 h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm" value={ratesBaseCode} onChange={(e) => setRatesBaseCode(e.target.value)}>
                {activeCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => void loadRates()}
            >
              {t("common.button.refresh")}
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={savingRates}
              onClick={() => void saveRates()}
            >
              {savingRates ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">{t("app.msp.rate.quote")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.rate.buy")}</th>
                <th className="px-4 py-3 text-right">{t("app.msp.rate.sell")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {quoteCurrencies.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                    {t("app.msp.settings.rates.empty")}
                  </td>
                </tr>
              ) : (
                quoteCurrencies.map((c) => {
                  const r = ratesMap.get(c.code) ?? { buyRate: "", sellRate: "" };
                  return (
                    <tr key={c.code} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{c.code}</div>
                        <div className="text-xs text-gray-500">{c.name}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          className="h-10 w-32 rounded-xl border border-gray-200 px-3 text-right text-sm tabular-nums"
                          inputMode="decimal"
                          value={r.buyRate}
                          onChange={(e) => setRate(c.code, "buyRate", e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          className="h-10 w-32 rounded-xl border border-gray-200 px-3 text-right text-sm tabular-nums"
                          inputMode="decimal"
                          value={r.sellRate}
                          onChange={(e) => setRate(c.code, "sellRate", e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={currencyModalOpen} onClose={() => (!savingCurrency ? setCurrencyModalOpen(false) : null)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.msp.settings.currencies.modal.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.msp.settings.currencies.modal.subtitle")}</div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.currency.code")}</label>
              <input
                className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
                value={currencyForm.code}
                onChange={(e) => setCurrencyForm((p) => ({ ...p, code: e.target.value }))}
                disabled={savingCurrency || Boolean(currencies.find((c) => c.code === currencyForm.code.trim().toUpperCase()))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.currency.name")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={currencyForm.name} onChange={(e) => setCurrencyForm((p) => ({ ...p, name: e.target.value }))} disabled={savingCurrency} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.currency.symbol")}</label>
              <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={currencyForm.symbol} onChange={(e) => setCurrencyForm((p) => ({ ...p, symbol: e.target.value }))} disabled={savingCurrency} />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.currency.decimals")}</label>
              <input
                type="number"
                min={0}
                max={6}
                className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm"
                value={currencyForm.decimals}
                onChange={(e) => setCurrencyForm((p) => ({ ...p, decimals: e.target.value }))}
                disabled={savingCurrency}
              />
            </div>
            <div className="md:col-span-2">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={currencyForm.isActive} onChange={(e) => setCurrencyForm((p) => ({ ...p, isActive: e.target.checked }))} disabled={savingCurrency} />
                {t("app.msp.currency.active")}
              </label>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              disabled={savingCurrency}
              onClick={() => setCurrencyModalOpen(false)}
            >
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={savingCurrency}
              onClick={() => void saveCurrency()}
            >
              {savingCurrency ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
