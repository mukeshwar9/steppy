export type AppConfig = {
  demoMode: boolean;
  demoTimezone: string;
  jwtAccessSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
  bcryptRounds: number;
  /** 0 disables the background finalizer. */
  finalizerIntervalMs: number;
  /** 0 disables the demo ticker. */
  demoTickerIntervalMs: number;
  /** Max /auth requests per minute per IP+path; 0 disables. */
  authRateLimitPerMinute: number;
};

export const APP_CONFIG = Symbol("APP_CONFIG");

/** Values that ship in .env.example or as dev defaults and must never be used in production. */
const KNOWN_DEV_SECRETS = new Set(["dev-access-secret-change-me", "steppy-dev-access-secret"]);

/**
 * Allowed CORS origins for HTTP and sockets: a list from CORS_ORIGIN, or `true` (allow all) when unset.
 * Native mobile apps send no Origin header, so this only affects browsers.
 */
export function corsOrigins(env: NodeJS.ProcessEnv = process.env): string[] | true {
  const list = (env.CORS_ORIGIN ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  return list.length > 0 ? list : true;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const isProd = env.NODE_ENV === "production";
  const isTest = env.NODE_ENV === "test";
  const secret = env.JWT_ACCESS_SECRET;
  if (isProd) {
    if (!secret || secret.length < 32 || KNOWN_DEV_SECRETS.has(secret)) {
      throw new Error("JWT_ACCESS_SECRET must be set to a unique secret of at least 32 characters in production");
    }
    if (corsOrigins(env) === true) throw new Error("CORS_ORIGIN must be set in production");
  }
  const demoMode = env.DEMO_MODE === "true";
  return {
    demoMode,
    demoTimezone: env.DEMO_TIMEZONE || "America/Los_Angeles",
    jwtAccessSecret: secret || "steppy-dev-access-secret",
    accessTokenTtlSeconds: 15 * 60,
    refreshTokenTtlDays: 30,
    bcryptRounds: Number(env.BCRYPT_ROUNDS ?? (isTest ? 4 : 10)),
    finalizerIntervalMs: isTest ? 0 : Number(env.FINALIZER_INTERVAL_MS ?? 60_000),
    demoTickerIntervalMs: isTest || !demoMode ? 0 : Number(env.DEMO_TICK_INTERVAL_MS ?? 60_000),
    authRateLimitPerMinute: isTest ? 0 : Number(env.AUTH_RATE_LIMIT_PER_MINUTE ?? 60)
  };
}
