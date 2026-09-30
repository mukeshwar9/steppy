import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { Clock } from "./clock.js";
import { APP_CONFIG, loadConfig } from "./config.js";
import { JwtAuthGuard } from "./auth.guard.js";
import { PrismaService } from "./prisma.service.js";

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [PrismaService, Clock, JwtAuthGuard, { provide: APP_CONFIG, useFactory: () => loadConfig() }],
  exports: [PrismaService, Clock, JwtAuthGuard, APP_CONFIG, JwtModule]
})
export class CommonModule {}
