import "./globals.css";
import type { Metadata } from "next";
import { getRequestLocale } from "@/lib/locale";
import { getTextDirection } from "@oneerp/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { FullscreenToggle } from "@/components/FullscreenToggle";

export const metadata: Metadata = {
  title: { default: "OneERP — Tenant Dashboard", template: "%s — OneERP" }
};

export default async function RootLayout(props: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  const dir = getTextDirection(locale);

  return (
    <html lang={locale} dir={dir}>
      <body className="min-h-dvh bg-gray-50 text-gray-900">
        <div className="flex min-h-dvh flex-col">
          <header className="app-global-header flex h-16 items-center justify-end border-b border-gray-200 bg-white px-4">
            <div className="flex items-center gap-2">
              <FullscreenToggle />
              <LanguageSwitcher locale={locale} />
            </div>
          </header>
          <main className="app-global-main flex-1 p-4 md:p-6">{props.children}</main>
        </div>
      </body>
    </html>
  );
}
