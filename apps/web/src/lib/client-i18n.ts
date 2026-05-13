"use client";

import { useEffect, useMemo, useState } from "react";
import { isSupportedLocale, LOCALE_COOKIE_NAME, t as translate, type Locale } from "@oneerp/i18n";

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function useClientI18n() {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    const rawLang = document.documentElement.lang;
    if (rawLang && isSupportedLocale(rawLang)) {
      setLocale(rawLang);
      return;
    }
    const raw = readCookie(LOCALE_COOKIE_NAME);
    if (raw && isSupportedLocale(raw)) setLocale(raw);
  }, []);

  const t = useMemo(() => (key: string) => translate(locale, key), [locale]);
  return { locale, t };
}
