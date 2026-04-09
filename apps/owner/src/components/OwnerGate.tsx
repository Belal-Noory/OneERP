"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";

export function OwnerGate(props: { children: React.ReactNode }) {
  const { t } = useClientI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const res = await apiFetch("/api/owner/me", { cache: "no-store" });
      if (!res.ok) {
        router.push(`/login?next=${encodeURIComponent(pathname ?? "/")}`);
        return;
      }
      if (!cancelled) setReady(true);
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [pathname, router]);

  if (!ready) return <div className="rounded-2xl border border-gray-200 bg-white p-6 text-sm text-gray-700">{t("common.loading")}</div>;
  return props.children;
}

