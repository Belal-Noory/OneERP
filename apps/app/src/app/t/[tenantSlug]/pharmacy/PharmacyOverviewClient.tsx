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

type OverviewResponse = {
  data: {
    counts: { productsActive: number; productsArchived: number; categories: number; suppliers: number; locations: number };
    expiries: { nearDays: number; nearLots: number; expiredLots: number };
    salesToday: { count: number; total: string; currency: string };
    currencies: { base: string; sell: string; buy: string };
    recentMedicines: { id: string; name: string; sellPrice: string; createdAt: string }[];
  };
};

export function PharmacyOverviewClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewResponse["data"] | null>(null);

  const steps = useMemo(
    () => [
      { title: t("app.pharmacy.overview.guide.step1.title"), desc: t("app.pharmacy.overview.guide.step1.desc"), href: `/t/${props.tenantSlug}/pharmacy/settings` },
      { title: t("app.pharmacy.overview.guide.step2.title"), desc: t("app.pharmacy.overview.guide.step2.desc"), href: `/t/${props.tenantSlug}/pharmacy/medicines` },
      { title: t("app.pharmacy.overview.guide.step3.title"), desc: t("app.pharmacy.overview.guide.step3.desc"), href: `/t/${props.tenantSlug}/pharmacy/purchases` },
      { title: t("app.pharmacy.overview.guide.step4.title"), desc: t("app.pharmacy.overview.guide.step4.desc"), href: `/t/${props.tenantSlug}/pharmacy/reports/expiry` }
    ],
    [props.tenantSlug, t]
  );

  const quickLinks = useMemo(
    () => [
      { href: `/t/${props.tenantSlug}/pharmacy/pos`, title: t("app.pharmacy.card.pos.title"), subtitle: t("app.pharmacy.card.pos.subtitle"), icon: <IconScan /> },
      { href: `/t/${props.tenantSlug}/pharmacy/sales`, title: t("app.pharmacy.card.sales.title"), subtitle: t("app.pharmacy.card.sales.subtitle"), icon: <IconReceipt /> },
      { href: `/t/${props.tenantSlug}/pharmacy/medicines`, title: t("app.pharmacy.card.medicines.title"), subtitle: t("app.pharmacy.card.medicines.subtitle"), icon: <IconPill /> },
      { href: `/t/${props.tenantSlug}/pharmacy/inventory`, title: t("app.pharmacy.card.inventory.title"), subtitle: t("app.pharmacy.card.inventory.subtitle"), icon: <IconBoxes /> },
      { href: `/t/${props.tenantSlug}/pharmacy/purchases`, title: t("app.pharmacy.card.purchases.title"), subtitle: t("app.pharmacy.card.purchases.subtitle"), icon: <IconTruck /> },
      { href: `/t/${props.tenantSlug}/pharmacy/suppliers`, title: t("app.pharmacy.card.suppliers.title"), subtitle: t("app.pharmacy.card.suppliers.subtitle"), icon: <IconUsers /> },
      { href: `/t/${props.tenantSlug}/pharmacy/reports`, title: t("app.pharmacy.card.reports.title"), subtitle: t("app.pharmacy.card.reports.subtitle"), icon: <IconChart /> },
      { href: `/t/${props.tenantSlug}/pharmacy/settings`, title: t("app.pharmacy.card.settings.title"), subtitle: t("app.pharmacy.card.settings.subtitle"), icon: <IconCog /> }
    ],
    [props.tenantSlug, t]
  );

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
    async function loadOverview() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const res = await apiFetch("/api/pharmacy/overview", { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as OverviewResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        if (!cancelled) setOverview((json as OverviewResponse).data);
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadOverview();
    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;

  const counts = overview?.counts ?? { productsActive: 0, productsArchived: 0, categories: 0, suppliers: 0, locations: 0 };
  const expiries = overview?.expiries ?? { nearDays: 30, nearLots: 0, expiredLots: 0 };
  const salesToday = overview?.salesToday ?? { count: 0, total: "0", currency: "USD" };
  const currencies = overview?.currencies ?? { base: "USD", sell: "USD", buy: "USD" };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-primary-50 p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.pharmacy.overview.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.pharmacy.overview.subtitle")}</div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800" href={`/t/${props.tenantSlug}/pharmacy/pos`}>
              {t("app.pharmacy.overview.cta.pos")}
            </Link>
            <Link className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/medicines`}>
              {t("app.pharmacy.overview.cta.medicines")}
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white/70 p-4">
            <div className="text-xs font-medium text-gray-600">{t("app.pharmacy.overview.currency.base")}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{currencies.base}</div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white/70 p-4">
            <div className="text-xs font-medium text-gray-600">{t("app.pharmacy.overview.currency.sell")}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{currencies.sell}</div>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white/70 p-4">
            <div className="text-xs font-medium text-gray-600">{t("app.pharmacy.overview.currency.buy")}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{currencies.buy}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={<IconPill />} label={t("app.pharmacy.overview.stat.medicines")} value={String(counts.productsActive)} hint={t("app.pharmacy.overview.stat.medicinesHint")} />
        <StatCard
          icon={<IconAlert />}
          label={t("app.pharmacy.overview.stat.nearExpiry")}
          value={String(expiries.nearLots)}
          hint={`${t("app.pharmacy.overview.stat.nearExpiryHint")} ${expiries.nearDays}`}
        />
        <StatCard icon={<IconExpired />} label={t("app.pharmacy.overview.stat.expired")} value={String(expiries.expiredLots)} hint={t("app.pharmacy.overview.stat.expiredHint")} tone={expiries.expiredLots > 0 ? "danger" : "neutral"} />
        <StatCard
          icon={<IconCash />}
          label={t("app.pharmacy.overview.stat.salesToday")}
          value={formatMoney(salesToday.total, salesToday.currency)}
          hint={`${t("app.pharmacy.overview.stat.salesTodayHint")} ${salesToday.count}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-lg font-semibold">{t("app.pharmacy.overview.recent.title")}</div>
              <div className="mt-1 text-sm text-gray-700">{t("app.pharmacy.overview.recent.subtitle")}</div>
            </div>
            <Link className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/medicines`}>
              {t("app.pharmacy.overview.recent.cta")}
            </Link>
          </div>

          <div className="mt-5 divide-y divide-gray-100">
            {loading && !overview ? (
              <div className="py-6 text-sm text-gray-600">{t("common.loading")}</div>
            ) : overview?.recentMedicines?.length ? (
              overview.recentMedicines.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">{p.name}</div>
                    <div className="mt-1 text-xs text-gray-500">{new Date(p.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="shrink-0 text-sm font-medium text-gray-900">{formatMoney(p.sellPrice, currencies.sell)}</div>
                </div>
              ))
            ) : (
              <div className="py-6 text-sm text-gray-600">{t("app.pharmacy.overview.recent.empty")}</div>
            )}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <QuickChip href={`/t/${props.tenantSlug}/pharmacy/reports/expiry`} label={t("app.pharmacy.overview.chip.expiry")} icon={<IconAlert />} />
            <QuickChip href={`/t/${props.tenantSlug}/pharmacy/reports/lot-trace`} label={t("app.pharmacy.overview.chip.lotTrace")} icon={<IconRoute />} />
            <QuickChip href={`/t/${props.tenantSlug}/pharmacy/inventory/lots`} label={t("app.pharmacy.overview.chip.lots")} icon={<IconBoxes />} />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
            <div className="text-lg font-semibold">{t("app.pharmacy.overview.guide.title")}</div>
            <div className="mt-2 text-sm text-gray-700">{t("app.pharmacy.overview.guide.subtitle")}</div>
            <div className="mt-5 space-y-3">
              {steps.map((s, idx) => (
                <Link key={idx} href={s.href} className="block rounded-2xl border border-gray-200 bg-gray-50 p-4 hover:bg-gray-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-900">{s.title}</div>
                      <div className="mt-1 text-sm text-gray-700">{s.desc}</div>
                    </div>
                    <div className="mt-0.5 shrink-0 text-primary-700">
                      <IconArrow />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-6">
              <Link className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700" href={`/t/${props.tenantSlug}/pharmacy/pos`}>
                {t("app.pharmacy.overview.cta.start")}
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
            <div className="text-sm font-semibold text-gray-900">{t("app.pharmacy.overview.highlights.title")}</div>
            <div className="mt-3 grid gap-3">
              <MiniStat label={t("app.pharmacy.overview.highlights.categories")} value={String(counts.categories)} />
              <MiniStat label={t("app.pharmacy.overview.highlights.suppliers")} value={String(counts.suppliers)} />
              <MiniStat label={t("app.pharmacy.overview.highlights.locations")} value={String(counts.locations)} />
              <MiniStat label={t("app.pharmacy.overview.highlights.archived")} value={String(counts.productsArchived)} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">{t("app.pharmacy.overview.actions.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.pharmacy.overview.actions.subtitle")}</div>
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {quickLinks.map((c) => (
            <Link key={c.href} href={c.href} className="rounded-2xl border border-gray-200 bg-white p-5 hover:bg-gray-50">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900">{c.title}</div>
                  <div className="mt-1 text-sm text-gray-700">{c.subtitle}</div>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">{c.icon}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatCard(props: { icon: React.ReactNode; label: string; value: string; hint: string; tone?: "neutral" | "danger" }) {
  const tone = props.tone ?? "neutral";
  const iconClass = tone === "danger" ? "bg-red-50 text-red-700" : "bg-primary-50 text-primary-700";
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-gray-700">{props.label}</div>
          <div className="mt-2 text-3xl font-semibold text-gray-900">{props.value}</div>
          <div className="mt-2 text-sm text-gray-600">{props.hint}</div>
        </div>
        <div className={["flex h-11 w-11 items-center justify-center rounded-2xl", iconClass].join(" ")}>{props.icon}</div>
      </div>
    </div>
  );
}

function MiniStat(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="text-sm text-gray-700">{props.label}</div>
      <div className="text-sm font-semibold text-gray-900 tabular">{props.value}</div>
    </div>
  );
}

function QuickChip(props: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link href={props.href} className="flex items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 hover:bg-gray-100">
      <div className="flex items-center gap-2">
        <span className="text-primary-700">{props.icon}</span>
        <span className="text-sm font-medium text-gray-900">{props.label}</span>
      </div>
      <span className="text-gray-500">
        <IconArrow />
      </span>
    </Link>
  );
}

function IconArrow() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 18 15 12 9 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconScan() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7V6a2 2 0 0 1 2-2h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M20 7V6a2 2 0 0 0-2-2h-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 17v1a2 2 0 0 0 2 2h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M20 17v1a2 2 0 0 1-2 2h-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconReceipt() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3h12v18l-2-1-2 1-2-1-2 1-2-1-2 1V3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 8h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconPill() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9.5 21a5.5 5.5 0 0 1 0-11h5a5.5 5.5 0 0 1 0 11h-5Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15.5 3a5.5 5.5 0 0 1 3.89 9.39l-7.78-7.78A5.48 5.48 0 0 1 15.5 3Z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconBoxes() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h8v14H4V7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 3h8v18h-8V3Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7 11h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M15 8h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconTruck() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 7h12v10H3V7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M15 10h4l2 3v4h-6v-7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M18 17a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 19V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 19h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8 15v-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 15V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 15v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCog() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M19.4 15a7.9 7.9 0 0 0 .1-1 7.9 7.9 0 0 0-.1-1l2-1.5-2-3.5-2.3.7a7.2 7.2 0 0 0-1.7-1L15 3h-6l-.4 2.2a7.2 7.2 0 0 0-1.7 1L4.6 5.5l-2 3.5 2 1.5a7.9 7.9 0 0 0-.1 1 7.9 7.9 0 0 0 .1 1l-2 1.5 2 3.5 2.3-.7a7.2 7.2 0 0 0 1.7 1L9 21h6l.4-2.2a7.2 7.2 0 0 0 1.7-1l2.3.7 2-3.5-2-1.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconAlert() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 9v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 17h.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M10.3 4.3 2.6 18a2 2 0 0 0 1.7 3h15.4a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IconExpired() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M18 3v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M4 8h16v13H4V8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 12l8 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 12l-8 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconCash() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16v10H4V7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 10h0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M17 14h0" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function IconRoute() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 15c0-6 12-1 12-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
