"use client";

import { Modal } from "@/components/Modal";
import { useClientI18n } from "@/lib/client-i18n";

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmTone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useClientI18n();
  const confirmTone = props.confirmTone ?? "danger";
  const confirmLabel = props.confirmLabel ?? t("common.button.submit");
  const cancelLabel = props.cancelLabel ?? t("common.button.cancel");

  const confirmClass =
    confirmTone === "danger"
      ? "bg-red-600 text-white hover:bg-red-700"
      : "bg-primary-600 text-white hover:bg-primary-700";

  return (
    <Modal open={props.open} onClose={props.onCancel}>
      <div className="p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">{props.title}</div>
            {props.description ? <div className="mt-2 text-sm text-gray-700">{props.description}</div> : null}
          </div>
          <button
            type="button"
            className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
            onClick={props.onCancel}
          >
            {t("common.button.close")}
          </button>
        </div>

        <div className="mt-8 flex flex-col gap-3 md:flex-row md:justify-end">
          <button
            type="button"
            disabled={props.busy}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
            onClick={props.onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={props.busy}
            className={["inline-flex h-11 items-center justify-center rounded-xl px-4 text-sm font-medium shadow-sm disabled:opacity-60", confirmClass].join(" ")}
            onClick={props.onConfirm}
          >
            {props.busy ? t("app.shop.products.action.working") : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

