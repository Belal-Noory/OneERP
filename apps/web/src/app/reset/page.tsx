"use client";

import { useState } from "react";
import { useClientI18n } from "@/lib/client-i18n";
import { getApiBaseUrl } from "@/lib/api";
import type { ApiError } from "@oneerp/types";

export default function ResetPage() {
  const { t } = useClientI18n();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-gray-200 bg-white p-8">
        <h1 className="text-2xl font-semibold">{t("auth.reset.title")}</h1>
        <p className="mt-2 text-sm text-gray-700">{t("auth.reset.subtitle")}</p>

        <form
          className="mt-8 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setErrorKey(null);
            try {
              const res = await fetch(`${getApiBaseUrl()}/api/auth/password-reset/request`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email })
              });
              if (!res.ok) {
                const json = (await res.json()) as ApiError;
                setErrorKey("error" in json ? json.error.message_key : "errors.internal");
                return;
              }
              setSubmitted(true);
            } catch {
              setErrorKey("errors.internal");
            }
          }}
        >
          <div>
            <label className="block text-sm font-medium text-gray-900">{t("auth.reset.field.email.label")}</label>
            <input
              className="mt-1 h-10 w-full rounded-md border border-gray-300 px-3 text-sm"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.reset.field.email.placeholder")}
              required
            />
          </div>

          {submitted ? <div className="rounded-md bg-green-50 p-3 text-sm text-green-700">{t("auth.reset.success.message")}</div> : null}
          {errorKey ? <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{t(errorKey)}</div> : null}

          <button
            type="submit"
            className="inline-flex h-10 w-full items-center justify-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"
          >
            {t("auth.reset.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
