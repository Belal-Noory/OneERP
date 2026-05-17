"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { getApiBaseUrl } from "@/lib/api";
import { currencies } from "@/lib/currency-catalog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type Settings = {
  tenantId: string;
  businessName: string | null;
  logoFileId: string | null;
  logoUrl: string | null;
  phone: string | null;
  address: string | null;
  email: string | null;
  taxNumber: string | null;
  defaultCurrencyCode: string;
  nextJobNumber: number;
  nextQuotationNumber: number;
  nextInvoiceNumber: number;
  createdAt: string;
  updatedAt: string;
};

type SettingsResponse = { data: Settings };

export function PrintPressSettingsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const apiBase = getApiBaseUrl();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [businessName, setBusinessName] = useState("");
  const [logoFileId, setLogoFileId] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [defaultCurrencyCode, setDefaultCurrencyCode] = useState("USD");
  const [counters, setCounters] = useState<{ nextJobNumber: number; nextQuotationNumber: number; nextInvoiceNumber: number } | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const logoFullUrl = useMemo(() => {
    if (!logoUrl) return null;
    return `${apiBase}${logoUrl}`;
  }, [apiBase, logoUrl]);

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

  const loadSettings = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setSaved(false);
    setErrorKey(null);
    try {
      const res = await apiFetch("/api/printpress/settings", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      const json = (await res.json()) as SettingsResponse | { error?: { message_key?: string } };
      if (!res.ok) {
        setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      const s = (json as SettingsResponse).data;
      setBusinessName(s.businessName ?? "");
      setLogoFileId(s.logoFileId ?? null);
      setLogoUrl(s.logoUrl ?? null);
      setPhone(s.phone ?? "");
      setAddress(s.address ?? "");
      setEmail(s.email ?? "");
      setTaxNumber(s.taxNumber ?? "");
      setDefaultCurrencyCode(s.defaultCurrencyCode ?? "USD");
      setCounters({ nextJobNumber: s.nextJobNumber, nextQuotationNumber: s.nextQuotationNumber, nextInvoiceNumber: s.nextInvoiceNumber });
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const uploadLogo = useCallback(
    async (file: File) => {
      if (!tenantId) return;
      setUploadingLogo(true);
      setSaved(false);
      setErrorKey(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const up = await apiFetch(`/api/files?purpose=printpress_logo`, {
          method: "POST",
          headers: { "X-Tenant-Id": tenantId },
          body: fd
        });
        const upJson = (await up.json().catch(() => null)) as { data?: { id: string; url: string }; error?: { message_key?: string } } | null;
        if (!up.ok || !upJson?.data?.id) {
          setErrorKey(upJson?.error?.message_key ?? "errors.validationError");
          return;
        }

        const res = await apiFetch("/api/printpress/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
          body: JSON.stringify({ logoFileId: upJson.data.id })
        });
        const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
        if (!res.ok) {
          setErrorKey(json?.error?.message_key ?? "desktop.msg.saveFailed");
          return;
        }
        setSaved(true);
        await loadSettings();
      } catch {
        setErrorKey("desktop.msg.saveFailed");
      } finally {
        setUploadingLogo(false);
      }
    },
    [loadSettings, tenantId]
  );

  const removeLogo = useCallback(async () => {
    if (!tenantId) return;
    setUploadingLogo(true);
    setSaved(false);
    setErrorKey(null);
    try {
      const res = await apiFetch("/api/printpress/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({ logoFileId: "" })
      });
      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "desktop.msg.saveFailed");
        return;
      }
      setSaved(true);
      await loadSettings();
    } catch {
      setErrorKey("desktop.msg.saveFailed");
    } finally {
      setUploadingLogo(false);
    }
  }, [loadSettings, tenantId]);

  async function save() {
    if (!tenantId) return;
    setSaving(true);
    setSaved(false);
    setErrorKey(null);
    try {
      const payload = {
        businessName,
        logoFileId: logoFileId ?? "",
        phone,
        address,
        email,
        taxNumber,
        defaultCurrencyCode
      };
      const res = await apiFetch("/api/printpress/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify(payload)
      });
      const json = (await res.json().catch(() => null)) as { error?: { message_key?: string } } | null;
      if (!res.ok) {
        setErrorKey(json?.error?.message_key ?? "desktop.msg.saveFailed");
        return;
      }
      setSaved(true);
      await loadSettings();
    } catch {
      setErrorKey("desktop.msg.saveFailed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div>
          <div className="text-xl font-semibold">{t("app.printpress.settings.title")}</div>
          <div className="mt-1 text-sm text-gray-700">{t("app.printpress.settings.subtitle")}</div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.settings.field.businessName")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder={t("app.printpress.settings.field.businessNamePlaceholder")}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.settings.field.defaultCurrencyCode")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={defaultCurrencyCode}
              onChange={(e) => setDefaultCurrencyCode(e.target.value)}
            >
              {!currencies.some((c) => c.code === defaultCurrencyCode) ? <option value={defaultCurrencyCode}>{defaultCurrencyCode}</option> : null}
              {currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <label className="block text-xs font-medium text-gray-700">{t("app.printpress.settings.field.logoUrl")}</label>
              <div className="flex items-center gap-2">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (!f) return;
                    await uploadLogo(f);
                    if (logoInputRef.current) logoInputRef.current.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={!tenantId || uploadingLogo}
                  onClick={() => logoInputRef.current?.click()}
                  className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                >
                  {t("common.button.upload")}
                </button>
                <button
                  type="button"
                  disabled={!tenantId || uploadingLogo || !logoFileId}
                  onClick={removeLogo}
                  className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                >
                  {t("common.button.remove")}
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center gap-4">
              {logoFullUrl ? <img src={logoFullUrl} alt="" className="h-12 w-auto rounded-lg border border-gray-200 bg-white object-contain" /> : null}
              <div className="text-xs text-gray-600">{uploadingLogo ? t("common.loading") : logoFileId ? logoFileId : "—"}</div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.settings.field.phone")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.settings.field.email")}</label>
            <input
              type="email"
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.settings.field.address")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.settings.field.taxNumber")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={taxNumber}
              onChange={(e) => setTaxNumber(e.target.value)}
            />
          </div>

          <div className="flex items-end justify-end">
            <button
              type="button"
              disabled={!tenantId || loading || saving}
              onClick={save}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60 md:w-auto"
            >
              {saving ? t("common.loading") : t("common.button.save")}
            </button>
          </div>
        </div>
      </div>

      {saved ? <div className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">{t("desktop.msg.saved")}</div> : null}
      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{t(errorKey)}</div> : null}

      {counters ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
          <div className="text-sm font-semibold text-gray-900">{t("app.printpress.settings.section.counters")}</div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-medium text-gray-600">{t("app.printpress.settings.counter.nextJob")}</div>
              <div className="mt-2 text-lg font-semibold text-gray-900">{counters.nextJobNumber}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-medium text-gray-600">{t("app.printpress.settings.counter.nextQuotation")}</div>
              <div className="mt-2 text-lg font-semibold text-gray-900">{counters.nextQuotationNumber}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-medium text-gray-600">{t("app.printpress.settings.counter.nextInvoice")}</div>
              <div className="mt-2 text-lg font-semibold text-gray-900">{counters.nextInvoiceNumber}</div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
