import { z } from "zod";

export const providerSchema = z.enum([
  "DEVELOPER",
  "APPLE_HEALTH",
  "HEALTH_CONNECT",
  "FITBIT",
  "GARMIN",
  "ZEPP",
  "SAMSUNG_HEALTH"
]);
export type HealthProviderType = z.infer<typeof providerSchema>;

export const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(80),
  username: z.string().regex(/^[a-zA-Z0-9_]{3,24}$/)
});
export const loginSchema = z.object({ email: z.string().trim().email(), password: z.string().min(1) });
export const createChallengeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(500).optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  timezone: z.string().min(1).max(64).default("UTC")
}).refine(value => value.endAt > value.startAt, { message: "endAt must be after startAt" });

export type DailyActivityDto = {
  localDate: string;
  timezone: string;
  steps: number;
  distanceMeters?: number | null;
  activeMinutes?: number | null;
  primaryProvider: HealthProviderType;
};
