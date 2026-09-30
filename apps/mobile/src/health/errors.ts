/** Health store cannot be used on this device right now (not installed, needs update, no permission). */
export class HealthUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HealthUnavailableError";
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "Unknown error";
}
