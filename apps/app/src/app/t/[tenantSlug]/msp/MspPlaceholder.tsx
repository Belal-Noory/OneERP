import { getRequestLocale } from "@/lib/locale";
import { t as translate } from "@oneerp/i18n";

export async function MspPlaceholder(props: { titleKey: string; subtitleKey: string; tenantSlug: string }) {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
      <div className="text-lg font-semibold">{t(props.titleKey)}</div>
      <div className="mt-2 text-gray-700">{t(props.subtitleKey)}</div>
      <div className="mt-6 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
        {t("app.msp.comingSoon")}
      </div>
    </div>
  );
}

