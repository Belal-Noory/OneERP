export function getApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (fromEnv) return fromEnv;
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
