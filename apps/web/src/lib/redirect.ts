export function resolveRedirect(path: string): string {
  if (path.startsWith("/t/")) {
    const base = process.env.NEXT_PUBLIC_APP_BASE_URL ?? "http://localhost:3001";
    return `${base}${path}`;
  }
  return path;
}

