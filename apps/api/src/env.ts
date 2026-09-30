// Side-effect module: load the repo root .env (if present) before anything reads process.env.
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
for (const candidate of [resolve(here, "../../../.env"), resolve(here, "../../../../.env"), resolve(process.cwd(), ".env")]) {
  if (existsSync(candidate)) {
    try {
      process.loadEnvFile(candidate);
    } catch {
      // ignore unreadable env files
    }
    break;
  }
}
