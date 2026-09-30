/** Pure API base URL resolution (env var, then app config extra, then platform localhost). */
export function resolveApiUrl(input: {
  env?: string | undefined;
  extra?: unknown;
  os: string;
}): string {
  const fromEnv = input.env?.trim();
  if (fromEnv) return stripTrailingSlash(fromEnv);
  const fromExtra = readApiUrlExtra(input.extra);
  if (fromExtra) return stripTrailingSlash(fromExtra);
  return input.os === "android" ? "http://10.0.2.2:3000" : "http://localhost:3000";
}

function readApiUrlExtra(extra: unknown): string | null {
  if (extra && typeof extra === "object" && "apiUrl" in extra) {
    const value = (extra as { apiUrl?: unknown }).apiUrl;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
