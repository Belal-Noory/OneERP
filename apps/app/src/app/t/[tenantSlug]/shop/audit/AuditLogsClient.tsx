"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";

type MeResponse = {
  data: {
    memberships: { tenantId: string; tenantSlug: string }[];
  };
};

type AuditItem = {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  actor: { id: string; fullName: string | null; email: string | null } | null;
};

type ListAuditResponse = {
  data: { items: AuditItem[]; page: number; pageSize: number; total: number };
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function AuditLogsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "xlsx" | null>(null);

  const [qInput, setQInput] = useState("");
  const [actionInput, setActionInput] = useState("");
  const [entityTypeInput, setEntityTypeInput] = useState("");
  const [fromInput, setFromInput] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return isoDate(d);
  });
  const [toInput, setToInput] = useState(() => isoDate(new Date()));

  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [from, setFrom] = useState(fromInput);
  const [to, setTo] = useState(toInput);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [items, setItems] = useState<AuditItem[]>([]);
  const [total, setTotal] = useState(0);

  const [selected, setSelected] = useState<AuditItem | null>(null);

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
  }, [page, pageSize, q, action, entityType, from, to]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function logExport(format: "csv" | "xlsx") {
    if (!tenantId) return;
    try {
      await apiFetch("/api/shop/audit/export-log", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
        body: JSON.stringify({
          format,
          q: q.trim() || undefined,
          action: action.trim() || undefined,
          entityType: entityType.trim() || undefined,
          from: from ? new Date(from).toISOString() : undefined,
          to: to ? new Date(to + "T23:59:59.999Z").toISOString() : undefined
        })
      });
    } catch {}
  }

  async function fetchAll(maxRows: number): Promise<AuditItem[]> {
    if (!tenantId) return [];
    const out: AuditItem[] = [];
    let nextPage = 1;
    const pageSize = 100;
    while (out.length < maxRows) {
      const p = new URLSearchParams();
      p.set("page", String(nextPage));
      p.set("pageSize", String(pageSize));
      if (q.trim()) p.set("q", q.trim());
      if (action.trim()) p.set("action", action.trim());
      if (entityType.trim()) p.set("entityType", entityType.trim());
      if (from) p.set("from", new Date(from).toISOString());
      if (to) p.set("to", new Date(to + "T23:59:59.999Z").toISOString());

      const res = await apiFetch(`/api/shop/audit?${p.toString()}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
      if (!res.ok) break;
      const json = (await res.json()) as ListAuditResponse;
      const batch = json.data.items ?? [];
      if (!batch.length) break;
      out.push(...batch);
      if (out.length >= (json.data.total ?? 0)) break;
      nextPage += 1;
    }
    return out.slice(0, maxRows);
  }

  async function exportCsv() {
    if (!tenantId) return;
    setExporting("csv");
    setErrorKey(null);
    try {
      await logExport("csv");
      const rows = await fetchAll(5000);
      const header = [
        t("app.shop.audit.export.col.time"),
        t("app.shop.audit.export.col.actor"),
        t("app.shop.audit.export.col.actorEmail"),
        t("app.shop.audit.export.col.action"),
        t("app.shop.audit.export.col.entityType"),
        t("app.shop.audit.export.col.entityId"),
        t("app.shop.audit.export.col.metadata")
      ];
      const lines = [header, ...rows.map((r) => [r.createdAt, r.actor?.fullName ?? "", r.actor?.email ?? "", r.action, r.entityType, r.entityId, safeStringify(r.metadata)])];
      const csv = "\uFEFF" + lines.map((line) => line.map(csvCell).join(",")).join("\r\n");
      downloadText(csv, `shop_audit_${from}_${to}.csv`, "text/csv;charset=utf-8");
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setExporting(null);
      setExportMenuOpen(false);
    }
  }

  async function exportXlsx() {
    if (!tenantId) return;
    setExporting("xlsx");
    setErrorKey(null);
    try {
      await logExport("xlsx");
      const rows = await fetchAll(5000);
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      const metaSheet = XLSX.utils.aoa_to_sheet([
        [t("app.shop.audit.export.meta.exportedAt"), new Date().toISOString()],
        [t("app.shop.audit.export.meta.range"), `${from} → ${to}`],
        [t("app.shop.audit.export.meta.search"), q.trim()],
        [t("app.shop.audit.export.meta.action"), action.trim()],
        [t("app.shop.audit.export.meta.entityType"), entityType.trim()],
        [t("app.shop.audit.export.meta.total"), total],
        [t("app.shop.audit.export.meta.exported"), rows.length]
      ]);
      XLSX.utils.book_append_sheet(wb, metaSheet, t("app.shop.audit.export.sheet.meta"));

      const auditSheet = XLSX.utils.aoa_to_sheet([
        [
          t("app.shop.audit.export.col.time"),
          t("app.shop.audit.export.col.actor"),
          t("app.shop.audit.export.col.actorEmail"),
          t("app.shop.audit.export.col.action"),
          t("app.shop.audit.export.col.entityType"),
          t("app.shop.audit.export.col.entityId"),
          t("app.shop.audit.export.col.metadata")
        ],
        ...rows.map((r) => [r.createdAt, r.actor?.fullName ?? "", r.actor?.email ?? "", r.action, r.entityType, r.entityId, truncateForExcel(safeStringify(r.metadata))])
      ]);
      XLSX.utils.book_append_sheet(wb, auditSheet, t("app.shop.audit.export.sheet.audit"));
      XLSX.writeFile(wb, `shop_audit_${from}_${to}.xlsx`);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setExporting(null);
      setExportMenuOpen(false);
    }
  }

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
    async function loadLogs() {
      if (!tenantId) return;
      setLoading(true);
      setErrorKey(null);
      try {
        const res = await apiFetch(`/api/shop/audit?${queryString}`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
        const json = (await res.json()) as ListAuditResponse | { error?: { message_key?: string } };
        if (!res.ok) {
          setErrorKey((json as { error?: { message_key?: string } }).error?.message_key ?? "errors.internal");
          return;
        }
        if (!cancelled) {
          const data = (json as ListAuditResponse).data;
          setItems(data.items ?? []);
          setTotal(data.total ?? 0);
        }
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadLogs();
    return () => {
      cancelled = true;
    };
  }, [tenantId, queryString]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xl font-semibold">{t("app.shop.audit.title")}</div>
            <div className="mt-1 text-sm text-gray-700">{t("app.shop.audit.subtitle")}</div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative">
              <button
                type="button"
                disabled={!!exporting}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                onClick={() => setExportMenuOpen((v) => !v)}
              >
                {exporting ? t("app.shop.products.action.working") : t("app.shop.audit.export.button")}
              </button>
              {exportMenuOpen ? (
                <div className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-card">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 border-b border-gray-100 px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
                    onClick={() => void exportXlsx()}
                  >
                    {t("app.shop.audit.export.xlsx")}
                  </button>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50"
                    onClick={() => void exportCsv()}
                  >
                    {t("app.shop.audit.export.csv")}
                  </button>
                </div>
              ) : null}
            </div>
            <Link className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" href={`/t/${props.tenantSlug}/shop`}>
              {t("common.button.back")}
            </Link>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-5">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.audit.filter.search")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder={t("app.shop.audit.filter.search.placeholder")} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.audit.filter.action")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={actionInput} onChange={(e) => setActionInput(e.target.value)} placeholder="shop.invoice.post" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.audit.filter.entityType")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" value={entityTypeInput} onChange={(e) => setEntityTypeInput(e.target.value)} placeholder="shopInvoice" />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={loading}
              onClick={() => {
                setPage(1);
                setQ(qInput);
                setAction(actionInput);
                setEntityType(entityTypeInput);
              }}
            >
              {t("app.shop.audit.filter.apply")}
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-5">
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.audit.filter.from")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={fromInput} onChange={(e) => setFromInput(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700">{t("app.shop.audit.filter.to")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm" type="date" value={toInput} onChange={(e) => setToInput(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              disabled={loading}
              onClick={() => {
                setPage(1);
                setFrom(fromInput);
                setTo(toInput);
              }}
            >
              {t("app.shop.audit.filter.updateRange")}
            </button>
          </div>
          <div className="md:col-span-2 flex items-end gap-2">
            <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={String(pageSize)} onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)); }}>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
            <button
              type="button"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              disabled={loading}
              onClick={() => {
                const d1 = new Date();
                d1.setDate(d1.getDate() - 7);
                const nextFrom = isoDate(d1);
                const nextTo = isoDate(new Date());
                setQInput("");
                setActionInput("");
                setEntityTypeInput("");
                setFromInput(nextFrom);
                setToInput(nextTo);
                setPage(1);
                setQ("");
                setAction("");
                setEntityType("");
                setFrom(nextFrom);
                setTo(nextTo);
              }}
            >
              {t("app.shop.audit.filter.reset")}
            </button>
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.shop.audit.table.time")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.shop.audit.table.actor")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.shop.audit.table.action")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.shop.audit.table.entity")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.shop.audit.table.metadata")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{t("app.shop.audit.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={6}>
                    {t("app.shop.audit.loading")}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={6}>
                    {t("app.shop.audit.empty")}
                  </td>
                </tr>
              ) : (
                items.map((l) => (
                  <tr key={l.id}>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{new Date(l.createdAt).toLocaleString()}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">
                      <div className="font-medium text-gray-900">{l.actor?.fullName ?? "—"}</div>
                      <div className="mt-1 text-xs text-gray-500">{l.actor?.email ?? "—"}</div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{l.action}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">
                      <div className="font-medium text-gray-900">{l.entityType}</div>
                      <div className="mt-1 text-xs text-gray-500">{l.entityId}</div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">
                      <div className="max-w-[460px] truncate text-xs text-gray-600">{safeStringify(l.metadata)}</div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right">
                      <button
                        type="button"
                        className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                        onClick={() => setSelected(l)}
                      >
                        {t("app.shop.audit.action.view")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-200 p-4 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-gray-700">
            {t("app.shop.audit.pagination.showing")}{" "}
            <span className="font-semibold text-gray-900">
              {items.length === 0 ? 0 : (page - 1) * pageSize + 1}–{(page - 1) * pageSize + items.length}
            </span>{" "}
            {t("app.shop.audit.pagination.of")} <span className="font-semibold text-gray-900">{total}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("app.shop.audit.pagination.prev")}
            </button>
            <div className="text-sm text-gray-700">
              {t("app.shop.audit.pagination.page")} <span className="font-semibold text-gray-900">{page}</span> /{" "}
              <span className="font-semibold text-gray-900">{totalPages}</span>
            </div>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t("app.shop.audit.pagination.next")}
            </button>
          </div>
        </div>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">{t("app.shop.audit.details.title")}</div>
              <div className="mt-2 text-sm text-gray-700">{selected ? new Date(selected.createdAt).toLocaleString() : ""}</div>
            </div>
            <button
              type="button"
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setSelected(null)}
            >
              {t("common.button.close")}
            </button>
          </div>

          {selected ? (
            <div className="mt-6 space-y-4 text-sm">
              <DetailRow label={t("app.shop.audit.table.action")} value={selected.action} />
              <DetailRow label={t("app.shop.audit.table.entity")} value={`${selected.entityType} · ${selected.entityId}`} />
              <DetailRow label={t("app.shop.audit.table.actor")} value={selected.actor ? `${selected.actor.fullName ?? "—"} · ${selected.actor.email ?? "—"}` : "—"} />
              <div>
                <div className="text-xs font-medium text-gray-700">{t("app.shop.audit.table.metadata")}</div>
                <pre className="mt-2 max-h-[420px] overflow-auto rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-800">
                  {JSON.stringify(selected.metadata ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function truncateForExcel(value: string): string {
  if (value.length <= 32000) return value;
  return value.slice(0, 32000);
}

function csvCell(value: string): string {
  const s = String(value ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}

function downloadText(text: string, filename: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function DetailRow(props: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium text-gray-600">{props.label}</div>
      <div className="mt-2 font-medium text-gray-900">{props.value}</div>
    </div>
  );
}
