"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/auth-fetch";

type MeResponse = {
  data: {
    memberships: { tenantId: string; tenantSlug: string }[];
  };
};

export function NewInvoiceClient(props: { tenantSlug: string }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const meRes = await apiFetch("/api/me", { cache: "no-store" });
        if (!meRes.ok) {
          router.replace(`/t/${props.tenantSlug}/shop/orders`);
          return;
        }
        const me = (await meRes.json()) as MeResponse;
        const membership = me.data.memberships.find((m) => m.tenantSlug === props.tenantSlug) ?? null;
        if (!membership) {
          router.replace(`/t/${props.tenantSlug}/shop/orders`);
          return;
        }
        const res = await apiFetch("/api/shop/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Tenant-Id": membership.tenantId },
          body: JSON.stringify({})
        });
        if (!res.ok) {
          router.replace(`/t/${props.tenantSlug}/shop/orders`);
          return;
        }
        const json = (await res.json()) as { data?: { id: string } };
        const id = json.data?.id ?? null;
        if (!id) {
          router.replace(`/t/${props.tenantSlug}/shop/orders`);
          return;
        }
        if (!cancelled) router.replace(`/t/${props.tenantSlug}/shop/orders/${id}`);
      } catch {
        router.replace(`/t/${props.tenantSlug}/shop/orders`);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [props.tenantSlug, router]);

  return null;
}

