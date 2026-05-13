"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type TenantResponse = {
  data: {
    name: string;
    slug: string;
    branding: {
      logoFileId: string | null;
      address: string | null;
      phone: string | null;
    };
  };
};

type TicketResponse = {
  data: {
    id: string;
    ticketNumber: number;
    type: "buy" | "sell" | string;
    baseCode: string;
    quoteCode: string;
    effectiveDate: string;
    quoteAmount: string;
    rate: string;
    baseAmount: string;
    feeBase: string;
    customerName: string | null;
    customerPhone: string | null;
    note: string | null;
    baseAccountId: string | null;
    quoteAccountId: string | null;
    createdAt: string;
  };
};

type Account = { id: string; type: string; name: string; currencyCode: string; isActive: boolean };
type AccountsResponse = { data: Account[] };

type PrintSize = "a4" | "80" | "58";

function getPrintSize(): PrintSize {
  if (typeof window === "undefined") return "a4";
  const p = new URLSearchParams(window.location.search);
  const size = p.get("size");
  if (size === "80") return "80";
  if (size === "58") return "58";
  return "a4";
}

function toFixedSafe(v: string, digits = 2): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return v;
  return n.toFixed(digits);
}

export function PrintMspExchangeTicketClient(props: { tenantSlug: string; ticketId: string }) {
  const { t } = useClientI18n();
  const [tenant, setTenant] = useState<TenantResponse["data"] | null>(null);
  const [ticket, setTicket] = useState<TicketResponse["data"] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [size, setSize] = useState<PrintSize>("a4");
  const printableRef = useRef<HTMLDivElement | null>(null);

  const logoFullUrl = useMemo(() => {
    if (!tenant?.branding?.logoFileId) return null;
    return `/api/files/${tenant.branding.logoFileId}`;
  }, [tenant?.branding?.logoFileId]);

  const load = useCallback(async () => {
    setLoading(true);
    setErrorKey(null);
    try {
      setSize(getPrintSize());

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

      const tenantRes = await apiFetch("/api/tenants/current", { cache: "no-store" });
      const tenantJson = (await tenantRes.json()) as TenantResponse | { error?: { message_key?: string } };
      if (!tenantRes.ok) {
        setErrorKey((tenantJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      setTenant((tenantJson as TenantResponse).data);

      const ticketRes = await apiFetch(`/api/msp/exchange/tickets/${encodeURIComponent(props.ticketId)}`, {
        cache: "no-store",
        headers: { "X-Tenant-Id": membership.tenantId }
      });
      const ticketJson = (await ticketRes.json()) as TicketResponse | { error?: { message_key?: string } };
      if (!ticketRes.ok) {
        setErrorKey((ticketJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
        return;
      }
      setTicket((ticketJson as TicketResponse).data);

      const accountsRes = await apiFetch("/api/msp/accounts", { cache: "no-store", headers: { "X-Tenant-Id": membership.tenantId } });
      const accountsJson = (await accountsRes.json()) as AccountsResponse | { error?: { message_key?: string } };
      if (accountsRes.ok) {
        setAccounts(((accountsJson as AccountsResponse).data ?? []).filter((a) => a.type === "cash" || a.type === "bank"));
      }

      const p = new URLSearchParams(window.location.search);
      if (p.get("download") === "pdf") {
        const html2canvas = (await import("html2canvas")).default;
        const { jsPDF } = await import("jspdf");
        const el = printableRef.current;
        if (!el) return;
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
        const imgData = canvas.toDataURL("image/png");

        if (size === "a4") {
          const pdf = new jsPDF("p", "pt", "a4");
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          const imgWidth = pageWidth;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          let position = 0;
          let remaining = imgHeight;
          while (remaining > 0) {
            pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
            remaining -= pageHeight;
            if (remaining > 0) {
              pdf.addPage();
              position -= pageHeight;
            }
          }
          pdf.save(`msp_exchange_ticket_${(ticketJson as TicketResponse).data.ticketNumber}.pdf`);
        } else {
          const widthMm = size === "80" ? 80 : 58;
          const pdf = new jsPDF("p", "mm", [widthMm, 500]);
          const pageWidth = pdf.internal.pageSize.getWidth();
          const imgWidth = pageWidth;
          const imgHeight = (canvas.height * imgWidth) / canvas.width;
          pdf.internal.pageSize.height = imgHeight;
          pdf.addImage(imgData, "PNG", 0, 0, imgWidth, imgHeight);
          pdf.save(`msp_exchange_ticket_${(ticketJson as TicketResponse).data.ticketNumber}_${size}mm.pdf`);
        }

        setTimeout(() => window.close(), 250);
      }
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [props.ticketId, props.tenantSlug, size]);

  useEffect(() => {
    void load();
  }, [load]);

  const containerClass = useMemo(() => {
    if (size === "a4") return "mx-auto max-w-3xl";
    if (size === "80") return "mx-auto w-[320px]";
    return "mx-auto w-[250px]";
  }, [size]);

  if (loading) {
    return <div className="p-6 text-sm text-gray-700">{t("common.loading")}</div>;
  }
  if (errorKey) {
    return <div className="p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }
  if (!tenant || !ticket) {
    return <div className="p-6 text-sm text-gray-700">{t("errors.internal")}</div>;
  }

  const accountsById = new Map(accounts.map((a) => [a.id, a]));
  const baseAccount = ticket.baseAccountId ? (accountsById.get(ticket.baseAccountId) ?? null) : null;
  const quoteAccount = ticket.quoteAccountId ? (accountsById.get(ticket.quoteAccountId) ?? null) : null;
  const payFromAccount = ticket.type === "buy" ? baseAccount : ticket.type === "sell" ? quoteAccount : null;
  const receiveIntoAccount = ticket.type === "buy" ? quoteAccount : ticket.type === "sell" ? baseAccount : null;

  const totalBase = Number(ticket.baseAmount) + Number(ticket.feeBase);

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className={containerClass}>
        <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
          <div ref={printableRef} className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-lg font-semibold text-gray-900">{tenant.name}</div>
                {tenant.branding.address ? <div className="text-xs text-gray-600">{tenant.branding.address}</div> : null}
                {tenant.branding.phone ? <div className="text-xs text-gray-600">{tenant.branding.phone}</div> : null}
              </div>
              {logoFullUrl ? <Image src={logoFullUrl} alt="" width={80} height={80} className="h-12 w-auto object-contain" /> : null}
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-gray-200 pt-4">
              <div className="text-sm font-semibold text-gray-900">{t("app.msp.exchange.receipt.title")}</div>
              <div className="text-sm font-semibold text-gray-900">#{ticket.ticketNumber}</div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="text-gray-600">{t("app.msp.exchange.receipt.date")}</div>
              <div className="text-right text-gray-900">{ticket.effectiveDate}</div>

              <div className="text-gray-600">{t("app.msp.exchange.receipt.type")}</div>
              <div className="text-right text-gray-900">{ticket.type === "buy" ? t("app.msp.exchange.type.buy") : ticket.type === "sell" ? t("app.msp.exchange.type.sell") : ticket.type}</div>

              <div className="text-gray-600">{t("app.msp.exchange.receipt.pair")}</div>
              <div className="text-right text-gray-900">
                {ticket.baseCode}/{ticket.quoteCode}
              </div>

              {payFromAccount ? (
                <>
                  <div className="text-gray-600">{t("app.msp.exchange.field.payFrom")}</div>
                  <div className="text-right text-gray-900">
                    {payFromAccount.name} ({payFromAccount.type.toUpperCase()})
                  </div>
                </>
              ) : null}

              {receiveIntoAccount ? (
                <>
                  <div className="text-gray-600">{t("app.msp.exchange.field.receiveInto")}</div>
                  <div className="text-right text-gray-900">
                    {receiveIntoAccount.name} ({receiveIntoAccount.type.toUpperCase()})
                  </div>
                </>
              ) : null}

              <div className="text-gray-600">{t("app.msp.exchange.receipt.quoteAmount")}</div>
              <div className="text-right text-gray-900 tabular-nums">
                {toFixedSafe(ticket.quoteAmount, 2)} {ticket.quoteCode}
              </div>

              <div className="text-gray-600">{t("app.msp.exchange.receipt.rate")}</div>
              <div className="text-right text-gray-900 tabular-nums">{toFixedSafe(ticket.rate, 4)}</div>

              <div className="text-gray-600">{t("app.msp.exchange.receipt.baseAmount")}</div>
              <div className="text-right text-gray-900 tabular-nums">
                {toFixedSafe(ticket.baseAmount, 2)} {ticket.baseCode}
              </div>

              <div className="text-gray-600">{t("app.msp.exchange.receipt.fee")}</div>
              <div className="text-right text-gray-900 tabular-nums">
                {toFixedSafe(ticket.feeBase, 2)} {ticket.baseCode}
              </div>
            </div>

            <div className="mt-4 border-t border-gray-200 pt-4">
              <div className="flex items-center justify-between text-sm">
                <div className="font-semibold text-gray-900">{t("app.msp.exchange.receipt.totalBase")}</div>
                <div className="font-semibold text-gray-900 tabular-nums">
                  {Number.isFinite(totalBase) ? totalBase.toFixed(2) : ticket.baseAmount} {ticket.baseCode}
                </div>
              </div>
            </div>

            {(ticket.customerName || ticket.customerPhone) && (
              <div className="mt-4 border-t border-gray-200 pt-4 text-sm">
                <div className="font-semibold text-gray-900">{t("app.msp.exchange.receipt.customer")}</div>
                {ticket.customerName ? <div className="text-gray-700">{ticket.customerName}</div> : null}
                {ticket.customerPhone ? <div className="text-gray-700">{ticket.customerPhone}</div> : null}
              </div>
            )}

            {ticket.note ? (
              <div className="mt-4 border-t border-gray-200 pt-4 text-sm">
                <div className="font-semibold text-gray-900">{t("app.msp.exchange.receipt.note")}</div>
                <div className="text-gray-700 whitespace-pre-wrap">{ticket.note}</div>
              </div>
            ) : null}

            <div className="mt-6 border-t border-gray-200 pt-4 text-center text-xs text-gray-500">
              {t("app.msp.exchange.receipt.thankYou")}
            </div>
          </div>

          <div className="flex flex-col gap-2 border-t border-gray-200 p-4 md:flex-row md:items-center md:justify-end">
            <Link
              href={`/t/${props.tenantSlug}/msp/exchange/tickets/${encodeURIComponent(props.ticketId)}/print?size=${size}&download=pdf`}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700"
            >
              {t("common.button.downloadPdf")}
            </Link>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => window.print()}
            >
              {t("common.button.print")}
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-sm text-gray-700">
          <button type="button" className={size === "a4" ? "h-9 rounded-xl bg-gray-900 px-3 text-white" : "h-9 rounded-xl border border-gray-200 bg-white px-3"} onClick={() => setSize("a4")}>
            A4
          </button>
          <button type="button" className={size === "80" ? "h-9 rounded-xl bg-gray-900 px-3 text-white" : "h-9 rounded-xl border border-gray-200 bg-white px-3"} onClick={() => setSize("80")}>
            80mm
          </button>
          <button type="button" className={size === "58" ? "h-9 rounded-xl bg-gray-900 px-3 text-white" : "h-9 rounded-xl border border-gray-200 bg-white px-3"} onClick={() => setSize("58")}>
            58mm
          </button>
        </div>
      </div>
    </div>
  );
}
