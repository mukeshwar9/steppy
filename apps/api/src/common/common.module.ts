import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service.js";
import { AppLogger } from "./logger.js";
@Global()
@Module({ providers: [PrismaService, AppLogger], exports: [PrismaService, AppLogger] })
export class CommonModule {}
