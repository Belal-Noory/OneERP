"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };

type AuditItem = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  actor: { id: string; fullName: string | null; email: string } | null;
  metadata: unknown;
};
type ListAuditResponse = { data: { items: AuditItem[]; total: number; page: number; pageSize: number } };

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return "";
  }
}

function truncateForExcel(v: string, max = 30000): string {
  if (!v) return "";
  return v.length > max ? v.slice(0, max - 3) + "..." : v;
}

export function MspAuditClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [pageSize, total]);

  const [qInput, setQInput] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [entityTypeInput, setEntityTypeInput] = useState("");
  const [fromInput, setFromInput] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [toInput, setToInput] = useState(() => new Date().toISOString().slice(0, 10));

  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [from, setFrom] = useState(fromInput);
  const [to, setTo] = useState(toInput);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("pageSize", String(pageSize));
    if (q.trim()) p.set("q", q.trim());
    if (action.trim()) p.set("action", action.trim());
    if (entityType.trim()) p.set("entityType", entityType.trim());
    if (from) p.set("from", new Date(from).toISOString());
    if (to) p.set("to", new Date(to + "T23:59:59.999Z").toISOString());
    return p.toString();
  }, [action, entityType, from, page, pageSize, q, to]);

  const loadTenant = useCallback(async () => {
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
      setTenantId(membership.tenantId);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, [props.tenantSlug]);

  useEffect(() => {
    void loadTenant();
  }, [loadTenant]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const res = await apiFetch(`/api/msp/audit?${queryString}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as ListAuditResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        if (!cancelled) {
          const data = (json as ListAuditResponse).data;
          setTotal(data.total ?? 0);
          setPage(data.page ?? page);
          setPageSize(data.pageSize ?? pageSize);
          setItems(data.items ?? []);
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
  }, [page, pageSize, queryString, tenantId]);

  const [items, setItems] = useState<AuditItem[]>([]);

  const fetchAll = useCallback(
    async (max = 5000): Promise<AuditItem[]> => {
      if (!tenantId) return [];
      const all: AuditItem[] = [];
      let currentPage = 1;
      while (all.length < max) {
        const p = new URLSearchParams();
        p.set("page", String(currentPage));
        p.set("pageSize", String(Math.min(200, max - all.length)));
        if (q.trim()) p.set("q", q.trim());
        if (action.trim()) p.set("action", action.trim());
        if (entityType.trim()) p.set("entityType", entityType.trim());
        if (from) p.set("from", new Date(from).toISOString());
        if (to) p.set("to", new Date(to + "T23:59:59.999Z").toISOString());

        const res = await apiFetch(`/api/msp/audit?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as ListAuditResponse;
        const batch = json.data.items ?? [];
        all.push(...batch);
        if (batch.length === 0) break;
        if (all.length >= (json.data.total ?? all.length)) break;
        currentPage += 1;
      }
      return all.slice(0, max);
    },
    [action, entityType, from, q, tenantId, to]
  );

  const exportXlsx = async () => {
    if (!tenantId) return;
    setExporting(true);
    setErrorKey(null);
    try {
      await apiFetch("/api/msp/audit/export-log", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({ format: "xlsx", q: q.trim() || undefined, action: action.trim() || undefined, entityType: entityType.trim() || undefined, from: from ? new Date(from).toISOString() : undefined, to: to ? new Date(to + "T23:59:59.999Z").toISOString() : undefined })
      });

      const rows = await fetchAll(5000);
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      const meta = XLSX.utils.aoa_to_sheet([
        [t("app.msp.audit.export.meta.exportedAt"), new Date().toISOString()],
        [t("app.msp.audit.export.meta.range"), `${from} → ${to}`],
        [t("app.msp.audit.export.meta.search"), q.trim()],
        [t("app.msp.audit.export.meta.action"), action.trim()],
        [t("app.msp.audit.export.meta.entityType"), entityType.trim()],
        [t("app.msp.audit.export.meta.total"), total],
        [t("app.msp.audit.export.meta.exported"), rows.length]
      ]);
      XLSX.utils.book_append_sheet(wb, meta, t("app.msp.audit.export.sheet.meta"));

      const sheet = XLSX.utils.aoa_to_sheet([
        [t("app.msp.audit.export.col.time"), t("app.msp.audit.export.col.actor"), t("app.msp.audit.export.col.actorEmail"), t("app.msp.audit.export.col.action"), t("app.msp.audit.export.col.entityType"), t("app.msp.audit.export.col.entityId"), t("app.msp.audit.export.col.metadata")],
        ...rows.map((r) => [r.createdAt, r.actor?.fullName ?? "", r.actor?.email ?? "", r.action, r.entityType ?? "", r.entityId ?? "", truncateForExcel(safeStringify(r.metadata))])
      ]);
      XLSX.utils.book_append_sheet(wb, sheet, t("app.msp.audit.export.sheet.audit"));

      XLSX.writeFile(wb, `msp_audit_${from}_${to}.xlsx`);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setExporting(false);
    }
  };

  if (errorKey) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-lg font-semibold">{t("app.msp.audit.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.msp.audit.subtitle")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={loading} className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" onClick={() => setPage(1)}>
              {t("common.button.refresh")}
            </button>
            <button type="button" disabled={exporting || !tenantId} className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60" onClick={() => void exportXlsx()}>
              {exporting ? t("common.working") : t("app.msp.audit.export.button")}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-6">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.audit.filter.search")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="msp.cash.movement.create" />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.audit.filter.action")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={actionInput} onChange={(e) => setActionInput(e.target.value)} placeholder="msp.exchange.ticket.create" />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.audit.filter.entityType")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" value={entityTypeInput} onChange={(e) => setEntityTypeInput(e.target.value)} placeholder="mspSettlement" />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => {
                setPage(1);
                setQ(qInput);
                setAction(actionInput);
                setEntityType(entityTypeInput);
              }}
            >
              {t("app.msp.audit.filter.apply")}
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-6">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.audit.filter.from")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-gray-500">{t("app.msp.audit.filter.to")}</label>
            <input className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => {
                setPage(1);
                setFrom(fromInput);
                setTo(toInput);
              }}
            >
              {t("app.msp.audit.filter.apply")}
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-white text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-4 py-3 text-left">{t("app.msp.audit.table.time")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.audit.table.actor")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.audit.table.action")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.audit.table.entity")}</th>
              <th className="px-4 py-3 text-left">{t("app.msp.audit.table.metadata")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  {t("common.loading")}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  {t("app.msp.audit.empty")}
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr key={it.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-700 tabular-nums">{new Date(it.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-900">{it.actor?.fullName ?? ""}</div>
                      <div className="truncate text-xs text-gray-500">{it.actor?.email ?? ""}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">{it.action}</td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="min-w-0">
                      <div className="truncate">{it.entityType ?? ""}</div>
                      <div className="truncate text-xs text-gray-500">{it.entityId ?? ""}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">
                    <div className="max-w-[480px] truncate font-mono text-xs">{safeStringify(it.metadata)}</div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex flex-col gap-3 border-t border-gray-200 p-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-gray-700">
            {t("app.msp.audit.pagination.showing")}{" "}
            <span className="font-semibold text-gray-900">
              {items.length === 0 ? 0 : (page - 1) * pageSize + 1}–{(page - 1) * pageSize + items.length}
            </span>{" "}
            {t("app.msp.audit.pagination.of")} <span className="font-semibold text-gray-900">{total}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              {t("common.pagination.prev")}
            </button>
            <div className="text-sm text-gray-700 tabular-nums">
              {page}/{totalPages}
            </div>
            <button type="button" className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
              {t("common.pagination.next")}
            </button>
            <select className="h-9 rounded-xl border border-gray-200 bg-white px-2 text-sm" value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))}>
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={String(n)}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

