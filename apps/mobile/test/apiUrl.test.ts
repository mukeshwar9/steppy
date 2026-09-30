import { describe, expect, it } from "vitest";
import { resolveApiUrl } from "../src/lib/apiUrl";

describe("resolveApiUrl", () => {
  it("prefers the env var, then app config extra, then platform defaults", () => {
    expect(resolveApiUrl({ env: "https://api.example.com/", extra: { apiUrl: "http://x" }, os: "ios" })).toBe("https://api.example.com");
    expect(resolveApiUrl({ env: "  ", extra: { apiUrl: "http://192.168.1.2:3000" }, os: "ios" })).toBe("http://192.168.1.2:3000");
    expect(resolveApiUrl({ os: "ios" })).toBe("http://localhost:3000");
    expect(resolveApiUrl({ extra: {}, os: "android" })).toBe("http://10.0.2.2:3000");
  });
});
