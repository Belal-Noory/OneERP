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

type PurchaseResponse = {
  data: {
    id: string;
    kind: "purchase" | "refund";
    status: "draft" | "posted" | "void";
    purchaseNumber: string | null;
    refundOf: { id: string; purchaseNumber: string | null } | null;
    supplier: { id: string; name: string } | null;
    location: { id: string; name: string };
    currencyCode: string;
    notes: string | null;
    subtotal: string;
    paidTotal: string;
    createdAt: string;
    postedAt: string | null;
    lines: {
      id: string;
      product: { id: string; name: string; sku: string | null; unit: { id: string; name: string; symbol: string | null } | null };
      quantity: string;
      receivedQty: string;
      unitCost: string;
      lineTotal: string;
    }[];
  };
};

type Paper = "a4" | "thermal80" | "thermal58";

function isThermal(p: Paper): p is "thermal80" | "thermal58" {
  return p === "thermal80" || p === "thermal58";
}

export function PrintPurchaseInvoiceClient(props: { tenantSlug: string; purchaseId: string }) {
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
  const [purchase, setPurchase] = useState<PurchaseResponse["data"] | null>(null);
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

        const [tenantRes, purchaseRes] = await Promise.all([
          apiFetch("/api/tenants/current", { cache: "no-store", headers: { "X-Tenant-Id": membership.tenantId } }),
          apiFetch(`/api/shop/purchases/${props.purchaseId}`, { cache: "no-store", headers: { "X-Tenant-Id": membership.tenantId } })
        ]);

        const tenantJson = (await tenantRes.json()) as TenantCurrentResponse;
        const purchaseJson = (await purchaseRes.json()) as PurchaseResponse | { error?: { message_key?: string } };
        if (!tenantRes.ok || !tenantJson.data) {
          setErrorKey("errors.internal");
          return;
        }
        if (!purchaseRes.ok) {
          setErrorKey((purchaseJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }

        if (!cancelled) {
          setTenant(tenantJson.data);
          setPurchase((purchaseJson as PurchaseResponse).data);
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
  }, [props.purchaseId, props.tenantSlug]);

  if (loading) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700">{t("common.loading")}</div>;
  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  if (!tenantId || !tenant || !purchase) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700">{t("errors.notFound")}</div>;

  const balance = Math.max(0, Number(purchase.subtotal) - Number(purchase.paidTotal)).toFixed(2);

  return (
    <div className="space-y-4">
      <div className="no-print rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.shop.purchase.print.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.shop.purchase.print.subtitle")}</div>
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
                  <div className="font-medium text-gray-900">{t(purchase.kind === "refund" ? "app.shop.purchaseRefund.print.doc" : "app.shop.purchase.print.doc")}</div>
                  <div className="mt-1">{purchase.purchaseNumber ?? "—"}</div>
                  <div className="mt-1">{new Date(purchase.createdAt).toLocaleString()}</div>
                </div>
              ) : null}
            </div>

            {isThermalPaper ? (
              <div className="mt-3 border-t border-dashed border-gray-300 pt-3 text-xs text-gray-700">
                <div className="font-medium text-gray-600">{t(purchase.kind === "refund" ? "app.shop.purchaseRefund.print.doc" : "app.shop.purchase.print.doc")}</div>
                <div className="font-semibold text-gray-900">{purchase.purchaseNumber ?? "—"}</div>
                <div className="mt-1">{new Date(purchase.createdAt).toLocaleString()}</div>
              </div>
            ) : null}
          </div>

          <div className={isThermalPaper ? "mt-4 text-xs" : "mt-6"}>
            <div className={isThermalPaper ? "border-t border-dashed border-gray-300 pt-3" : "grid gap-3 md:grid-cols-2"}>
              <KV label={t("app.shop.purchase.print.location")} value={purchase.location.name} />
              <KV label={t("app.shop.purchase.print.supplier")} value={purchase.supplier?.name ?? "—"} />
              <KV label={t("app.shop.purchase.print.status")} value={purchase.status} />
              {purchase.kind === "refund" && purchase.refundOf?.purchaseNumber ? <KV label={t("app.shop.purchaseRefund.print.refundOf")} value={purchase.refundOf.purchaseNumber} /> : null}
            </div>
          </div>

          <div className={isThermalPaper ? "mt-4 border-t border-dashed border-gray-300 pt-3 text-xs" : "mt-6"}>
            {purchase.lines.length === 0 ? (
              <div className="text-sm text-gray-600">{t("app.shop.purchase.lines.empty")}</div>
            ) : (
              <div className="space-y-2">
                {purchase.lines.map((l) => (
                  <div key={l.id} className={isThermalPaper ? "border-b border-dashed border-gray-200 pb-2" : "flex items-start justify-between gap-4"}>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">{l.product.name}</div>
                      <div className="mt-1 text-xs text-gray-600">
                        {t("app.shop.purchase.print.qty")}: <span className="tabular">{l.quantity}</span> · {t("app.shop.purchase.print.unitCost")}:{" "}
                        <span className="tabular">{formatMoney(l.unitCost, purchase.currencyCode)}</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-semibold text-gray-900 tabular">{formatMoney(l.lineTotal, purchase.currencyCode)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={isThermalPaper ? "mt-4 border-t border-dashed border-gray-300 pt-3 text-xs" : "mt-6"}>
            <Row label={t("app.shop.purchase.summary.total")} value={formatMoney(purchase.subtotal, purchase.currencyCode)} strong />
            <Row label={t("app.shop.purchase.summary.paid")} value={formatMoney(purchase.paidTotal, purchase.currencyCode)} />
            <Row label={t("app.shop.purchase.summary.balance")} value={formatMoney(balance, purchase.currencyCode)} />
          </div>

          {purchase.notes?.trim() ? (
            <div className={isThermalPaper ? "mt-4 border-t border-dashed border-gray-300 pt-3 text-xs" : "mt-6"}>
              <div className="text-xs font-medium text-gray-600">{t("app.shop.print.notes")}</div>
              <div className="mt-2 text-sm text-gray-900">{purchase.notes.trim()}</div>
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

function KV(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="text-gray-700">{props.label}</div>
      <div className="font-semibold text-gray-900">{props.value}</div>
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
