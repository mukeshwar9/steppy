import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { createTestApp, type TestCtx } from "./helpers.js";

let ctx: TestCtx | undefined;
afterEach(async () => {
  await ctx?.close();
  ctx = undefined;
  delete process.env.TRUST_PROXY;
});

const login = (c: TestCtx, forwardedFor: string) =>
  request(c.app.getHttpServer()).post("/auth/login").set("X-Forwarded-For", forwardedFor).send({ email: "a@b.co", password: "x" });

describe("auth rate limit", () => {
  it("limits per client and ignores X-Forwarded-For unless TRUST_PROXY is set", async () => {
    ctx = await createTestApp({ config: { authRateLimitPerMinute: 2 } });
    expect((await login(ctx, "1.1.1.1")).status).toBe(401);
    expect((await login(ctx, "2.2.2.2")).status).toBe(401);
    expect((await login(ctx, "3.3.3.3")).status).toBe(429); // spoofed header does not dodge the limit
  });

  it("uses the forwarded client address when TRUST_PROXY is enabled", async () => {
    process.env.TRUST_PROXY = "true";
    ctx = await createTestApp({ config: { authRateLimitPerMinute: 1 } });
    expect((await login(ctx, "1.1.1.1")).status).toBe(401);
    expect((await login(ctx, "1.1.1.1")).status).toBe(429);
    expect((await login(ctx, "2.2.2.2")).status).toBe(401);
  });
});
