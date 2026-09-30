import { Module } from "@nestjs/common";
import { DemoModule } from "../demo/demo.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { AuthRateLimitGuard } from "./rate-limit.guard.js";

@Module({ imports: [DemoModule], controllers: [AuthController], providers: [AuthService, AuthRateLimitGuard] })
export class AuthModule {}
