import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { api, createTestApp, type TestCtx } from "./helpers.js";

let ctx: TestCtx;
let http: ReturnType<typeof api>;
beforeAll(async () => {
  ctx = await createTestApp();
  http = api(ctx);
});
afterAll(() => ctx.close());

const creds = { email: "Ann@Example.com", password: "secret123", displayName: "Ann", timezone: "Europe/Berlin" };

describe("auth", () => {
  it("GET /health is unauthenticated", async () => {
    const res = await http.get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("registers, normalises the email and returns tokens + user", async () => {
    const res = await http.post("/auth/register", undefined, creds);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: "ann@example.com", displayName: "Ann", timezone: "Europe/Berlin", stepSource: null, lastSyncedAt: null });
    expect(res.body.user.friendCode).toMatch(/^[A-HJKMNP-Z2-9]{8}$/);
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(typeof res.body.accessToken).toBe("string");
    expect(typeof res.body.refreshToken).toBe("string");
  });

  it("rejects duplicate email with 409", async () => {
    await http.post("/auth/register", undefined, creds);
    const res = await http.post("/auth/register", undefined, { ...creds, email: "ann@example.com" });
    expect(res.status).toBe(409);
  });

  it("validates register input and timezone", async () => {
    expect((await http.post("/auth/register", undefined, { ...creds, email: "nope" })).status).toBe(400);
    expect((await http.post("/auth/register", undefined, { ...creds, password: "123" })).status).toBe(400);
    const tz = await http.post("/auth/register", undefined, { ...creds, timezone: "Mars/Olympus" });
    expect(tz.status).toBe(400);
    expect(tz.body.message).toContain("Invalid timezone");
  });

  it("logs in with correct credentials only", async () => {
    await http.post("/auth/register", undefined, creds);
    const ok = await http.post("/auth/login", undefined, { email: "ANN@example.com", password: "secret123" });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe("ann@example.com");
    expect((await http.post("/auth/login", undefined, { email: "ann@example.com", password: "wrong" })).status).toBe(401);
    expect((await http.post("/auth/login", undefined, { email: "who@example.com", password: "secret123" })).status).toBe(401);
  });

  it("refresh rotates the refresh token; the old one stops working", async () => {
    const reg = await http.post("/auth/register", undefined, creds);
    const first = await http.post("/auth/refresh", undefined, { refreshToken: reg.body.refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).not.toBe(reg.body.refreshToken);
    expect((await http.get("/me", first.body.accessToken)).status).toBe(200);
    expect((await http.post("/auth/refresh", undefined, { refreshToken: reg.body.refreshToken })).status).toBe(401);
    expect((await http.post("/auth/refresh", undefined, { refreshToken: first.body.refreshToken })).status).toBe(200);
  });

  it("refresh rejects unknown and expired tokens", async () => {
    expect((await http.post("/auth/refresh", undefined, { refreshToken: "nope" })).status).toBe(401);
    const reg = await http.post("/auth/register", undefined, creds);
    await ctx.prisma.refreshToken.updateMany({ data: { expiresAt: new Date("2000-01-01") } });
    expect((await http.post("/auth/refresh", undefined, { refreshToken: reg.body.refreshToken })).status).toBe(401);
  });

  it("protects routes and returns/updates the profile", async () => {
    expect((await http.get("/me")).status).toBe(401);
    expect((await http.get("/me", "garbage")).status).toBe(401);
    const me = await http.register("Bob");
    const got = await http.get("/me", me.token);
    expect(got.status).toBe(200);
    expect(got.body.displayName).toBe("Bob");
    const patched = await http.patch("/me", me.token, { displayName: "Robert", timezone: "Asia/Tokyo" });
    expect(patched.status).toBe(200);
    expect(patched.body).toMatchObject({ displayName: "Robert", timezone: "Asia/Tokyo" });
    expect((await http.patch("/me", me.token, { timezone: "Nope/Nope" })).status).toBe(400);
  });
});
