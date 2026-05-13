"use client";

import Link from "next/link";
import { useState } from "react";
import { useClientI18n } from "@/lib/client-i18n";
import { getApiBaseUrl } from "@/lib/api";
import { resolveRedirect } from "@/lib/redirect";
import type { ApiError, LoginRequest, LoginResponse } from "@oneerp/types";
import { HeroGraphic, IconShield, IconGlobe, IconPuzzle } from "@/components/Graphics";

export default function LoginPage() {
  const { t } = useClientI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 md:items-stretch">
      <div className="relative hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card md:block">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-accent-50" />
        <div className="relative flex h-full flex-col p-8">
          <div className="text-sm font-semibold text-gray-900">{t("common.brand.name")}</div>
          <div className="mt-6 text-2xl font-semibold">{t("public.home.hero.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("public.home.hero.subtitle")}</div>
          <div className="mt-8 space-y-4 text-sm text-gray-700">
            <Bullet icon={<IconPuzzle />} title={t("public.home.benefits.modular.title")} desc={t("public.home.benefits.modular.desc")} />
            <Bullet icon={<IconGlobe />} title={t("public.home.benefits.localization.title")} desc={t("public.home.benefits.localization.desc")} />
            <Bullet icon={<IconShield />} title={t("public.home.benefits.security.title")} desc={t("public.home.benefits.security.desc")} />
          </div>
          <div className="mt-auto pt-8">
            <div className="aspect-[16/10] w-full overflow-hidden rounded-xl border border-gray-200 bg-white/70 backdrop-blur">
              <HeroGraphic />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
        <h1 className="text-2xl font-semibold">{t("auth.login.title")}</h1>
        <p className="mt-2 text-sm text-gray-700">{t("auth.login.subtitle")}</p>

        <form
          className="mt-8 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setErrorKey(null);
            setSubmitting(true);
            try {
              const res = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ email, password } satisfies LoginRequest)
              });
              const json = (await res.json()) as LoginResponse | ApiError;
              if (!res.ok) {
                setErrorKey("error" in json ? json.error.message_key : "errors.internal");
                return;
              }
              const redirectPath = "data" in json ? json.data.redirect?.path : null;
              window.location.href = redirectPath ? resolveRedirect(redirectPath) : "/";
            } catch {
              setErrorKey("errors.internal");
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div>
            <label className="block text-sm font-medium text-gray-900">{t("auth.login.field.email.label")}</label>
            <div className="relative mt-1">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                <MailIcon />
              </div>
              <input
                className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.login.field.email.placeholder")}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900">{t("auth.login.field.password.label")}</label>
            <div className="relative mt-1">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                <LockIcon />
              </div>
              <input
                className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.login.field.password.placeholder")}
                required
              />
            </div>
            <div className="mt-3 text-right text-sm">
              <Link className="text-primary-700 hover:text-primary-800" href="/reset">
                {t("auth.login.link.forgotPassword")}
              </Link>
            </div>
          </div>

          {errorKey ? <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{t(errorKey)}</div> : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
          >
            {t("common.button.login")}
          </button>

          <div className="text-center text-sm text-gray-700">
            {t("auth.login.link.noAccount")}{" "}
            <Link className="text-primary-700 hover:text-primary-800" href="/register">
              {t("auth.login.link.createAccount")}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

function Bullet(props: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary-700 shadow-sm">
        {props.icon}
      </div>
      <div>
        <div className="text-sm font-semibold text-gray-900">{props.title}</div>
        <div className="mt-1 text-sm text-gray-700">{props.desc}</div>
      </div>
    </div>
  );
}

function MailIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h16v12H4V6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 10V7a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M6 10h12a2 2 0 0 1 2 2v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
