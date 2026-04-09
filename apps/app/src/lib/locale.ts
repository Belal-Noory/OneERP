import { cookies } from "next/headers";
import { isSupportedLocale, type Locale, LOCALE_COOKIE_NAME } from "@oneerp/i18n";

export async function getRequestLocale(): Promise<Locale> {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE_NAME)?.value;
  if (raw && isSupportedLocale(raw)) return raw;
  return "en";
}
