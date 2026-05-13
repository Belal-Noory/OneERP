"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { getApiBaseUrl } from "@/lib/api";
import { formatMoney } from "@/lib/currency-catalog";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type TenantCurrentResponse = {
  data: {
    tenant: { id: string; slug: string; legalName: string; displayName: string; defaultLocale: string; status: string };
    branding: { logoUrl: string | null; address: string | null; phone: string | null; email: string | null };
  } | null;
};

type ShopSettingsResponse = { data: { sellCurrencyCode: string } };

type CashSessionResponse = {
  data: {
    id: string;
    status: "open" | "closed";
    openedAt: string;
    closedAt: string | null;
    openingCash: string;
    expectedCash: string;
    expectedCashLive: string;
    countedCash: string;
    discrepancy: string;
    note: string | null;
    location: { id: string; name: string } | null;
    cashIn: string;
    cashOut: string;
    paymentsIn: string;
    paymentsOut: string;
    paymentsTotal: string;
    events: { id: string; type: "cash_in" | "cash_out"; amount: string; note: string | null; createdAt: string }[];
  };
};

type Paper = "a4" | "thermal80" | "thermal58";

function isThermal(paper: Paper): paper is "thermal58" | "thermal80" {
  return paper === "thermal58" || paper === "thermal80";
}

export function PrintCashSessionClient(props: { tenantSlug: string; sessionId: string }) {
  const { t } = useClientI18n();
  const apiBase = getApiBaseUrl();
  const searchParams = useSearchParams();
  const initialPaper = ((): Paper => {
    const raw = searchParams.get("paper");
    if (raw === "thermal58") return "thermal58";
    if (raw === "thermal80") return "thermal80";
    return "a4";
  })();

  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantCurrentResponse["data"]>(null);
  const [currency, setCurrency] = useState("USD");
  const [session, setSession] = useState<CashSessionResponse["data"] | null>(null);
  const [paper, setPaper] = useState<Paper>(initialPaper);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const isThermalPaper = isThermal(paper);

  const logoFullUrl = useMemo(() => {
    const logoUrl = tenant?.branding.logoUrl ?? null;
    return logoUrl ? `${apiBase}${logoUrl}` : null;
  }, [apiBase, tenant?.branding.logoUrl]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
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
        if (cancelled) return;
        setTenantId(membership.tenantId);

        const [tenantRes, settingsRes, sessionRes] = await Promise.all([
          apiFetch("/api/tenants/current", { cache: "no-store", headers: { "X-Tenant-Id": membership.tenantId } }),
          apiFetch("/api/shop/settings", { cache: "no-store", headers: { "X-Tenant-Id": membership.tenantId } }),
          apiFetch(`/api/shop/cash-sessions/${props.sessionId}`, { cache: "no-store", headers: { "X-Tenant-Id": membership.tenantId } })
        ]);

        const tenantJson = (await tenantRes.json()) as TenantCurrentResponse;
        const settingsJson = settingsRes.ok ? ((await settingsRes.json()) as ShopSettingsResponse) : null;
        const sessionJson = (await sessionRes.json()) as CashSessionResponse | { error?: { message_key?: string } };

        if (!tenantRes.ok || !tenantJson.data) {
          setErrorKey("errors.internal");
          return;
        }
        if (!sessionRes.ok) {
          setErrorKey((sessionJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }

        if (!cancelled) {
          setTenant(tenantJson.data);
          setCurrency(settingsJson?.data?.sellCurrencyCode ?? "USD");
          setSession((sessionJson as CashSessionResponse).data);
        }
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [props.sessionId, props.tenantSlug]);

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700">Loading…</div>;
  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  if (!tenantId || !tenant || !session) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700">No data</div>;

  const expected = session.status === "closed" ? session.expectedCash : session.expectedCashLive;
  const counted = session.status === "closed" ? session.countedCash : "0.00";
  const diff = session.status === "closed" ? session.discrepancy : "0.00";

  return (
    <div className="space-y-4">
      <div className="no-print rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.shop.cash.print.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.shop.cash.print.subtitle")}</div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm" value={paper} onChange={(e) => setPaper(e.target.value as Paper)}>
              <option value="thermal80">{t("app.shop.print.paper.thermal80")}</option>
              <option value="thermal58">{t("app.shop.print.paper.thermal58")}</option>
              <option value="a4">{t("app.shop.print.paper.a4")}</option>
            </select>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700" onClick={() => window.print()}>
              {t("app.shop.print.action.print")}
            </button>
          </div>
        </div>
      </div>

      <div className={["print-root", isThermalPaper ? "print-thermal" : "print-a4"].join(" ")}>
        <style>{printCss}</style>
        <div className="print-paper">
          <div className={isThermalPaper ? "text-center" : ""}>
            <div className={["flex items-start gap-3", isThermalPaper ? "justify-center" : "justify-between"].join(" ")}>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-xl border border-gray-200 bg-white">
                  {logoFullUrl ? <Image alt="" src={logoFullUrl} crossOrigin="anonymous" unoptimized width={48} height={48} className="h-full w-full object-contain" /> : null}
                </div>
                <div className="min-w-0">
                  <div className="text-base font-semibold text-gray-900">{tenant.tenant.legalName?.trim() ? tenant.tenant.legalName : tenant.tenant.displayName}</div>
                  {tenant.branding.address ? <div className="mt-1 text-xs text-gray-600">{tenant.branding.address}</div> : null}
                  <div className="mt-1 text-xs text-gray-600">
                    {tenant.branding.phone ? `${tenant.branding.phone}` : ""}
                    {tenant.branding.phone && tenant.branding.email ? " • " : ""}
                    {tenant.branding.email ? tenant.branding.email : ""}
                  </div>
                </div>
              </div>
              {!isThermalPaper ? (
                <div className="text-right text-xs text-gray-600">
                  <div className="font-medium text-gray-900">{t("app.shop.cash.print.doc")}</div>
                  <div className="mt-1">{session.location?.name ?? "—"}</div>
                  <div className="mt-1">{new Date(session.openedAt).toLocaleString()}</div>
                </div>
              ) : null}
            </div>

            {isThermalPaper ? (
              <div className="mt-3 border-t border-dashed border-gray-300 pt-3 text-xs text-gray-700">
                <div className="font-medium text-gray-600">{t("app.shop.cash.print.doc")}</div>
                <div className="font-semibold text-gray-900">{session.location?.name ?? "—"}</div>
                <div className="mt-1">{new Date(session.openedAt).toLocaleString()}</div>
                <div className="mt-1">{t(`app.shop.cash.status.${session.status}`)}</div>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2 text-sm">
                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="text-xs font-medium text-gray-600">{t("app.shop.cash.print.location")}</div>
                  <div className="mt-1 font-semibold text-gray-900">{session.location?.name ?? "—"}</div>
                </div>
                <div className="rounded-xl border border-gray-200 p-3">
                  <div className="text-xs font-medium text-gray-600">{t("app.shop.cash.print.status")}</div>
                  <div className="mt-1 font-semibold text-gray-900">{t(`app.shop.cash.status.${session.status}`)}</div>
                </div>
              </div>
            )}
          </div>

          <div className={isThermalPaper ? "mt-4 text-xs" : "mt-6"}>
            <div className={isThermalPaper ? "border-t border-dashed border-gray-300 pt-3" : "grid gap-3 md:grid-cols-2"}>
              <Row label={t("app.shop.cash.print.openingCash")} value={formatMoney(session.openingCash, currency)} />
              <Row label={t("app.shop.cash.print.cashIn")} value={formatMoney(session.cashIn, currency)} />
              <Row label={t("app.shop.cash.print.cashOut")} value={formatMoney(session.cashOut, currency)} />
              <Row label={t("app.shop.cash.print.salesCash")} value={formatMoney(session.paymentsIn, currency)} />
              <Row label={t("app.shop.cash.print.refundCash")} value={formatMoney(session.paymentsOut, currency)} />
              <Row label={t("app.shop.cash.print.expectedCash")} value={formatMoney(expected, currency)} strong />
              {session.status === "closed" ? <Row label={t("app.shop.cash.print.countedCash")} value={formatMoney(counted, currency)} strong /> : null}
              {session.status === "closed" ? <Row label={t("app.shop.cash.print.discrepancy")} value={formatMoney(diff, currency)} strong /> : null}
            </div>
          </div>

          <div className={isThermalPaper ? "mt-4 border-t border-dashed border-gray-300 pt-3 text-xs" : "mt-6"}>
            <div className="text-sm font-semibold text-gray-900">{t("app.shop.cash.print.events")}</div>
            {session.events.length === 0 ? (
              <div className="mt-2 text-sm text-gray-600">{t("app.shop.cash.print.eventsEmpty")}</div>
            ) : (
              <div className="mt-3 space-y-2">
                {session.events.slice(0, isThermalPaper ? 20 : 50).map((e) => (
                  <div key={e.id} className={isThermalPaper ? "border-b border-dashed border-gray-200 pb-2" : "flex items-start justify-between gap-4"}>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">{e.type === "cash_in" ? t("app.shop.cash.event.cashIn") : t("app.shop.cash.event.cashOut")}</div>
                      <div className="mt-1 text-xs text-gray-600">
                        {new Date(e.createdAt).toLocaleString()}
                        {e.note?.trim() ? ` • ${e.note.trim()}` : ""}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-semibold text-gray-900 tabular">{formatMoney(e.amount, currency)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {session.note?.trim() ? (
            <div className={isThermalPaper ? "mt-4 border-t border-dashed border-gray-300 pt-3 text-xs" : "mt-6"}>
              <div className="text-xs font-medium text-gray-600">{t("app.shop.cash.print.note")}</div>
              <div className="mt-2 text-sm text-gray-900">{session.note.trim()}</div>
            </div>
          ) : null}

          <div className={isThermalPaper ? "mt-4 border-t border-dashed border-gray-300 pt-3 text-center text-xs text-gray-600" : "mt-6 text-center text-xs text-gray-600"}>
            {t("app.shop.print.thanks")}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row(props: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={props.strong ? "flex items-center justify-between text-sm font-semibold text-gray-900" : "flex items-center justify-between text-sm"}>
      <div className={props.strong ? "text-gray-800" : "text-gray-700"}>{props.label}</div>
      <div className="tabular">{props.value}</div>
    </div>
  );
}

const printCss = `
.print-root { background: transparent; }
.print-paper { background: white; color: #111827; border: 1px solid #E5E7EB; border-radius: 16px; padding: 10mm; }
.print-thermal .print-paper { width: 80mm; margin: 0 auto; border-radius: 10px; }
.print-a4 .print-paper { max-width: 210mm; margin: 0 auto; }
.tabular { font-variant-numeric: tabular-nums; }
.no-print { }
@media print {
  body * { visibility: hidden !important; }
  .print-paper, .print-paper * { visibility: visible !important; }
  .print-paper { position: absolute; left: 0; top: 0; }
  .no-print { display: none !important; }
  body { background: white !important; }
  .print-paper { border: none !important; border-radius: 0 !important; padding: 0 !important; }
  .print-thermal .print-paper { width: 80mm !important; }
  @page { margin: 10mm; }
}
`;

