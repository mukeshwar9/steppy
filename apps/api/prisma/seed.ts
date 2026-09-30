import "../src/env.js";
import { PrismaClient } from "@prisma/client";
import { loadConfig } from "../src/common/config.js";
import { seedDemo } from "../src/demo/seed.js";

const prisma = new PrismaClient();
try {
  const config = loadConfig();
  const { groupId } = await seedDemo(prisma, { now: new Date(), timezone: config.demoTimezone });
  console.log(`Demo data ready (group ${groupId}, timezone ${config.demoTimezone}). Demo login: demo@steppy.app / steppy-demo`);
} finally {
  await prisma.$disconnect();
}
