"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useClientI18n } from "@/lib/client-i18n";

type ErrorRow = { id: string; entityType: string; entityLocalId: string; operation: string; errorKey: string; errorDetail: string | null; createdAt: string; updatedAt: string };

export function OfflineSyncErrorsDialog(props: { open: boolean; onClose: () => void; moduleId: string }) {
  const { t } = useClientI18n();
  const open = props.open;
  const onClose = props.onClose;
  const moduleId = props.moduleId;

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<ErrorRow[]>([]);
  const [confirmRetry, setConfirmRetry] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const [busy, setBusy] = useState(false);

  const isDesktop = useMemo(() => {
    const w = window as unknown as { oneerp?: { listOfflineModuleErrors?: unknown } };
    return Boolean(w.oneerp?.listOfflineModuleErrors);
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!isDesktop) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const w = window as unknown as { oneerp?: { listOfflineModuleErrors?: (args: { moduleId: string; limit?: number }) => Promise<{ ok: boolean; json?: unknown }> } };
        if (!w.oneerp?.listOfflineModuleErrors) return;
        const res = await w.oneerp.listOfflineModuleErrors({ moduleId, limit: 100 });
        const json = (res?.json ?? null) as { data?: { items?: unknown[] } } | null;
        const rows = Array.isArray(json?.data?.items) ? (json!.data!.items as Array<Record<string, unknown>>) : [];
        const parsed = rows
          .map((r) => ({
            id: typeof r.id === "string" ? r.id : "",
            entityType: typeof r.entityType === "string" ? r.entityType : "",
            entityLocalId: typeof r.entityLocalId === "string" ? r.entityLocalId : "",
            operation: typeof r.operation === "string" ? r.operation : "",
            errorKey: typeof r.errorKey === "string" ? r.errorKey : "errors.internal",
            errorDetail: typeof r.errorDetail === "string" ? r.errorDetail : null,
            createdAt: typeof r.createdAt === "string" ? r.createdAt : "",
            updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : ""
          }))
          .filter((x) => x.id && x.entityType && x.operation && x.errorKey);
        if (!cancelled) setItems(parsed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [open, isDesktop, moduleId]);

  const retryAll = async () => {
    if (!isDesktop) return;
    const w = window as unknown as { oneerp?: { requeueOfflineModuleErrors?: (args: { moduleId: string; ids?: string[] | null }) => Promise<unknown> } };
    if (!w.oneerp?.requeueOfflineModuleErrors) return;
    setBusy(true);
    try {
      await w.oneerp.requeueOfflineModuleErrors({ moduleId, ids: null });
      onClose();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  const dismissAll = async () => {
    if (!isDesktop) return;
    const w = window as unknown as { oneerp?: { clearOfflineModuleErrors?: (args: { moduleId: string; ids?: string[] | null }) => Promise<unknown> } };
    if (!w.oneerp?.clearOfflineModuleErrors) return;
    setBusy(true);
    try {
      await w.oneerp.clearOfflineModuleErrors({ moduleId, ids: null });
      onClose();
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">{t("desktop.offline.errors.title")}</div>
              <div className="mt-2 text-sm text-gray-700">{t("desktop.offline.errors.desc")}</div>
            </div>
            <button type="button" className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50" onClick={onClose}>
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="border-b border-gray-200 px-4 py-2 text-left font-semibold text-gray-900">{t("desktop.offline.errors.table.type")}</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-left font-semibold text-gray-900">{t("desktop.offline.errors.table.op")}</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-left font-semibold text-gray-900">{t("desktop.offline.errors.table.error")}</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-left font-semibold text-gray-900">{t("desktop.offline.errors.table.time")}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-4 py-3 text-gray-700" colSpan={4}>
                      {t("common.loading")}
                    </td>
                  </tr>
                ) : items.length ? (
                  items.map((r) => (
                    <tr key={r.id}>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-900">{r.entityType}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{r.operation}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-700">
                        <div className="text-gray-700">{t(r.errorKey)}</div>
                        {r.errorDetail ? <div className="mt-1 text-xs text-gray-500">{r.errorDetail}</div> : null}
                      </td>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-500">{r.updatedAt || r.createdAt || "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-4 py-3 text-gray-700" colSpan={4}>
                      {t("desktop.offline.errors.empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-6 flex flex-col gap-3 md:flex-row md:justify-end">
            <button
              type="button"
              disabled={busy || !items.length}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => setConfirmDismiss(true)}
            >
              {t("desktop.offline.errors.dismiss")}
            </button>
            <button
              type="button"
              disabled={busy || !items.length}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              onClick={() => setConfirmRetry(true)}
            >
              {t("desktop.offline.errors.retry")}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmRetry}
        title={t("desktop.offline.errors.retry")}
        description={t("desktop.offline.errors.retryDesc")}
        confirmTone="primary"
        busy={busy}
        onCancel={() => setConfirmRetry(false)}
        onConfirm={async () => {
          setConfirmRetry(false);
          await retryAll();
        }}
      />
      <ConfirmDialog
        open={confirmDismiss}
        title={t("desktop.offline.errors.dismiss")}
        description={t("desktop.offline.errors.dismissDesc")}
        confirmTone="danger"
        busy={busy}
        onCancel={() => setConfirmDismiss(false)}
        onConfirm={async () => {
          setConfirmDismiss(false);
          await dismissAll();
        }}
      />
    </>
  );
}
