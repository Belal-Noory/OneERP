import "./globals.css";
import type { Metadata } from "next";
import { getRequestLocale } from "@/lib/locale";
import { getTextDirection } from "@oneerp/i18n";

export const metadata: Metadata = {
  title: { default: "OneERP — Owner Portal", template: "%s — OneERP" }
};

export default async function RootLayout(props: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  const dir = getTextDirection(locale);

  return (
    <html lang={locale} dir={dir}>
      <body className="min-h-dvh bg-gray-50 text-gray-900">
        {props.children}
      </body>
    </html>
  );
}
