export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (raw) {
    if (raw.startsWith("/")) {
      if (typeof window !== "undefined") {
        const origin = window.location.origin.replace(/\/$/, "");
        const suffix = raw === "/" ? "" : raw;
        return `${origin}${suffix}`.replace(/\/$/, "");
      }
      return raw.replace(/\/$/, "");
    }
    return raw.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol;
    const host = window.location.hostname;
    if (protocol === "https:") {
      const bare = host.replace(/^(www|app|owner|api)\./, "");
      return `https://api.${bare}`;
    }
    return `http://${host}:4000`;
  }
  return "http://localhost:4000";
}
