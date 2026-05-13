"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type SupplierResponse = {
  data: { id: string; name: string; status: "active" | "archived"; balance: string; phone: string | null; email: string | null; address: string | null; notes: string | null };
};

type LedgerResponse = {
  data: {
    openingBalance: string;
    closingBalance: string;
    items: { time: string; type: "purchase" | "payment"; ref: string | null; method: string | null; amount: string; delta: string; balance: string }[];
  };
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function SupplierLedgerClient(props: { tenantSlug: string; supplierId: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [supplier, setSupplier] = useState<SupplierResponse["data"] | null>(null);
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
        const [supplierRes, ledgerRes] = await Promise.all([
          apiFetch(`/api/shop/suppliers/${props.supplierId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/shop/suppliers/${props.supplierId}/ledger?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);
        const supplierJson = (await supplierRes.json()) as SupplierResponse | { error?: { message_key?: string } };
        const ledgerJson = (await ledgerRes.json()) as LedgerResponse | { error?: { message_key?: string } };
        if (!supplierRes.ok || !ledgerRes.ok) {
          setErrorKey((supplierJson as { error?: { message_key?: string } }).error?.message_key ?? (ledgerJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        if (!cancelled) {
          setSupplier((supplierJson as SupplierResponse).data);
          setLedger((ledgerJson as LedgerResponse).data);
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
  }, [props.supplierId, queryParams, tenantId]);

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700">{t("common.loading")}</div>;
  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  if (!supplier || !ledger) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700">{t("errors.notFound")}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link className="text-sm font-medium text-gray-600 hover:text-gray-900" href={`/t/${props.tenantSlug}/shop/suppliers`}>
                {t("app.shop.suppliers.back")}
              </Link>
              <div className="text-sm text-gray-500">/</div>
              <div className="truncate text-2xl font-semibold text-gray-900">{supplier.name}</div>
            </div>
            <div className="mt-2 text-sm text-gray-700">{t("app.shop.supplierLedger.subtitle")}</div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-xs font-medium text-gray-600">{t("app.shop.supplierLedger.balance")}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900 tabular">{formatMoney(supplier.balance, currencyCode)}</div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.supplierLedger.filter.from")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.supplierLedger.filter.to")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-gray-700">
            {t("app.shop.supplierLedger.opening")}: <span className="font-semibold">{formatMoney(ledger.openingBalance, currencyCode)}</span> · {t("app.shop.supplierLedger.closing")}:{" "}
            <span className="font-semibold">{formatMoney(ledger.closingBalance, currencyCode)}</span>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-[920px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.supplierLedger.table.time")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.supplierLedger.table.type")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.supplierLedger.table.ref")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.shop.supplierLedger.table.method")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.supplierLedger.table.amount")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.shop.supplierLedger.table.balance")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {ledger.items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={6}>
                    {t("app.shop.supplierLedger.empty")}
                  </td>
                </tr>
              ) : (
                ledger.items.map((it, idx) => (
                  <tr key={`${it.type}-${it.time}-${idx}`}>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{new Date(it.time).toLocaleString()}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{t(`app.shop.supplierLedger.type.${it.type}`)}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{it.ref ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{it.method ?? "—"}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900 tabular">{formatMoney(it.amount, currencyCode)}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900 tabular">{formatMoney(it.balance, currencyCode)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

