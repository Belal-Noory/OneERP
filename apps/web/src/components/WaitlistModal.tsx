"use client";

import { useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { useClientI18n } from "@/lib/client-i18n";
import { getApiBaseUrl } from "@/lib/api";

export function WaitlistModal(props: { open: boolean; onClose: () => void; moduleId: string | null; moduleName: string | null }) {
  const { t } = useClientI18n();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"idle" | "success" | "error">("idle");

  const title = useMemo(() => {
    if (props.moduleName) return `${t("public.waitlist.title")} — ${props.moduleName}`;
    return t("public.waitlist.title");
  }, [props.moduleName, t]);

  return (
    <Modal
      open={props.open}
      onClose={() => {
        setResult("idle");
        props.onClose();
      }}
    >
      <div className="p-6 md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-semibold">{title}</div>
            <div className="mt-2 text-sm text-gray-700">{t("public.waitlist.subtitle")}</div>
          </div>
          <button
            type="button"
            onClick={props.onClose}
            className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
          >
            {t("common.button.close")}
          </button>
        </div>

        <form
          className="mt-8 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            setResult("idle");
            try {
              const res = await fetch(`${getApiBaseUrl()}/api/public/waitlist`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({
                  email,
                  name: name || undefined,
                  company: company || undefined,
                  moduleId: props.moduleId || undefined
                })
              });
              if (!res.ok) {
                setResult("error");
                return;
              }
              setResult("success");
              setEmail("");
              setName("");
              setCompany("");
            } catch {
              setResult("error");
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("public.waitlist.field.name")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("public.waitlist.field.name.placeholder")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("public.waitlist.field.company")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder={t("public.waitlist.field.company.placeholder")}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900">{t("public.waitlist.field.email")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("public.waitlist.field.email.placeholder")}
              type="email"
              required
            />
          </div>

          {result === "success" ? <div className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{t("public.waitlist.success")}</div> : null}
          {result === "error" ? <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{t("public.waitlist.error")}</div> : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
          >
            {t("public.waitlist.cta")}
          </button>
        </form>
      </div>
    </Modal>
  );
}
