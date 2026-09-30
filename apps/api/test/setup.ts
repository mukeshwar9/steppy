import { PrismaClient } from "@prisma/client";
import { afterAll, beforeEach } from "vitest";

process.env.NODE_ENV = "test";
const testUrl = process.env.TEST_DATABASE_URL ?? "postgresql://steppy:steppy@localhost:54329/steppy_test?schema=public";
process.env.DATABASE_URL = testUrl;
delete process.env.DEMO_MODE;

const cleaner = new PrismaClient({ datasources: { db: { url: testUrl } } });

beforeEach(async () => {
  await cleaner.$executeRawUnsafe(
    'TRUNCATE TABLE "ChallengeParticipant","Challenge","DailySteps","GroupMember","Group","Friendship","RefreshToken","User" RESTART IDENTITY CASCADE'
  );
});

afterAll(async () => {
  await cleaner.$disconnect();
});
