import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { JwtAuthGuard, type AuthenticatedRequest } from "../common/auth.js";
import { Req } from "@nestjs/common";
import { PrismaService } from "../common/prisma.service.js";
class UpdateMeDto { @IsOptional() @IsString() @MaxLength(80) displayName?: string; @IsOptional() @IsString() timezone?: string; @IsOptional() @IsString() avatarUrl?: string; @IsOptional() @IsEnum(["DEVELOPER", "APPLE_HEALTH", "HEALTH_CONNECT", "FITBIT", "GARMIN", "ZEPP", "SAMSUNG_HEALTH"]) primaryProvider?: "DEVELOPER" | "APPLE_HEALTH" | "HEALTH_CONNECT" | "FITBIT" | "GARMIN" | "ZEPP" | "SAMSUNG_HEALTH"; }
@Controller("me")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}
  @Get() getMe(@Req() req: AuthenticatedRequest) { return this.prisma.user.findUniqueOrThrow({ where: { id: req.user.id }, select: { id: true, email: true, displayName: true, username: true, avatarUrl: true, timezone: true, primaryProvider: true, createdAt: true } }); }
  @Patch() update(@Req() req: AuthenticatedRequest, @Body() dto: UpdateMeDto) { return this.prisma.user.update({ where: { id: req.user.id }, data: dto, select: { id: true, email: true, displayName: true, username: true, avatarUrl: true, timezone: true, primaryProvider: true } }); }
}
