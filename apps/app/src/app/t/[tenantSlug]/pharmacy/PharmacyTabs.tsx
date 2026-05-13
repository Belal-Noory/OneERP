"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useClientI18n } from "@/lib/client-i18n";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { OfflineSyncErrorsDialog } from "@/components/OfflineSyncErrorsDialog";

export function PharmacyTabs(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [errorCount, setErrorCount] = useState<number | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [errorsOpen, setErrorsOpen] = useState(false);

  const base = `/t/${props.tenantSlug}/pharmacy`;

  useEffect(() => {
    let mounted = true;
    async function tick() {
      const w = window as unknown as {
        oneerp?: {
          getOfflineModuleStatus?: (input: { moduleId: string }) => Promise<unknown>;
        };
      };
      if (!w.oneerp?.getOfflineModuleStatus) {
        if (mounted) setPendingCount(null);
        if (mounted) setErrorCount(null);
        return;
      }
      try {
        const s2 = await w.oneerp.getOfflineModuleStatus({ moduleId: "pharmacy" });
        const legacyPending = typeof (s2 as { pendingCount?: unknown })?.pendingCount === "number" ? Number((s2 as { pendingCount?: number }).pendingCount) : null;
        const legacyErrors = typeof (s2 as { errorCount?: unknown })?.errorCount === "number" ? Number((s2 as { errorCount?: number }).errorCount) : null;
        const json = (s2 as { ok?: boolean; json?: unknown })?.json as { data?: { pending?: unknown; errors?: unknown } } | undefined;
        const pending = legacyPending ?? (typeof json?.data?.pending === "number" ? Number(json.data.pending) : 0);
        const errors = legacyErrors ?? (typeof json?.data?.errors === "number" ? Number(json.data.errors) : 0);
        if (mounted) {
          setPendingCount(pending);
          setErrorCount(errors);
        }
      } catch {
        if (mounted) setPendingCount(null);
        if (mounted) setErrorCount(null);
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), 5000);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  const showBanner = (pendingCount ?? 0) > 0;
  const showErrors = (errorCount ?? 0) > 0;

  const tabs = useMemo(
    () => [
      { key: "overview", href: base, label: t("app.pharmacy.tab.overview") },
      { key: "pos", href: `${base}/pos`, label: t("app.pharmacy.tab.pos") },
      { key: "sales", href: `${base}/sales`, label: t("app.pharmacy.tab.sales") },
      { key: "medicines", href: `${base}/medicines`, label: t("app.pharmacy.tab.medicines") },
      { key: "inventory", href: `${base}/inventory`, label: t("app.pharmacy.tab.inventory") },
      { key: "reports", href: `${base}/reports`, label: t("app.pharmacy.tab.reports") }
    ],
    [base, t]
  );

  const activeKey = useMemo(() => {
    if (!pathname) return "overview";
    if (pathname === base) return "overview";
    if (pathname.startsWith(`${base}/pos`)) return "pos";
    if (pathname.startsWith(`${base}/sales`)) return "sales";
    if (pathname.startsWith(`${base}/medicines`)) return "medicines";
    if (pathname.startsWith(`${base}/products`)) return "medicines";
    if (pathname.startsWith(`${base}/inventory`)) return "inventory";
    if (pathname.startsWith(`${base}/reports`)) return "reports";
    return null;
  }, [base, pathname]);

  return (
    <>
      {showBanner ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="font-medium">{t("desktop.offline.pending.title")}</div>
              <div className="mt-1 text-amber-800">
                {t("desktop.offline.pending.desc")} <span className="font-semibold tabular">{pendingCount}</span>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-amber-700 px-4 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-60"
              disabled={transferring}
              onClick={() => setTransferOpen(true)}
            >
              {t("desktop.offline.transfer.action")}
            </button>
          </div>
        </div>
      ) : null}

      {showErrors ? (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="font-medium">{t("desktop.offline.errors.title")}</div>
              <div className="mt-1 text-red-800">
                {t("desktop.offline.errors.desc")} <span className="font-semibold tabular">{errorCount}</span>
              </div>
            </div>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-red-200 bg-white px-4 text-sm font-medium text-red-800 hover:bg-red-50" onClick={() => setErrorsOpen(true)}>
              {t("desktop.offline.errors.view")}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-5 -mx-2 overflow-x-auto px-2">
        <div className="flex items-center gap-2 whitespace-nowrap">
          {tabs.map((tab) => {
            const active = tab.key === activeKey;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "inline-flex h-9 items-center rounded-full border px-3 text-sm",
                  active ? "border-primary-200 bg-primary-50 text-primary-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                ].join(" ")}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      <ConfirmDialog
        open={transferOpen}
        title={t("desktop.offline.transfer.title")}
        description={t("desktop.offline.transfer.desc")}
        confirmLabel={t("desktop.offline.transfer.action")}
        cancelLabel={t("common.button.cancel")}
        confirmTone="primary"
        busy={transferring}
        onCancel={() => setTransferOpen(false)}
        onConfirm={async () => {
          const w = window as unknown as {
            oneerp?: { syncModule?: (input: { moduleId: string }) => Promise<unknown> };
          };
          if (!w.oneerp?.syncModule) return;
          setTransferring(true);
          try {
            await w.oneerp.syncModule({ moduleId: "pharmacy" });
            setTransferOpen(false);
            window.location.reload();
          } finally {
            setTransferring(false);
          }
        }}
      />

      <OfflineSyncErrorsDialog open={errorsOpen} onClose={() => setErrorsOpen(false)} moduleId="pharmacy" />
    </>
  );
}
