/** Extracts a readable message from the NestJS `{ statusCode, message, error }` error body. */
export function errorMessageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === "string" && message) return message;
    if (Array.isArray(message) && message.length > 0) return message.map(String).join(", ");
  }
  return fallback;
}
