import { getRequestLocale } from "@/lib/locale";
import { t as translate } from "@oneerp/i18n";

export default async function TermsPage() {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8">
      <h1 className="text-2xl font-semibold">{t("common.footer.terms")}</h1>
      <p className="mt-2 text-gray-700">{t("public.features.subtitle")}</p>
    </div>
  );
}
