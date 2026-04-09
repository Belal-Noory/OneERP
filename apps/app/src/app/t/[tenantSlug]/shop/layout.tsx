import { getRequestLocale } from "@/lib/locale";
import { t as translate } from "@oneerp/i18n";
import { ShopMobileNav } from "./ShopMobileNav";
import { ShopTabs } from "./ShopTabs";

export default async function ShopLayout(props: { children: React.ReactNode; params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="text-2xl font-semibold">{t("app.shop.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.shop.subtitle")}</div>
        <ShopTabs tenantSlug={tenantSlug} />
      </div>

      <div className="pb-24 lg:pb-0">{props.children}</div>
      <ShopMobileNav tenantSlug={tenantSlug} />
    </div>
  );
}
