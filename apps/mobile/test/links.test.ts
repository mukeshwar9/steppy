import { describe, expect, it } from "vitest";
import { friendLink, friendShareMessage, inviteLink, inviteShareMessage, parseDeepLink } from "../src/lib/links";

describe("parseDeepLink", () => {
  it("parses friend and join links", () => {
    expect(parseDeepLink("steppy://friend/abcd1234")).toEqual({ type: "friend", code: "ABCD1234" });
    expect(parseDeepLink("steppy://join/K7M2QXR9")).toEqual({ type: "join", code: "K7M2QXR9" });
  });

  it("tolerates slashes, query strings and Expo dev links", () => {
    expect(parseDeepLink("steppy:///join/ABCD1234/")).toEqual({ type: "join", code: "ABCD1234" });
    expect(parseDeepLink("steppy://friend/ABCD1234?utm=x#frag")).toEqual({ type: "friend", code: "ABCD1234" });
    expect(parseDeepLink("exp://192.168.1.5:8081/--/join/ABCD1234")).toEqual({ type: "join", code: "ABCD1234" });
  });

  it("rejects everything else", () => {
    expect(parseDeepLink(null)).toBeNull();
    expect(parseDeepLink("")).toBeNull();
    expect(parseDeepLink("https://example.com/join/ABCD1234")).toBeNull();
    expect(parseDeepLink("steppy://other/ABCD1234")).toBeNull();
    expect(parseDeepLink("steppy://join/")).toBeNull();
    expect(parseDeepLink("steppy://join/ab")).toBeNull();
    expect(parseDeepLink("steppy://join/not%20valid!")).toBeNull();
    expect(parseDeepLink("exp://host:8081/join/ABCD1234")).toBeNull();
  });

  it("builds links and share messages that contain both link and code", () => {
    expect(friendLink("ABCD1234")).toBe("steppy://friend/ABCD1234");
    expect(inviteLink("K7M2QXR9")).toBe("steppy://join/K7M2QXR9");
    const invite = inviteShareMessage("Office", "K7M2QXR9");
    expect(invite).toContain("steppy://join/K7M2QXR9");
    expect(invite).toContain("Invite code: K7M2QXR9");
    expect(invite).toContain("Office");
    expect(friendShareMessage("Alex", "ABCD1234")).toContain("steppy://friend/ABCD1234");
  });
});
