"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";

type OwnerMeResponse = { data: { id: string; email: string | null; fullName: string } };

export function OwnerUserMenu() {
  const { t } = useClientI18n();
  const router = useRouter();
  const [me, setMe] = useState<OwnerMeResponse["data"] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await apiFetch("/api/owner/me", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as OwnerMeResponse;
      if (!cancelled) setMe(json.data);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex items-center gap-3">
      {me?.email ? <div className="hidden text-sm text-gray-600 md:block">{me.email}</div> : null}
      <button
        type="button"
        className="inline-flex h-9 items-center rounded-md border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
        onClick={async () => {
          await apiFetch("/api/owner-auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
          router.push("/login");
          router.refresh();
        }}
      >
        {t("common.button.logout")}
      </button>
    </div>
  );
}
