"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = {
  data: {
    memberships: { tenantId: string; tenantSlug: string }[];
  };
};

type CustomerResponse = {
  data: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    address: string | null;
    notes: string | null;
    status: "active" | "archived";
    balance: string;
  };
};

type LedgerResponse = {
  data: {
    openingBalance: string;
    closingBalance: string;
    items: {
      id: string;
      type: "invoice" | "refund" | "payment" | "refund_payout";
      dateTime: string;
      ref: string | null;
      method: string | null;
      currencyCode: string;
      amount: string;
      delta: string;
      balance: string;
    }[];
  };
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function CustomerLedgerClient(props: { tenantSlug: string; customerId: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [customer, setCustomer] = useState<CustomerResponse["data"] | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse["data"] | null>(null);

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return isoDate(d);
  });
  const [to, setTo] = useState(() => isoDate(new Date()));

  const currencyCode = "USD";

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", new Date(to + "T23:59:59.999Z").toISOString());
    return p;
  }, [from, to]);

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
    async function loadData() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const [cRes, lRes] = await Promise.all([
          apiFetch(`/api/shop/customers/${props.customerId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/customers/${props.customerId}/ledger?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);
        const cJson = (await cRes.json()) as CustomerResponse | { error?: { message_key?: string } };
        const lJson = (await lRes.json()) as LedgerResponse | { error?: { message_key?: string } };
        if (!cRes.ok) {
          setErrorKey((cJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        if (!lRes.ok) {
          setErrorKey((lJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        if (!cancelled) {
          setCustomer((cJson as CustomerResponse).data);
          setLedger((lJson as LedgerResponse).data);
        }
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadData();
    return () => {
      cancelled = true;
    };
  }, [tenantId, props.customerId, queryParams]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">{customer ? customer.name : t("app.shop.customerLedger.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.shop.customerLedger.subtitle")}</div>
            {customer ? (
              <div className="mt-2 text-sm text-gray-700">
                {t("app.shop.customerLedger.balance")}: <span className="font-semibold text-gray-900">{formatMoney(customer.balance, currencyCode)}</span>
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              href={`/t/${props.tenantSlug}/shop/customers`}
            >
              {t("common.button.back")}
            </Link>
            <a
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
              href={`/t/${props.tenantSlug}/shop/customers/${props.customerId}/statement?paper=a4&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`}
              target="_blank"
              rel="noreferrer"
            >
              {t("app.shop.customerStatement.action.print")}
            </a>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.customerLedger.filter.from")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.customerLedger.filter.to")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              disabled={loading}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              onClick={() => {
                setFrom(from);
                setTo(to);
              }}
            >
              {t("app.shop.customerLedger.action.refresh")}
            </button>
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.customerLedger.table.time")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.customerLedger.table.type")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.customerLedger.table.ref")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.customerLedger.table.method")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.customerLedger.table.amount")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.customerLedger.table.balance")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={6}>
                    Loading…
                  </td>
                </tr>
              ) : !ledger || ledger.items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={6}>
                    {t("app.shop.customerLedger.empty")}
                  </td>
                </tr>
              ) : (
                ledger.items.map((e) => (
                  <tr key={e.id}>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{new Date(e.dateTime).toLocaleString()}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{t(`app.shop.customerLedger.type.${e.type}`)}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{e.ref ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{e.method ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right font-medium text-gray-900">
                      {formatMoney(e.delta, e.currencyCode)}
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right font-semibold text-gray-900">
                      {formatMoney(e.balance, currencyCode)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {ledger ? (
          <div className="flex flex-col gap-3 border-t border-gray-200 p-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-gray-700">
              {t("app.shop.customerLedger.opening")}: <span className="font-semibold text-gray-900">{formatMoney(ledger.openingBalance, currencyCode)}</span>
            </div>
            <div className="text-sm text-gray-700">
              {t("app.shop.customerLedger.closing")}: <span className="font-semibold text-gray-900">{formatMoney(ledger.closingBalance, currencyCode)}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
