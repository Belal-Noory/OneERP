"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";

type TutorialCard = {
  id: string;
  slug: string;
  title_en: string;
  title_dr: string;
  title_ps: string;
  thumbnail_url: string | null;
  difficulty: string;
  language: string;
  views: number;
  duration_sec: number | null;
};

type ListResponse = { data?: TutorialCard[] };

function resolvePublicWebUrl(path: string): string {
  const fromEnv = (process.env.NEXT_PUBLIC_WEB_BASE_URL ?? "").trim();
  const base = (() => {
    if (fromEnv) return fromEnv.replace(/\/+$/, "");
    if (typeof window !== "undefined") {
      const protocol = window.location.protocol === "https:" ? "https" : "http";
      const host = window.location.hostname.toLowerCase();
      if (host === "localhost" || host === "127.0.0.1") return `http://${host}:3000`;
      const bare = host.replace(/^(www|app|owner|api)\./, "");
      return `${protocol}://${bare}`;
    }
    return "http://localhost:3000";
  })();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}

function pickTitle(locale: "en" | "fa" | "ps", t: TutorialCard): string {
  if (locale === "fa") return t.title_dr;
  if (locale === "ps") return t.title_ps;
  return t.title_en;
}

function formatDuration(sec: number | null): string | null {
  if (!sec || sec <= 0) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ModuleTrainingSection(props: { moduleId: string; limit?: number }) {
  const { t, locale } = useClientI18n();
  const limit = Math.min(12, Math.max(1, props.limit ?? 6));
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TutorialCard[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("scope", "module");
        params.set("moduleId", props.moduleId);
        params.set("sort", "mostViewed");
        params.set("page", "1");
        params.set("pageSize", String(limit));
        const res = await apiFetch(`/api/public/tutorials?${params.toString()}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as ListResponse | null;
        const next = Array.isArray(json?.data) ? (json!.data as TutorialCard[]) : [];
        if (!cancelled) setItems(next);
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [limit, props.moduleId]);

  const allHref = useMemo(() => {
    const qs = new URLSearchParams({ scope: "module", moduleId: props.moduleId });
    return resolvePublicWebUrl(`/learning-center?${qs.toString()}`);
  }, [props.moduleId]);

  if (!loading && items.length === 0) {
    return (
      <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold text-gray-400 uppercase tracking-widest">{t("public.learning.moduleSectionTitle")}</div>
            <div className="mt-2 text-sm text-gray-700">{t("public.learning.moduleEmpty")}</div>
          </div>
          <a href={allHref} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50">
            {t("public.learning.viewAll")}
          </a>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="text-sm font-bold text-gray-400 uppercase tracking-widest">{t("public.learning.moduleSectionTitle")}</div>
        <a href={allHref} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50">
          {t("public.learning.viewAll")}
        </a>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(loading ? (Array.from({ length: Math.min(6, limit) }, () => null) as Array<TutorialCard | null>) : (items as Array<TutorialCard | null>)).map((it, idx) => {
          if (!it) {
            return <div key={idx} className="h-40 rounded-2xl border border-gray-200 bg-gray-50" />;
          }
          const href = resolvePublicWebUrl(`/learning-center/${encodeURIComponent(it.slug)}`);
          return (
            <a key={it.id} href={href} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="relative bg-gray-100">
                {it.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.thumbnail_url} alt="" className="h-24 w-full object-cover" loading="lazy" />
                ) : (
                  <div className="h-24 w-full" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2">
                  <span className="inline-flex items-center rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold text-gray-900">
                    {t(`public.learning.difficulty.${it.difficulty}`)}
                  </span>
                  {formatDuration(it.duration_sec) ? (
                    <span className="inline-flex items-center rounded-full bg-black/60 px-2 py-1 text-[11px] font-semibold text-white tabular">{formatDuration(it.duration_sec)}</span>
                  ) : null}
                </div>
              </div>
              <div className="p-4">
                <div className="line-clamp-2 text-sm font-semibold text-gray-900">{pickTitle(locale, it)}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2">{it.language === "fa" ? t("common.language.fa") : it.language === "ps" ? t("common.language.ps") : t("common.language.en")}</span>
                  <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2 tabular">
                    {t("public.learning.views")}: {it.views}
                  </span>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
