"use client";

import { useEffect, useState, useMemo } from "react";
import { useClientI18n } from "@/lib/client-i18n";
import { apiFetch } from "@/lib/auth-fetch";
import Link from "next/link";
import { ModuleTrainingSection } from "@/components/ModuleTrainingSection";

type Tank = {
  id: string;
  name: string;
  fuelType: string;
  capacity: string;
  currentVolume: string;
};

type Sale = {
  id: string;
  volume: string;
  totalAmount: string;
  createdAt: string;
  nozzle: { name: string; tank: { fuelType: string } };
};

type MeResponse = {
  data: {
    memberships: {
      tenantId: string;
      tenantSlug: string;
    }[];
  };
};

export function FuelOverviewClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadTenant() {
      try {
        const meRes = await apiFetch("/api/me", { cache: "no-store" });
        if (!meRes.ok) return;
        const me = (await meRes.json()) as MeResponse;
        const membership = me.data?.memberships?.find((m) => m.tenantSlug === props.tenantSlug) ?? null;
        if (!membership) return;
        if (!cancelled) setTenantId(membership.tenantId);
      } catch (err) { console.error(err); }
    }
    void loadTenant();
    return () => { cancelled = true; };
  }, [props.tenantSlug]);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    async function loadData() {
      setLoading(true);
      try {
        const [tanksRes, salesRes] = await Promise.all([
          apiFetch("/api/fuel/tanks", { headers: { "X-Tenant-Id": tenantId as string }, cache: "no-store" }),
          apiFetch("/api/fuel/sales", { headers: { "X-Tenant-Id": tenantId as string }, cache: "no-store" })
        ]);
        if (!cancelled) {
          if (tanksRes.ok) setTanks((await tanksRes.json()).data);
          if (salesRes.ok) setSales((await salesRes.json()).data.slice(0, 10));
        }
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    }
    void loadData();
    return () => { cancelled = true; };
  }, [tenantId]);

  const stats = useMemo(() => {
    const totalVolume = tanks.reduce((acc, t) => acc + Number(t.currentVolume), 0);
    const totalCapacity = tanks.reduce((acc, t) => acc + Number(t.capacity), 0);
    const lowStockCount = tanks.filter(t => (Number(t.currentVolume) / Number(t.capacity)) < 0.2).length;
    const todaySales = sales.filter(s => new Date(s.createdAt).toDateString() === new Date().toDateString());
    const salesAmount = todaySales.reduce((acc, s) => acc + Number(s.totalAmount), 0);
    
    return { totalVolume, totalCapacity, lowStockCount, salesAmount, salesCount: todaySales.length };
  }, [tanks, sales]);

  if (loading && !tanks.length) {
    return <div className="py-20 text-center text-gray-500">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-600 to-primary-800 p-8 text-white shadow-xl shadow-primary-900/10">
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Fuel Station Command Center</h1>
            <p className="text-primary-100/80 max-w-md">Monitor real-time tank levels, manage shifts, and track sales throughput across all pump islands.</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <Link 
              href={`/t/${props.tenantSlug}/fuel/sales`}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-6 text-sm font-bold text-primary-700 shadow-sm transition-transform hover:scale-105 active:scale-95"
            >
              Log New Sale
            </Link>
            <Link 
              href={`/t/${props.tenantSlug}/fuel/shifts`}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-500 px-6 text-sm font-bold text-white shadow-sm ring-1 ring-inset ring-primary-400/50 transition-transform hover:scale-105 active:scale-95"
            >
              Manage Shifts
            </Link>
          </div>
        </div>
        {/* Background decorative elements */}
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/5" />
        <div className="absolute -bottom-20 left-20 h-48 w-48 rounded-full bg-white/5" />
      </div>

      {/* KPI Stats Grid */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard 
          title="Daily Revenue" 
          value={`${stats.salesAmount.toLocaleString()} AFN`} 
          subtitle={`${stats.salesCount} Sales Today`}
          icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m.599-1.001l.401.401M12 16h-1.101" /></svg>}
          color="bg-green-50 text-green-600"
        />
        <KPICard 
          title="Total Fuel Stock" 
          value={`${stats.totalVolume.toLocaleString()} L`} 
          subtitle={`${Math.round((stats.totalVolume / stats.totalCapacity) * 100)}% Overall Capacity`}
          icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>}
          color="bg-blue-50 text-blue-600"
        />
        <KPICard 
          title="Low Stock Tanks" 
          value={stats.lowStockCount.toString()} 
          subtitle="Critical levels detected"
          icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
          color={stats.lowStockCount > 0 ? "bg-red-50 text-red-600 animate-pulse" : "bg-gray-50 text-gray-600"}
        />
        <KPICard 
          title="Active Shifts" 
          value="2" 
          subtitle="Currently running islands"
          icon={<svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          color="bg-amber-50 text-amber-600"
        />
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Quick Actions Panel */}
        <div className="lg:col-span-1 space-y-6">
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Quick Management</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <QuickAction label="Tanks" href={`/t/${props.tenantSlug}/fuel/tanks`} icon="🛢️" />
              <QuickAction label="Pumps" href={`/t/${props.tenantSlug}/fuel/pumps`} icon="⛽" />
              <QuickAction label="Sales" href={`/t/${props.tenantSlug}/fuel/sales`} icon="🧾" />
              <QuickAction label="Reports" href={`/t/${props.tenantSlug}/fuel/reports`} icon="📊" />
              <QuickAction label="Fleet" href={`/t/${props.tenantSlug}/fuel/credit`} icon="🚛" />
            </div>
          </section>

          {/* Tank Status Mini-list */}
          <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Tank Inventory</h2>
            <div className="mt-4 space-y-4">
              {tanks.slice(0, 4).map(t => {
                const p = (Number(t.currentVolume) / Number(t.capacity)) * 100;
                return (
                  <div key={t.id} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span className="text-gray-900">{t.name}</span>
                      <span className={p < 20 ? "text-red-600" : "text-gray-500"}>{Math.round(p)}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                      <div className={`h-full transition-all duration-500 ${p < 20 ? "bg-red-500" : "bg-primary-500"}`} style={{ width: `${Math.min(100, p)}%` }} />
                    </div>
                  </div>
                );
              })}
              <Link href={`/t/${props.tenantSlug}/fuel/tanks`} className="mt-4 block text-center text-xs font-bold text-primary-600 hover:text-primary-700">View All Tanks →</Link>
            </div>
          </section>
        </div>

        {/* Recent Activity Panel */}
        <div className="lg:col-span-2 rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 bg-gray-50/50 px-6 py-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">Recent Sales Activity</h2>
            <Link href={`/t/${props.tenantSlug}/fuel/sales`} className="text-xs font-bold text-primary-600 hover:text-primary-700">Full History</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/50 text-gray-500">
                <tr>
                  <th className="px-6 py-3 font-medium">Time</th>
                  <th className="px-6 py-3 font-medium">Nozzle</th>
                  <th className="px-6 py-3 font-medium text-right">Volume</th>
                  <th className="px-6 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sales.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-12 text-center text-gray-500 italic">No sales recorded today.</td></tr>
                ) : (
                  sales.map((s) => (
                    <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{new Date(s.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-tighter">{new Date(s.createdAt).toLocaleDateString()}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{s.nozzle.name}</div>
                        <div className="text-xs text-gray-500">{s.nozzle.tank.fuelType}</div>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-gray-700 tabular-nums">{s.volume} L</td>
                      <td className="px-6 py-4 text-right">
                        <span className="inline-flex items-center rounded-lg bg-primary-50 px-2 py-1 text-xs font-bold text-primary-700 ring-1 ring-inset ring-primary-700/10 tabular-nums">
                          {s.totalAmount}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <ModuleTrainingSection moduleId="fuel" />
    </div>
  );
}

function KPICard({ title, value, subtitle, icon, color }: { title: string, value: string, subtitle: string, icon: React.ReactNode, color: string }) {
  return (
    <div className="group rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className={`rounded-xl p-2.5 ${color} shadow-sm ring-1 ring-inset ring-black/5`}>
          {icon}
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{title}</p>
          <p className="mt-1 text-xl font-black text-gray-900 tabular-nums">{value}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1.5 text-xs text-gray-500">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        {subtitle}
      </div>
    </div>
  );
}

function QuickAction({ label, href, icon }: { label: string, href: string, icon: string }) {
  return (
    <Link 
      href={href} 
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-100 bg-gray-50/50 p-4 transition-all hover:border-primary-200 hover:bg-primary-50/50 hover:shadow-sm"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-xs font-bold text-gray-700">{label}</span>
    </Link>
  );
}
