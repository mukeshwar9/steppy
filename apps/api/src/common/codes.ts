import { randomInt } from "node:crypto";

/** A-Z and 2-9 without confusable characters (no 0 O 1 I L). */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randomCode(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
}

/** Generates a code that `exists` reports as unused. */
export async function uniqueCode(exists: (code: string) => Promise<boolean>, length = 8): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = randomCode(length);
    if (!(await exists(code))) return code;
  }
  throw new Error("Could not generate a unique code");
}
