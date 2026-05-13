import Link from "next/link";
import { isRtlLocale, type Locale, t as translate } from "@oneerp/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { IconUser, LogoMark } from "@/components/Graphics";

export function PublicHeader(props: { locale: Locale }) {
  const t = (key: string) => translate(props.locale, key);
  const rtl = isRtlLocale(props.locale);

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/80 backdrop-blur">
      <div className={["mx-auto flex h-16 max-w-6xl items-center justify-between px-4", rtl ? "flex-row-reverse" : "flex-row"].join(" ")}>
        <div className={["flex items-center gap-6", rtl ? "flex-row-reverse" : "flex-row"].join(" ")}>
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-semibold text-gray-900">
            <span className="text-primary-700">
              <LogoMark className="h-7 w-7" />
            </span>
            <span>{t("common.brand.name")}</span>
          </Link>
          <nav className={["hidden items-center gap-4 text-sm text-gray-700 md:flex", rtl ? "flex-row-reverse" : "flex-row"].join(" ")}>
            <Link className="hover:text-gray-900" href="/">
              {t("common.nav.home")}
            </Link>
            <Link className="hover:text-gray-900" href="/features">
              {t("common.nav.features")}
            </Link>
            <Link className="hover:text-gray-900" href="/modules">
              {t("common.nav.modules")}
            </Link>
            <Link className="hover:text-gray-900" href="/pricing">
              {t("common.nav.pricing")}
            </Link>
          </nav>
        </div>

        <div className={["flex items-center gap-3", rtl ? "flex-row-reverse" : "flex-row"].join(" ")}>
          <LanguageSwitcher locale={props.locale} />
          <Link
            className="inline-flex h-9 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 hover:text-gray-900 sm:px-2"
            href="/login"
            aria-label={t("common.nav.login")}
          >
            <span aria-hidden="true">
              <IconUser />
            </span>
            <span className="ml-2 hidden text-sm sm:inline">{t("common.nav.login")}</span>
          </Link>
          <Link
            className="inline-flex h-9 items-center rounded-md bg-primary-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
            href="/register"
          >
            {t("common.button.getStarted")}
          </Link>
        </div>
      </div>
    </header>
  );
}
