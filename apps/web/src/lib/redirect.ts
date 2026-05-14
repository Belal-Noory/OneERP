export function resolveRedirect(path: string): string {
  if (path.startsWith("/t/")) {
    const fromEnv = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim();
    if (fromEnv) return `${fromEnv.replace(/\/$/, "")}${path}`;
    if (typeof window !== "undefined") {
      const protocol = window.location.protocol;
      const host = window.location.hostname;
      if (host === "localhost" || host === "127.0.0.1") return `http://${host}:3001${path}`;
      const bare = host.replace(/^(www|app|owner|api)\./, "");
      if (protocol === "https:") return `https://app.${bare}${path}`;
      return `http://app.${bare}${path}`;
    }
    return `http://localhost:3001${path}`;
  }
  return path;
}
