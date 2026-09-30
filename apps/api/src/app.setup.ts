import type { INestApplication } from "@nestjs/common";
import helmet from "helmet";

/** HTTP middleware shared by main.ts and the tests. */
export function configureApp(app: INestApplication): void {
  app.use(helmet());
  const origins = process.env.CORS_ORIGIN?.split(",").map((o) => o.trim()).filter(Boolean);
  app.enableCors({ origin: origins && origins.length > 0 ? origins : true, credentials: true });
}
