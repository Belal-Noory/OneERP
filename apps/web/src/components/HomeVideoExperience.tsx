"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";
import { Reveal } from "@/components/Reveal";
import { HeroGraphic } from "@/components/Graphics";
import { VideoHero } from "@/components/VideoHero";

function useHomeVideoExperimentEnabled(): boolean {
  const params = useSearchParams();
  const envEnabled = process.env.NEXT_PUBLIC_ENABLE_HOME_VIDEOS === "true";
  const qsEnabled = params.get("videos") === "1";
  const [enabled, setEnabled] = useState(envEnabled || qsEnabled);

  useEffect(() => {
    if (envEnabled || qsEnabled) {
      setEnabled(true);
      return;
    }
    const ls = window.localStorage.getItem("oneerp_home_videos") === "enabled";
    setEnabled(ls);
  }, [envEnabled, qsEnabled]);

  return enabled;
}

const loopSources = [{ src: "/videos/oneerp-introduction-loop.mp4", type: "video/mp4" }];
const fullSources = [{ src: "/videos/oneerp-introduction.mp4", type: "video/mp4" }];

export function HomeHeroMedia() {
  const { t } = useClientI18n();
  const enabled = useHomeVideoExperimentEnabled();

  return (
    <div className="aspect-[16/10] w-full overflow-hidden rounded-xl">
      <VideoHero
        enabled={enabled}
        title={t("public.home.video.modal.title")}
        subtitle={t("public.home.video.modal.subtitle")}
        closeLabel={t("common.button.close")}
        poster={
          <div className="mkt-float h-full w-full bg-white">
            <HeroGraphic />
          </div>
        }
        loopSources={loopSources}
        fullSources={fullSources}
      />
    </div>
  );
}

export function HomeVideoSections() {
  const { t } = useClientI18n();
  const enabled = useHomeVideoExperimentEnabled();
  const [open, setOpen] = useState(false);

  const modules = useMemo(
    () => [
      { id: "shop", nameKey: "module.shop.name" },
      { id: "pharmacy", nameKey: "module.pharmacy.name" },
      { id: "fuel", nameKey: "module.fuel.name" },
      { id: "msp", nameKey: "module.msp.name" },
      { id: "printpress", nameKey: "module.printpress.name" }
    ],
    []
  );

  if (!enabled) return null;

  return (
    <div className="space-y-10">
      <Reveal>
        <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-2xl font-semibold">{t("public.home.video.watch.title")}</div>
              <div className="mt-2 text-sm text-gray-700">{t("public.home.video.watch.subtitle")}</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gray-900 px-5 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
            >
              <PlayIcon />
              <span>{t("public.home.video.watch.cta")}</span>
            </button>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="space-y-4">
          <div>
            <div className="text-2xl font-semibold">{t("public.home.video.modules.title")}</div>
            <div className="mt-2 text-gray-700">{t("public.home.video.modules.subtitle")}</div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {modules.map((m, idx) => (
              <Reveal key={m.id} delayMs={idx * 40}>
                <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
                  <div className="relative overflow-hidden rounded-t-2xl bg-gradient-to-br from-primary-50 via-white to-accent-50">
                    <div className="aspect-[16/9] w-full" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow">
                        <svg className="h-5 w-5 translate-x-[1px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M10 8l6 4-6 4V8Z" fill="currentColor" />
                        </svg>
                      </div>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-gray-900">{t(m.nameKey)}</div>
                      <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2 text-xs text-gray-700">{t("public.home.video.modules.badge.comingSoon")}</span>
                    </div>
                    <button
                      type="button"
                      disabled
                      className="mt-4 inline-flex h-10 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 opacity-60"
                    >
                      {t("public.home.video.modules.cta.watchDemo")}
                    </button>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      </Reveal>

      <Modal open={open} onClose={() => setOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">{t("public.home.video.modal.title")}</div>
              <div className="mt-2 text-sm text-gray-700">{t("public.home.video.modal.subtitle")}</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-black">
            <div className="aspect-video w-full">
              <video className="h-full w-full" controls playsInline preload="metadata" autoPlay>
                {fullSources.map((s) => (
                  <source key={`${s.type}:${s.src}`} src={s.src} type={s.type} />
                ))}
              </video>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 8l6 4-6 4V8Z" fill="currentColor" />
    </svg>
  );
}
