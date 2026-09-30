export type DeepLink = { type: "friend"; code: string } | { type: "join"; code: string };

const CODE = /^[A-Za-z0-9]{4,16}$/;

/**
 * Parses `steppy://friend/<code>` and `steppy://join/<code>`. Also accepts Expo dev links such as
 * `exp://host:8081/--/friend/<code>`. Returns null for anything else.
 */
export function parseDeepLink(url: string | null | undefined): DeepLink | null {
  if (!url) return null;
  const match = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(url.trim());
  if (!match) return null;
  const scheme = (match[1] ?? "").toLowerCase();
  if (scheme !== "steppy" && scheme !== "exp" && scheme !== "exps") return null;
  const rest = (match[2] ?? "").split(/[?#]/)[0] ?? "";
  let segments = rest.split("/").filter(Boolean);
  const dev = segments.indexOf("--");
  if (dev >= 0) segments = segments.slice(dev + 1);
  else if (scheme !== "steppy") return null;
  const kind = segments[0]?.toLowerCase();
  const code = segments[1];
  if ((kind !== "friend" && kind !== "join") || !code || !CODE.test(code)) return null;
  return { type: kind, code: code.toUpperCase() };
}

export const friendLink = (code: string): string => `steppy://friend/${code}`;
export const inviteLink = (code: string): string => `steppy://join/${code}`;

export function inviteShareMessage(groupName: string, code: string): string {
  return `Join my Steppy group "${groupName}" and compete on steps!\n${inviteLink(code)}\nInvite code: ${code}`;
}

export function friendShareMessage(displayName: string, code: string): string {
  return `Add ${displayName} on Steppy and compare steps!\n${friendLink(code)}\nFriend code: ${code}`;
}
