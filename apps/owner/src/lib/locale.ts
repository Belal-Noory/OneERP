import { cookies } from "next/headers";
import { isSupportedLocale, type Locale } from "@oneerp/i18n";
import { LOCALE_COOKIE } from "@/lib/locale-constants";

export async function getRequestLocale(): Promise<Locale> {
  const store = await cookies();
  const raw = store.get(LOCALE_COOKIE)?.value;
  if (raw && isSupportedLocale(raw)) return raw;
  return "en";
}

