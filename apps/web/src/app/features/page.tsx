import { getRequestLocale } from "@/lib/locale";
import { t as translate } from "@oneerp/i18n";
import { IconChart, IconGlobe, IconLayers, IconShield } from "@/components/Graphics";
import { Reveal } from "@/components/Reveal";

export default async function FeaturesPage() {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  return (
    <div className="space-y-10">
      <Reveal>
        <header className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-accent-50" />
          <div className="relative space-y-2">
            <h1 className="text-3xl font-semibold">{t("public.features.title")}</h1>
            <p className="text-gray-700">{t("public.features.subtitle")}</p>
          </div>
        </header>
      </Reveal>

      <div className="grid gap-6 md:grid-cols-2">
        <Reveal delayMs={0}>
          <Feature icon={<IconLayers />} t={t} titleKey="public.features.tenantIsolation.title" descKey="public.features.tenantIsolation.desc" />
        </Reveal>
        <Reveal delayMs={80}>
          <Feature icon={<IconShield />} t={t} titleKey="public.features.rbac.title" descKey="public.features.rbac.desc" />
        </Reveal>
        <Reveal delayMs={160}>
          <Feature icon={<IconChart />} t={t} titleKey="public.features.exports.title" descKey="public.features.exports.desc" />
        </Reveal>
        <Reveal delayMs={240}>
          <Feature icon={<IconGlobe />} t={t} titleKey="public.features.localization.title" descKey="public.features.localization.desc" />
        </Reveal>
      </div>
    </div>
  );
}

function Feature(props: { icon: React.ReactNode; t: (key: string) => string; titleKey: string; descKey: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          {props.icon}
        </div>
        <div>
          <div className="text-lg font-semibold">{props.t(props.titleKey)}</div>
          <div className="mt-2 text-gray-700">{props.t(props.descKey)}</div>
        </div>
      </div>
    </div>
  );
}
