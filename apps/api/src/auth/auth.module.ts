import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { GoogleService } from "./google.service.js";
import { JwtAuthGuard } from "../common/auth.js";

@Global()
@Module({ imports: [ConfigModule, JwtModule.registerAsync({ imports: [ConfigModule], inject: [ConfigService], useFactory: (config: ConfigService) => ({ secret: config.getOrThrow<string>("JWT_ACCESS_SECRET") }) })], controllers: [AuthController], providers: [AuthService, GoogleService, JwtAuthGuard], exports: [AuthService, JwtModule, JwtAuthGuard] })
export class AuthModule {}
