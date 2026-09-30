import { describe, expect, it } from "vitest";
import { parseTrustProxy } from "../src/app.setup.js";
import { corsOrigins, loadConfig } from "../src/common/config.js";

const prod = (env: Record<string, string>) => ({ NODE_ENV: "production", CORS_ORIGIN: "https://app.example.com", ...env }) as NodeJS.ProcessEnv;
const goodSecret = "x".repeat(32);

describe("production config", () => {
  it("requires a unique JWT secret of at least 32 characters", () => {
    expect(() => loadConfig(prod({}))).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => loadConfig(prod({ JWT_ACCESS_SECRET: "short" }))).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => loadConfig(prod({ JWT_ACCESS_SECRET: "dev-access-secret-change-me" }))).toThrow(/JWT_ACCESS_SECRET/);
    expect(loadConfig(prod({ JWT_ACCESS_SECRET: goodSecret })).jwtAccessSecret).toBe(goodSecret);
  });

  it("requires CORS_ORIGIN", () => {
    expect(() => loadConfig(prod({ JWT_ACCESS_SECRET: goodSecret, CORS_ORIGIN: "" }))).toThrow(/CORS_ORIGIN/);
  });

  it("uses a dev default secret outside production", () => {
    expect(loadConfig({ NODE_ENV: "development" } as NodeJS.ProcessEnv).jwtAccessSecret.length).toBeGreaterThan(0);
  });
});

describe("cors and proxy settings", () => {
  it("parses CORS_ORIGIN lists, allowing all when unset", () => {
    expect(corsOrigins({} as NodeJS.ProcessEnv)).toBe(true);
    expect(corsOrigins({ CORS_ORIGIN: " https://a.com, https://b.com " } as NodeJS.ProcessEnv)).toEqual(["https://a.com", "https://b.com"]);
  });

  it("parses TRUST_PROXY", () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy("")).toBe(false);
    expect(parseTrustProxy("false")).toBe(false);
    expect(parseTrustProxy("true")).toBe(true);
    expect(parseTrustProxy("2")).toBe(2);
    expect(parseTrustProxy("loopback")).toBe("loopback");
  });
});
