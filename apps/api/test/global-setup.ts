import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export default function setup(): void {
  const root = resolve(import.meta.dirname, "../../..");
  if (existsSync(resolve(root, ".env"))) {
    try {
      process.loadEnvFile(resolve(root, ".env"));
    } catch {
      // ignore
    }
  }
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://steppy:steppy@localhost:54329/steppy_test?schema=public";
  execSync("pnpm exec prisma migrate deploy", {
    cwd: resolve(import.meta.dirname, ".."),
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe"
  });
}
