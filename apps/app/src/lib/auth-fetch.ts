"use client";

import { getApiBaseUrl } from "@/lib/api";

function normalizeHeaders(h: RequestInit["headers"]): Record<string, string> {
  if (!h) return {};
  if (h instanceof Headers) return Object.fromEntries(h.entries());
  if (Array.isArray(h)) return Object.fromEntries(h);
  return h as Record<string, string>;
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function serializeBody(body: RequestInit["body"]): Promise<unknown> {
  if (!body) return undefined;

  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const entries: Array<
      | { key: string; kind: "string"; value: string }
      | { key: string; kind: "file"; fileName: string; mimeType: string; size: number; base64: string }
    > = [];
    for (const [key, value] of body.entries()) {
      if (typeof value === "string") {
        entries.push({ key, kind: "string", value });
        continue;
      }
      const file = value as File;
      const bytes = new Uint8Array(await file.arrayBuffer());
      entries.push({ key, kind: "file", fileName: file.name, mimeType: file.type || "application/octet-stream", size: file.size, base64: base64FromBytes(bytes) });
    }
    return { __type: "formData", entries };
  }

  if (typeof body === "string") return body;

  const text = await new Response(body).text();
  return text;
}

function isDesktopBridgeAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as { oneerp?: { appRequest?: (args: unknown) => Promise<unknown> } };
  return Boolean(w.oneerp?.appRequest);
}

async function desktopFetch(input: string, init?: RequestInit): Promise<Response> {
  const w = window as unknown as {
    oneerp: {
      appRequest: (args: { input: string; init?: { method?: string; headers?: Record<string, string>; body?: unknown } }) => Promise<{ ok: boolean; status: number; json: unknown }>;
    };
  };
  const headers = normalizeHeaders(init?.headers);
  const body = await serializeBody(init?.body);
  const res = await w.oneerp.appRequest({ input, init: { method: init?.method, headers, body } });
  return new Response(JSON.stringify(res.json ?? null), { status: res.status, headers: { "Content-Type": "application/json" } });
}

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  if (isDesktopBridgeAvailable()) {
    return desktopFetch(input, init);
  }

  const apiBase = getApiBaseUrl();
  const url = input.startsWith("http") ? input : `${apiBase}${input.startsWith("/") ? "" : "/"}${input}`;
  const res = await fetch(url, { ...init, credentials: "include" });
  if (res.status === 403 && typeof window !== "undefined") {
    try {
      const cloned = res.clone();
      const json = (await cloned.json()) as { error?: { code?: string } };
      if (json.error?.code === "MODULE_LOCKED") {
        const path = window.location.pathname;
        const m = path.match(/^\/t\/([^/]+)\//);
        const tenantSlug = m?.[1];
        if (tenantSlug) window.location.href = `/t/${tenantSlug}/modules?locked=1`;
      }
    } catch {}
  }
  if (res.status !== 401) return res;

  const refreshed = await fetch(`${apiBase}/api/auth/refresh`, { method: "POST", credentials: "include" });
  if (!refreshed.ok) return res;

  return fetch(url, { ...init, credentials: "include" });
}
