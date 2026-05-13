export function getApiBaseUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined") return `http://${window.location.hostname}:4000`;
  return "http://localhost:4000";
}
