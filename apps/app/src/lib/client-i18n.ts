"use client";

import { useEffect, useMemo, useState } from "react";
import { isSupportedLocale, t as translate, type Locale } from "@oneerp/i18n";

export function useClientI18n() {
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    const rawLang = document.documentElement.lang;
    if (rawLang && isSupportedLocale(rawLang)) setLocale(rawLang);
  }, []);

  const t = useMemo(() => (key: string) => translate(locale, key), [locale]);
  return { locale, t };
}

