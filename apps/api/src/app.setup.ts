import type { INestApplication } from "@nestjs/common";
import helmet from "helmet";
import { corsOrigins } from "./common/config.js";

/** Parses TRUST_PROXY: "true"/"false", a hop count, or an Express trust-proxy string. Unset means off. */
export function parseTrustProxy(value: string | undefined): boolean | number | string {
  if (!value || value === "false") return false;
  if (value === "true") return true;
  return /^\d+$/.test(value) ? Number(value) : value;
}

/** HTTP middleware shared by main.ts and the tests. */
export function configureApp(app: INestApplication): void {
  const http = app.getHttpAdapter().getInstance() as { set(key: string, value: unknown): void };
  http.set("trust proxy", parseTrustProxy(process.env.TRUST_PROXY));
  app.use(helmet());
  app.enableCors({ origin: corsOrigins(), credentials: true });
}
