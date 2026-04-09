"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type SupplierResponse = {
  data: {
    id: string;
    name: string;
  };
};

type LedgerItem = { time: string; type: string; ref: string; method: string | null; debit: string; credit: string; balance: string };
type LedgerResponse = { data: { openingBalance: string; closingBalance: string; items: LedgerItem[] } };

export function PharmacySupplierLedgerClient(props: { tenantSlug: string; supplierId: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [supplier, setSupplier] = useState<SupplierResponse["data"] | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse["data"] | null>(null);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (from.trim()) p.set("from", from.trim());
    if (to.trim()) p.set("to", to.trim());
    return p;
  }, [from, to]);

  useEffect(() => {
    let cancelled = false;
    async function loadTenantId() {
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
    void loadTenantId();
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
        const [sRes, lRes] = await Promise.all([
          apiFetch(`/api/pharmacy/suppliers/${props.supplierId}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } }),
          apiFetch(`/api/pharmacy/suppliers/${props.supplierId}/ledger?${queryParams.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } })
        ]);

        const sJson = (await sRes.json()) as SupplierResponse | { error?: { message_key?: string } };
        if (!sRes.ok) {
          setErrorKey((sJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }

        const lJson = (await lRes.json()) as LedgerResponse | { error?: { message_key?: string } };
        if (!lRes.ok) {
          setErrorKey((lJson as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }

        if (!cancelled) {
          setSupplier((sJson as SupplierResponse).data);
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
              <Link className="text-sm font-medium text-gray-600 hover:text-gray-900" href={`/t/${props.tenantSlug}/pharmacy/suppliers`}>
                {t("app.pharmacy.suppliers.back")}
              </Link>
              <div className="text-sm text-gray-500">/</div>
              <div className="truncate text-2xl font-semibold text-gray-900">{supplier.name}</div>
            </div>
            <div className="mt-2 text-sm text-gray-700">{t("app.pharmacy.supplierLedger.subtitle")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div className="text-xs font-medium text-gray-600">{t("app.pharmacy.supplierLedger.balance")}</div>
              <div className="mt-1 text-lg font-semibold text-gray-900 tabular">{ledger.closingBalance}</div>
            </div>
            <div className="relative">
              <button
                type="button"
                disabled={!tenantId || exportingXlsx}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                onClick={() => setExportMenuOpen((v) => !v)}
              >
                {exportingXlsx ? t("common.working") : t("app.shop.reports.export.button")}
              </button>
              {exportMenuOpen ? (
                <div className="absolute right-0 z-20 mt-2 w-56 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-lg">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50"
                    onClick={async () => {
                      if (!tenantId) return;
                      setExportingXlsx(true);
                      setErrorKey(null);
                      try {
                        try {
                          const threshold = `from=${from.trim() || ""};to=${to.trim() || ""};supplierId=${props.supplierId}`;
                          await apiFetch("/api/pharmacy/reports/export-log", {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                            body: JSON.stringify({ reportId: "pharmacy.supplierLedger.v1", format: "xlsx", threshold })
                          });
                        } catch {}
                        const XLSX = await import("xlsx");
                        const wb = XLSX.utils.book_new();
                        const summaryAoA = [
                          ["Pharmacy supplier ledger"],
                          ["Exported at", new Date().toISOString()],
                          ["Supplier", supplier.name],
                          ["From", from.trim() || ""],
                          ["To", to.trim() || ""],
                          ["Opening", ledger.openingBalance],
                          ["Closing", ledger.closingBalance]
                        ];
                        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryAoA), "Summary");
                        const header = ["Time", "Type", "Ref", "Method", "Debit", "Credit", "Balance"];
                        const rows = ledger.items.map((i) => [new Date(i.time).toISOString(), i.type, i.ref, i.method ?? "", i.debit, i.credit, i.balance]);
                        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...rows]), "Ledger");
                        const safeDate = new Date().toISOString().slice(0, 10);
                        XLSX.writeFile(wb, `pharmacy_supplier_ledger_${safeDate}.xlsx`);
                      } catch {
                        setErrorKey("errors.internal");
                      } finally {
                        setExportingXlsx(false);
                        setExportMenuOpen(false);
                      }
                    }}
                  >
                    <span className="inline-block h-4 w-4 text-gray-600">
                      <svg viewBox="0 0 24 24" fill="none">
                        <path d="M7 3h10v18H7V3Zm2 4h6M9 11h6M9 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    {t("app.shop.reports.export.excel")}
                  </button>
                  <a className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/suppliers/${props.supplierId}/ledger/print?paper=a4&from=${encodeURIComponent(from.trim())}&to=${encodeURIComponent(to.trim())}`} target="_blank" rel="noreferrer">
                    {t("app.shop.reports.export.printView")}
                  </a>
                  <a className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/suppliers/${props.supplierId}/ledger/print?paper=a4&download=pdf&from=${encodeURIComponent(from.trim())}&to=${encodeURIComponent(to.trim())}`} target="_blank" rel="noreferrer">
                    {t("app.shop.reports.export.pdfA4")}
                  </a>
                  <a className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/suppliers/${props.supplierId}/ledger/print?paper=thermal80&download=pdf&from=${encodeURIComponent(from.trim())}&to=${encodeURIComponent(to.trim())}`} target="_blank" rel="noreferrer">
                    {t("app.shop.reports.export.pdf80")}
                  </a>
                  <a className="flex w-full items-center gap-2 px-3 py-2 text-sm text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/pharmacy/suppliers/${props.supplierId}/ledger/print?paper=thermal58&download=pdf&from=${encodeURIComponent(from.trim())}&to=${encodeURIComponent(to.trim())}`} target="_blank" rel="noreferrer">
                    {t("app.shop.reports.export.pdf58")}
                  </a>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.supplierLedger.filter.from")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={from} onChange={(e) => setFrom(e.target.value)} placeholder="YYYY-MM-DD" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.pharmacy.supplierLedger.filter.to")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={to} onChange={(e) => setTo(e.target.value)} placeholder="YYYY-MM-DD" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.supplierLedger.table.time")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.supplierLedger.table.type")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.supplierLedger.table.ref")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left text-sm font-medium text-gray-900">{t("app.pharmacy.supplierLedger.table.method")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.pharmacy.supplierLedger.table.debit")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.pharmacy.supplierLedger.table.credit")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right text-sm font-medium text-gray-900">{t("app.pharmacy.supplierLedger.table.balance")}</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr>
                <td className="border-b border-gray-100 px-4 py-3 text-gray-700" colSpan={4}>
                  {t("app.pharmacy.supplierLedger.opening")}
                </td>
                <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-700">—</td>
                <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-700">—</td>
                <td className="border-b border-gray-100 px-4 py-3 text-right font-medium text-gray-900">{ledger.openingBalance}</td>
              </tr>
              {ledger.items.map((i, idx) => (
                <tr key={`${i.time}:${idx}`}>
                  <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{new Date(i.time).toLocaleString()}</td>
                  <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{i.type}</td>
                  <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{i.ref}</td>
                  <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{i.method ?? "—"}</td>
                  <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-700">{i.debit}</td>
                  <td className="border-b border-gray-100 px-4 py-3 text-right text-gray-700">{i.credit}</td>
                  <td className="border-b border-gray-100 px-4 py-3 text-right font-medium text-gray-900">{i.balance}</td>
                </tr>
              ))}
              <tr>
                <td className="px-4 py-3 text-gray-700" colSpan={6}>
                  {t("app.pharmacy.supplierLedger.closing")}
                </td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">{ledger.closingBalance}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
