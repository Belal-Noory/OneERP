import { getRequestLocale } from "@/lib/locale";
import { getApiBaseUrl } from "@/lib/api";
import { t as translate } from "@oneerp/i18n";
import { ModuleTrainingSection } from "@/components/ModuleTrainingSection";
import { cookies } from "next/headers";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };
type SummaryResponse = {
  data: {
    todayIncome: string;
    todayExpenses: string;
    monthlyRevenue: string;
    pendingPayments: number;
    pendingJobs: number;
    completedJobs: number;
    urgentOrders: number;
    lowStockAlerts: number;
    profitSummary: string;
    taxSummary: string;
  };
};

type TrendsResponse = {
  data: {
    days: number;
    from: string | null;
    to: string | null;
    items: Array<{ date: string; revenue: string; expenses: string }>;
  };
};

type AnalyticsResponse = {
  data: {
    jobStatus: Array<{ status: string; count: number }>;
    topCustomers: Array<{ customerId: string | null; fullName: string; companyName: string | null; invoicesCount: number; totalInvoiced: string }>;
  };
};

type InventoryUsageResponse = {
  data: {
    days: number;
    from: string;
    to: string;
    items: Array<{ category: string; amount: string }>;
    total: string;
  };
};

function joinUrl(base: string, path: string): string {
  if (path.startsWith("http")) return path;
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (b.endsWith("/api") && (p === "/api" || p.startsWith("/api/"))) {
    return `${b.slice(0, -4)}${p}`;
  }
  return `${b}${p}`;
}

export default async function PrintPressPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  const apiBaseUrl = getApiBaseUrl();
  const cookieHeader = (await cookies()).toString();

  let summary: SummaryResponse["data"] | null = null;
  let trends: TrendsResponse["data"] | null = null;
  let analytics: AnalyticsResponse["data"] | null = null;
  let inventoryUsage: InventoryUsageResponse["data"] | null = null;
  try {
    const meRes = await fetch(joinUrl(apiBaseUrl, "/api/me"), { cache: "no-store", headers: cookieHeader ? { cookie: cookieHeader } : {} });
    const meJson = (await meRes.json().catch(() => null)) as MeResponse | null;
    const membership = meRes.ok ? (meJson?.data?.memberships ?? []).find((m) => m.tenantSlug === tenantSlug) ?? null : null;
    const tenantId = membership?.tenantId ?? null;
    if (tenantId) {
      const sumRes = await fetch(joinUrl(apiBaseUrl, "/api/printpress/dashboard/summary"), {
        cache: "no-store",
        headers: { ...(cookieHeader ? { cookie: cookieHeader } : {}), "X-Tenant-Id": tenantId }
      });
      const sumJson = (await sumRes.json().catch(() => null)) as SummaryResponse | null;
      if (sumRes.ok && sumJson?.data) summary = sumJson.data;

      const trendsRes = await fetch(joinUrl(apiBaseUrl, "/api/printpress/dashboard/trends?days=30"), {
        cache: "no-store",
        headers: { ...(cookieHeader ? { cookie: cookieHeader } : {}), "X-Tenant-Id": tenantId }
      });
      const trendsJson = (await trendsRes.json().catch(() => null)) as TrendsResponse | null;
      if (trendsRes.ok && trendsJson?.data) trends = trendsJson.data;

      const analyticsRes = await fetch(joinUrl(apiBaseUrl, "/api/printpress/dashboard/analytics"), {
        cache: "no-store",
        headers: { ...(cookieHeader ? { cookie: cookieHeader } : {}), "X-Tenant-Id": tenantId }
      });
      const analyticsJson = (await analyticsRes.json().catch(() => null)) as AnalyticsResponse | null;
      if (analyticsRes.ok && analyticsJson?.data) analytics = analyticsJson.data;

      const invRes = await fetch(joinUrl(apiBaseUrl, "/api/printpress/dashboard/inventory-usage?days=30"), {
        cache: "no-store",
        headers: { ...(cookieHeader ? { cookie: cookieHeader } : {}), "X-Tenant-Id": tenantId }
      });
      const invJson = (await invRes.json().catch(() => null)) as InventoryUsageResponse | null;
      if (invRes.ok && invJson?.data) inventoryUsage = invJson.data;
    }
  } catch {
    summary = null;
    trends = null;
    analytics = null;
    inventoryUsage = null;
  }

  const trendItems = trends?.items ?? [];
  const revenueValues = trendItems.map((i) => Number(i.revenue) || 0);
  const expenseValues = trendItems.map((i) => Number(i.expenses) || 0);

  function buildSparkline(values: number[], width: number, height: number, padding: number): string {
    if (!values.length) return "";
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = Math.max(1, max - min);
    const usableW = Math.max(1, width - padding * 2);
    const usableH = Math.max(1, height - padding * 2);
    return values
      .map((v, idx) => {
        const x = padding + (idx / Math.max(1, values.length - 1)) * usableW;
        const y = padding + (1 - (v - min) / range) * usableH;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }

  const revenuePoints = buildSparkline(revenueValues, 520, 140, 10);
  const expensePoints = buildSparkline(expenseValues, 520, 140, 10);

  const jobStatusItems = analytics?.jobStatus ?? [];
  const maxJobCount = Math.max(1, ...jobStatusItems.map((s) => s.count));

  const topCustomers = analytics?.topCustomers ?? [];
  const maxCustomerTotal = Math.max(1, ...topCustomers.map((c) => Number(c.totalInvoiced) || 0));

  const inventoryItems = inventoryUsage?.items ?? [];
  const maxInventory = Math.max(1, ...inventoryItems.map((i) => Number(i.amount) || 0));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
          <div className="text-lg font-semibold">{t("app.printpress.dashboard.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.printpress.dashboard.subtitle")}</div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[
              ["app.printpress.dashboard.kpi.todayIncome", summary?.todayIncome ?? "0"],
              ["app.printpress.dashboard.kpi.todayExpenses", summary?.todayExpenses ?? "0"],
              ["app.printpress.dashboard.kpi.monthlyRevenue", summary?.monthlyRevenue ?? "0"],
              ["app.printpress.dashboard.kpi.pendingPayments", String(summary?.pendingPayments ?? 0)],
              ["app.printpress.dashboard.kpi.pendingJobs", String(summary?.pendingJobs ?? 0)],
              ["app.printpress.dashboard.kpi.completedJobs", String(summary?.completedJobs ?? 0)],
              ["app.printpress.dashboard.kpi.urgentOrders", String(summary?.urgentOrders ?? 0)],
              ["app.printpress.dashboard.kpi.lowStockAlerts", String(summary?.lowStockAlerts ?? 0)],
              ["app.printpress.dashboard.kpi.profitSummary", summary?.profitSummary ?? "0"],
              ["app.printpress.dashboard.kpi.taxSummary", summary?.taxSummary ?? "0"]
            ].map(([labelKey, value]) => (
              <div key={labelKey} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="text-xs font-medium text-gray-700">{t(labelKey)}</div>
                <div className="mt-1 text-xl font-semibold text-gray-900">{value}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
          <div className="text-lg font-semibold">{t("app.printpress.dashboard.next.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.printpress.dashboard.next.subtitle")}</div>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {[
              ["app.printpress.tab.jobs", "jobs"],
              ["app.printpress.tab.customers", "customers"],
              ["app.printpress.tab.quotations", "quotations"],
              ["app.printpress.tab.invoices", "invoices"]
            ].map(([labelKey, path]) => (
              <a
                key={path}
                href={`/t/${tenantSlug}/printpress/${path}`}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                {t(labelKey)}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
          <div className="text-lg font-semibold">{t("app.printpress.dashboard.chart.revenueTrends")}</div>
          <div className="mt-1 text-sm text-gray-700">{trends?.from && trends?.to ? `${trends.from} → ${trends.to}` : ""}</div>
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <svg viewBox="0 0 520 140" className="h-[140px] w-full">
              <polyline points={revenuePoints} fill="none" stroke="#2563eb" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
          <div className="text-lg font-semibold">{t("app.printpress.dashboard.chart.expenseTrends")}</div>
          <div className="mt-1 text-sm text-gray-700">{trends?.from && trends?.to ? `${trends.from} → ${trends.to}` : ""}</div>
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
            <svg viewBox="0 0 520 140" className="h-[140px] w-full">
              <polyline points={expensePoints} fill="none" stroke="#dc2626" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
          <div className="text-lg font-semibold">{t("app.printpress.dashboard.chart.jobStatusAnalytics")}</div>
          <div className="mt-4 space-y-2">
            {jobStatusItems.length === 0 ? (
              <div className="text-sm text-gray-600">{t("app.printpress.placeholder")}</div>
            ) : (
              jobStatusItems.map((s) => (
                <div key={s.status} className="flex items-center gap-3">
                  <div className="w-44 shrink-0 text-sm text-gray-700">{t(`app.printpress.jobs.status.${s.status}`)}</div>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                    <div className="h-3 rounded-full bg-primary-600" style={{ width: `${Math.max(3, Math.round((s.count / maxJobCount) * 100))}%` }} />
                  </div>
                  <div className="w-12 shrink-0 text-right text-sm font-medium text-gray-900 tabular">{s.count}</div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
          <div className="text-lg font-semibold">{t("app.printpress.dashboard.chart.customerAnalytics")}</div>
          <div className="mt-4 space-y-2">
            {topCustomers.length === 0 ? (
              <div className="text-sm text-gray-600">{t("app.printpress.placeholder")}</div>
            ) : (
              topCustomers.map((c) => {
                const total = Number(c.totalInvoiced) || 0;
                const pct = Math.max(3, Math.round((total / maxCustomerTotal) * 100));
                return (
                  <div key={c.customerId ?? c.fullName} className="flex items-center gap-3">
                    <div className="w-44 shrink-0">
                      <div className="truncate text-sm font-medium text-gray-900">{c.fullName}</div>
                      <div className="truncate text-xs text-gray-600">{c.companyName ?? " "}</div>
                    </div>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                      <div className="h-3 rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="w-24 shrink-0 text-right text-sm font-medium text-gray-900 tabular">{c.totalInvoiced}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="text-lg font-semibold">{t("app.printpress.dashboard.chart.inventoryUsageAnalytics")}</div>
        <div className="mt-1 text-sm text-gray-700">{inventoryUsage?.from && inventoryUsage?.to ? `${inventoryUsage.from} → ${inventoryUsage.to}` : ""}</div>
        <div className="mt-4 space-y-2">
          {inventoryItems.length === 0 ? (
            <div className="text-sm text-gray-600">{t("app.printpress.placeholder")}</div>
          ) : (
            inventoryItems.map((it) => (
              <div key={it.category} className="flex items-center gap-3">
                <div className="w-44 shrink-0 text-sm text-gray-700">{it.category}</div>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-3 rounded-full bg-amber-500" style={{ width: `${Math.max(3, Math.round(((Number(it.amount) || 0) / maxInventory) * 100))}%` }} />
                </div>
                <div className="w-20 shrink-0 text-right text-sm font-medium text-gray-900 tabular">{it.amount}</div>
              </div>
            ))
          )}
        </div>
      </div>

      <ModuleTrainingSection moduleId="printpress" />
    </div>
  );
}
