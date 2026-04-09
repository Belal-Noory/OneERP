"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useClientI18n } from "@/lib/client-i18n";
import { getApiBaseUrl } from "@/lib/api";

type ApiError = { error: { message_key: string } };

export default function InvitePage() {
  const { t } = useClientI18n();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = useMemo(() => token && password.trim().length >= 8 && password === confirm, [token, password, confirm]);

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
        <h1 className="text-2xl font-semibold">{t("auth.invite.title")}</h1>
        <p className="mt-2 text-sm text-gray-700">{t("auth.invite.subtitle")}</p>

        {done ? (
          <div className="mt-8 space-y-4">
            <div className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{t("auth.invite.success")}</div>
            <Link className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700" href="/login">
              {t("auth.invite.cta.login")}
            </Link>
          </div>
        ) : (
          <form
            className="mt-8 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setErrorKey(null);
              setSubmitting(true);
              try {
                const res = await fetch(`${getApiBaseUrl()}/api/auth/password-reset/confirm`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ token, newPassword: password })
                });
                if (!res.ok) {
                  const json = (await res.json()) as ApiError;
                  setErrorKey(json.error?.message_key ?? "errors.internal");
                  return;
                }
                setDone(true);
              } catch {
                setErrorKey("errors.internal");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("auth.invite.field.password.label")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.invite.field.password.placeholder")}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("auth.invite.field.confirm.label")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t("auth.invite.field.confirm.placeholder")}
                required
              />
            </div>

            {!token ? <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{t("auth.invite.error.missingToken")}</div> : null}
            {password && password.length < 8 ? <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{t("auth.invite.error.passwordTooShort")}</div> : null}
            {confirm && password !== confirm ? <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{t("auth.invite.error.passwordMismatch")}</div> : null}
            {errorKey ? <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{t(errorKey)}</div> : null}

            <button
              type="submit"
              disabled={submitting || !canSubmit}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
            >
              {submitting ? t("auth.invite.cta.working") : t("auth.invite.cta.submit")}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

