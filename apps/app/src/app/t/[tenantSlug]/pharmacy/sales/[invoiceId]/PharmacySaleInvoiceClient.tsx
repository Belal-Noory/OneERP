"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type InvoiceLine = {
  id: string;
  product: { id: string; name: string; sku: string | null; unit: { id: string; name: string; symbol: string | null } | null };
  quantity: string;
  unitPrice: string;
  lineTotal: string;
  discountAmount: string;
  netTotal: string;
};

type InvoicePayment = { id: string; direction: "in" | "out"; method: string; amount: string; note: string | null; createdAt: string; actor: { id: string; fullName: string | null } | null };

type InvoiceResponse = {
  data: {
    id: string;
    kind: "sale" | "refund";
    status: "draft" | "posted" | "void";
    invoiceNumber: string | null;
    refundOf: { id: string; invoiceNumber: string | null } | null;
    currencyCode: string;
    notes: string | null;
    grossSubtotal: string;
    invoiceDiscountAmount: string;
    discountTotal: string;
    taxEnabled: boolean;
    taxRate: string;
    taxTotal: string;
    roundingAdjustment: string;
    subtotal: string;
    paidTotal: string;
    createdAt: string;
    postedAt: string | null;
    customer: { id: string; name: string } | null;
    location: { id: string; name: string } | null;
    lines: InvoiceLine[];
    payments: InvoicePayment[];
  };
};

export function PharmacySaleInvoiceClient(props: { tenantSlug: string; invoiceId: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceResponse["data"] | null>(null);

  const title = useMemo(() => {
    if (!invoice) return t("common.loading");
    return invoice.invoiceNumber ?? invoice.id;
  }, [invoice, t]);

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
    async function loadInvoice() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const res = await apiFetch(`/api/pharmacy/invoices/${props.invoiceId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as InvoiceResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        if (!cancelled) setInvoice((json as InvoiceResponse).data);
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadInvoice();
    return () => {
      cancelled = true;
    };
  }, [props.invoiceId, tenantId]);

  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  if (loading || !invoice) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700 shadow-card">{t("common.loading")}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold text-gray-900">{title}</div>
            <div className="mt-1 text-sm text-gray-700">
              {t(`app.pharmacy.sales.kind.${invoice.kind}`)} · {t(`app.pharmacy.sales.status.${invoice.status}`)}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/sales`}>
              {t("app.pharmacy.sales.action.back")}
            </Link>
            <Link className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/pos`}>
              {t("app.pharmacy.sales.action.newSale")}
            </Link>
            <Link className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700" href={`/t/${props.tenantSlug}/pharmacy/orders/${invoice.id}/print?paper=thermal80`} target="_blank" rel="noreferrer">
              {t("app.pharmacy.sales.action.reprint")}
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-[11px] font-medium text-gray-600">{t("app.pharmacy.sales.meta.customer")}</div>
            <div className="mt-1 truncate text-sm font-semibold text-gray-900">{invoice.customer?.name ?? "—"}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-[11px] font-medium text-gray-600">{t("app.pharmacy.sales.meta.location")}</div>
            <div className="mt-1 truncate text-sm font-semibold text-gray-900">{invoice.location?.name ?? "—"}</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
            <div className="text-[11px] font-medium text-gray-600">{t("app.pharmacy.sales.meta.total")}</div>
            <div className="mt-1 truncate text-sm font-semibold text-gray-900">{formatMoney(invoice.subtotal, invoice.currencyCode)}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900">{t("app.pharmacy.sales.section.lines")}</div>
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.sales.lines.medicine")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.pharmacy.sales.lines.qty")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.pharmacy.sales.lines.price")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.pharmacy.sales.lines.total")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {invoice.lines.map((l) => (
                <tr key={l.id}>
                  <td className="border-b border-gray-100 px-4 py-3">
                    <div className="font-medium text-gray-900">{l.product.name}</div>
                    <div className="mt-1 text-xs text-gray-500">{l.product.sku ?? "—"}</div>
                  </td>
                  <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900 tabular">{l.quantity}</td>
                  <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900 tabular">{formatMoney(l.unitPrice, invoice.currencyCode)}</td>
                  <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-900 tabular">{formatMoney(l.netTotal, invoice.currencyCode)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center justify-between text-sm text-gray-700">
            <div>{t("app.pharmacy.sales.meta.paid")}</div>
            <div className="font-semibold text-gray-900">{formatMoney(invoice.paidTotal, invoice.currencyCode)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

