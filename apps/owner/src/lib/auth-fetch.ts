"use client";

import { getApiBaseUrl } from "@/lib/api";

export async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const apiBase = getApiBaseUrl();
  const url = input.startsWith("http") ? input : `${apiBase}${input.startsWith("/") ? "" : "/"}${input}`;
  const res = await fetch(url, { ...init, credentials: "include" });
  if (res.status !== 401) return res;

  const refreshed = await fetch(`${apiBase}/api/owner-auth/refresh`, { method: "POST", credentials: "include" });
  if (!refreshed.ok) return res;

  return fetch(url, { ...init, credentials: "include" });
}
