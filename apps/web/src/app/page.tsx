import Link from "next/link";
import { t as translate } from "@oneerp/i18n";
import { getRequestLocale } from "@/lib/locale";
import { HeroGraphic, IconChart, IconGlobe, IconLayers, IconPuzzle, IconShield } from "@/components/Graphics";
import { Reveal } from "@/components/Reveal";

export default async function HomePage() {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  return (
    <div className="space-y-16">
      <Reveal>
        <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-accent-50" />
          <div className="relative grid gap-10 p-10 md:grid-cols-2 md:items-center">
            <div className="space-y-6">
              <h1 className="text-4xl font-semibold tracking-tight">{t("public.home.hero.title")}</h1>
              <p className="text-lg text-gray-700">{t("public.home.hero.subtitle")}</p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/register"
                  className="inline-flex h-10 items-center rounded-md bg-primary-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 hover:shadow-md"
                >
                  {t("public.home.hero.ctaPrimary")}
                </Link>
                <Link
                  href="/modules"
                  className="inline-flex h-10 items-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-900 transition hover:bg-gray-50 hover:shadow-sm"
                >
                  {t("public.home.hero.ctaSecondary")}
                </Link>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white/70 p-6 backdrop-blur">
              <div className="aspect-[16/10] w-full overflow-hidden rounded-xl">
                <div className="mkt-float h-full w-full">
                  <HeroGraphic />
                </div>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      <section className="space-y-6">
        <Reveal>
          <h2 className="text-2xl font-semibold">{t("public.home.benefits.title")}</h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-3">
          <Reveal delayMs={0}>
            <Benefit t={t} titleKey="public.home.benefits.multitenant.title" descKey="public.home.benefits.multitenant.desc" />
          </Reveal>
          <Reveal delayMs={70}>
            <Benefit t={t} titleKey="public.home.benefits.modular.title" descKey="public.home.benefits.modular.desc" />
          </Reveal>
          <Reveal delayMs={140}>
            <Benefit t={t} titleKey="public.home.benefits.reporting.title" descKey="public.home.benefits.reporting.desc" />
          </Reveal>
          <Reveal delayMs={210}>
            <Benefit t={t} titleKey="public.home.benefits.localization.title" descKey="public.home.benefits.localization.desc" />
          </Reveal>
          <Reveal delayMs={280}>
            <Benefit t={t} titleKey="public.home.benefits.security.title" descKey="public.home.benefits.security.desc" />
          </Reveal>
        </div>
      </section>

      <section className="space-y-6">
        <Reveal>
          <h2 className="text-2xl font-semibold">{t("public.home.howItWorks.title")}</h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-3">
          <Reveal delayMs={0}>
            <Step t={t} index={1} titleKey="public.home.howItWorks.step1.title" descKey="public.home.howItWorks.step1.desc" />
          </Reveal>
          <Reveal delayMs={90}>
            <Step t={t} index={2} titleKey="public.home.howItWorks.step2.title" descKey="public.home.howItWorks.step2.desc" />
          </Reveal>
          <Reveal delayMs={180}>
            <Step t={t} index={3} titleKey="public.home.howItWorks.step3.title" descKey="public.home.howItWorks.step3.desc" />
          </Reveal>
        </div>
      </section>

      <Reveal>
        <section className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-8 shadow-card md:flex-row md:items-center">
          <div>
            <div className="text-lg font-semibold">{t("public.home.hero.title")}</div>
            <div className="text-gray-700">{t("public.home.hero.subtitle")}</div>
          </div>
          <Link
            href="/register"
            className="inline-flex h-10 items-center rounded-md bg-primary-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 hover:shadow-md"
          >
            {t("common.button.getStarted")}
          </Link>
        </section>
      </Reveal>
    </div>
  );
}

function Benefit(props: { t: (key: string) => string; titleKey: string; descKey: string }) {
  const icon = getBenefitIcon(props.titleKey);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          {icon}
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-900">{props.t(props.titleKey)}</div>
      <div className="mt-1 text-sm text-gray-700">{props.t(props.descKey)}</div>
        </div>
      </div>
    </div>
  );
}

function Step(props: { t: (key: string) => string; index: number; titleKey: string; descKey: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700">
        {props.index}
      </div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{props.t(props.titleKey)}</div>
      <div className="mt-1 text-sm text-gray-700">{props.t(props.descKey)}</div>
    </div>
  );
}

function getBenefitIcon(titleKey: string) {
  if (titleKey.includes("multitenant")) return <IconLayers />;
  if (titleKey.includes("modular")) return <IconPuzzle />;
  if (titleKey.includes("reporting")) return <IconChart />;
  if (titleKey.includes("localization")) return <IconGlobe />;
  return <IconShield />;
}
