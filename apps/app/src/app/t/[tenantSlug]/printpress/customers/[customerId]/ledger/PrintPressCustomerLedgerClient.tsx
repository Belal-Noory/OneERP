"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type LedgerResponse = {
  data: {
    customer: {
      id: string;
      fullName: string;
      companyName: string | null;
      phone: string | null;
      email: string | null;
      address: string | null;
      taxNumber: string | null;
      status: "active" | "archived";
    };
    range: { from: string; to: string };
    totals: {
      openingBalance: string;
      periodInvoiced: string;
      periodPaid: string;
      closingBalance: string;
      totalInvoiced: string;
      totalPaid: string;
      balanceDue: string;
    };
    timeline: Array<{
      type: "invoice" | "payment";
      at: string;
      invoiceId: string;
      paymentId: string | null;
      ref: string;
      status: string | null;
      method: string | null;
      debit: string;
      credit: string;
      balance: string;
      note: string | null;
    }>;
    recent: {
      jobs: Array<{ id: string; jobNumber: string | null; status: string; priority: string; title: string | null; createdAt: string; updatedAt: string }>;
      quotations: Array<{ id: string; quotationNumber: string | null; status: string; total: string; createdAt: string; updatedAt: string }>;
      invoices: Array<{ id: string; invoiceNumber: string | null; status: string; total: string; paidTotal: string; createdAt: string; updatedAt: string }>;
    };
  };
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseMaybeDecimal(v: string | null | undefined): number {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function badgeTone(status: "active" | "archived"): string {
  return status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-gray-50 text-gray-700 border-gray-200";
}

export function PrintPressCustomerLedgerClient(props: { tenantSlug: string; customerId: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);

  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return isoDate(d);
  });
  const [to, setTo] = useState(() => isoDate(new Date()));

  const [ledger, setLedger] = useState<LedgerResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

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

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }, [from, to]);

  useEffect(() => {
    let cancelled = false;
    async function loadLedger() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const res = await apiFetch(`/api/printpress/customers/${props.customerId}/ledger?${queryString}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json().catch(() => null)) as LedgerResponse | { error?: { message_key?: string } } | null;
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } } | null)?.error?.message_key ?? "errors.internal");
          return;
        }
        if (!cancelled) setLedger((json as LedgerResponse).data);
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadLedger();
    return () => {
      cancelled = true;
    };
  }, [tenantId, props.customerId, queryString]);

  const balanceDue = parseMaybeDecimal(ledger?.totals.balanceDue);
  const dueTone = balanceDue > 0 ? "text-red-700" : balanceDue < 0 ? "text-emerald-700" : "text-gray-900";

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card print-hidden">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.printpress.customers.ledger.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.printpress.customers.ledger.subtitle")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/t/${props.tenantSlug}/printpress/customers`}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              {t("common.button.back")}
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
            >
              {t("app.printpress.common.action.print")}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.customers.ledger.filter.from")}</label>
            <input
              type="date"
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.printpress.customers.ledger.filter.to")}</label>
            <input
              type="date"
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => {
                const dFrom = from?.trim();
                const dTo = to?.trim();
                if (!dFrom || !dTo) return;
                setFrom(dFrom);
                setTo(dTo);
              }}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              {t("common.button.refresh")}
            </button>
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="text-sm text-gray-600">{t("app.printpress.customers.ledger.customer")}</div>
            <div className="mt-1 truncate text-lg font-semibold text-gray-900">{ledger?.customer.fullName ?? "—"}</div>
            <div className="mt-1 text-sm text-gray-600">{[ledger?.customer.companyName, ledger?.customer.phone, ledger?.customer.email].filter(Boolean).join(" • ") || " "}</div>
          </div>
          {ledger?.customer.status ? (
            <div className={`inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium ${badgeTone(ledger.customer.status)}`}>
              {ledger.customer.status === "active" ? t("app.printpress.customers.status.active") : t("app.printpress.customers.status.archived")}
            </div>
          ) : null}
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-600">{t("app.printpress.customers.ledger.totals.balanceDue")}</div>
            <div className={`mt-2 text-lg font-semibold tabular ${dueTone}`}>{ledger?.totals.balanceDue ?? "—"}</div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-600">{t("app.printpress.customers.ledger.totals.openingBalance")}</div>
            <div className="mt-2 text-lg font-semibold text-gray-900 tabular">{ledger?.totals.openingBalance ?? "—"}</div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-600">{t("app.printpress.customers.ledger.totals.periodInvoiced")}</div>
            <div className="mt-2 text-lg font-semibold text-gray-900 tabular">{ledger?.totals.periodInvoiced ?? "—"}</div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-600">{t("app.printpress.customers.ledger.totals.periodPaid")}</div>
            <div className="mt-2 text-lg font-semibold text-gray-900 tabular">{ledger?.totals.periodPaid ?? "—"}</div>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-600">{t("app.printpress.customers.ledger.totals.closingBalance")}</div>
            <div className="mt-2 text-lg font-semibold text-gray-900 tabular">{ledger?.totals.closingBalance ?? "—"}</div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-600">{t("app.printpress.customers.ledger.totals.totalInvoiced")}</div>
            <div className="mt-2 text-lg font-semibold text-gray-900 tabular">{ledger?.totals.totalInvoiced ?? "—"}</div>
          </div>
          <div className="rounded-xl border border-gray-200 p-4">
            <div className="text-xs font-medium text-gray-600">{t("app.printpress.customers.ledger.totals.totalPaid")}</div>
            <div className="mt-2 text-lg font-semibold text-gray-900 tabular">{ledger?.totals.totalPaid ?? "—"}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-4">
          <div>
            <div className="text-sm font-medium text-gray-900">{t("app.printpress.customers.ledger.timeline.title")}</div>
            <div className="mt-1 text-xs text-gray-600">
              {t("app.printpress.customers.ledger.timeline.range")} {ledger?.range.from ?? "—"} → {ledger?.range.to ?? "—"}
            </div>
          </div>
          {loading ? <div className="text-sm text-gray-600">{t("common.loading")}</div> : null}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.customers.ledger.timeline.table.date")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.customers.ledger.timeline.table.type")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.customers.ledger.timeline.table.ref")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.printpress.customers.ledger.timeline.table.debit")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.printpress.customers.ledger.timeline.table.credit")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.printpress.customers.ledger.timeline.table.balance")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.printpress.customers.ledger.timeline.table.note")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={7}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : (ledger?.timeline ?? []).length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={7}>
                    {t("app.printpress.customers.ledger.timeline.empty")}
                  </td>
                </tr>
              ) : (
                (ledger?.timeline ?? []).map((it, idx) => (
                  <tr key={`${it.type}-${it.at}-${idx}`}>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{new Date(it.at).toLocaleString()}</td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="font-medium text-gray-900">{it.type === "invoice" ? t("app.printpress.customers.ledger.timeline.type.invoice") : t("app.printpress.customers.ledger.timeline.type.payment")}</div>
                      <div className="mt-1 text-xs text-gray-600">{it.type === "invoice" ? (it.status ? t(`app.printpress.invoices.status.${it.status}`) : "—") : it.method ?? "—"}</div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">
                      <Link href={`/t/${props.tenantSlug}/printpress/invoices/${it.invoiceId}`} className="font-medium text-primary-700 hover:underline">
                        {it.ref}
                      </Link>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-700 tabular">{it.debit}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-700 tabular">{it.credit}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right font-medium text-gray-900 tabular">{it.balance}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{it.note?.trim() ? it.note.trim() : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
          <div className="text-sm font-medium text-gray-900">{t("app.printpress.customers.ledger.recent.invoices")}</div>
          {(ledger?.recent.invoices ?? []).length === 0 ? (
            <div className="mt-3 text-sm text-gray-600">—</div>
          ) : (
            <div className="mt-4 space-y-2">
              {(ledger?.recent.invoices ?? []).map((inv) => (
                <div key={inv.id} className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">{inv.invoiceNumber ?? inv.id}</div>
                    <div className="mt-1 text-xs text-gray-600">
                      {new Date(inv.createdAt).toLocaleString()} • {t(`app.printpress.invoices.status.${inv.status}`)}
                    </div>
                  </div>
                  <Link
                    href={`/t/${props.tenantSlug}/printpress/invoices/${inv.id}`}
                    className="inline-flex h-9 shrink-0 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  >
                    {t("common.button.open")}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
          <div className="text-sm font-medium text-gray-900">{t("app.printpress.customers.ledger.recent.quotations")}</div>
          {(ledger?.recent.quotations ?? []).length === 0 ? (
            <div className="mt-3 text-sm text-gray-600">—</div>
          ) : (
            <div className="mt-4 space-y-2">
              {(ledger?.recent.quotations ?? []).map((q) => (
                <div key={q.id} className="flex items-center justify-between gap-4 rounded-xl border border-gray-100 px-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">{q.quotationNumber ?? q.id}</div>
                    <div className="mt-1 text-xs text-gray-600">
                      {new Date(q.createdAt).toLocaleString()} • {t(`app.printpress.quotations.status.${q.status}`)}
                    </div>
                  </div>
                  <Link
                    href={`/t/${props.tenantSlug}/printpress/quotations/${q.id}`}
                    className="inline-flex h-9 shrink-0 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  >
                    {t("common.button.open")}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="text-sm font-medium text-gray-900">{t("app.printpress.customers.ledger.recent.jobs")}</div>
        {(ledger?.recent.jobs ?? []).length === 0 ? (
          <div className="mt-3 text-sm text-gray-600">—</div>
        ) : (
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {(ledger?.recent.jobs ?? []).map((j) => (
              <div key={j.id} className="rounded-xl border border-gray-100 px-4 py-3">
                <div className="text-sm font-medium text-gray-900">{j.title ?? t("app.printpress.jobs.untitled")}</div>
                <div className="mt-1 text-xs text-gray-600">
                  {new Date(j.createdAt).toLocaleString()} • {t(`app.printpress.jobs.status.${j.status}`)} • {t(`app.printpress.jobs.priority.${j.priority}`)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

