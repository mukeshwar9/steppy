import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from "class-validator";
import type { HealthProviderType } from "@steppy/health-domain";
import { JwtAuthGuard, type AuthenticatedRequest } from "../common/auth.js";
import { HealthService } from "./health.service.js";
class ProviderDto { @IsEnum(["DEVELOPER", "APPLE_HEALTH", "HEALTH_CONNECT", "FITBIT", "GARMIN", "ZEPP", "SAMSUNG_HEALTH"]) provider!: HealthProviderType; }
class ImportDto extends ProviderDto { @IsOptional() @IsDateString() startDate?: string; @IsOptional() @IsDateString() endDate?: string; }
class SimulateStepsDto { @IsInt() @Min(1) @Max(100000) steps!: number; }
class MobileActivityRecordDto { @IsDateString() localDate!: string; @IsString() timezone!: string; @IsInt() @Min(0) @Max(1000000) steps!: number; @IsOptional() @IsNumber() @Min(0) distanceMeters?: number; }
class MobileRecordsDto { @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => MobileActivityRecordDto) records!: MobileActivityRecordDto[]; }
@Controller("health") @UseGuards(JwtAuthGuard)
export class HealthController {
  constructor(private readonly health: HealthService) {}
  @Get("connections") connections(@Req() req: AuthenticatedRequest) { return this.health.connections(req.user.id); }
  @Post(":provider/connect") connect(@Req() req: AuthenticatedRequest, @Param("provider") provider: HealthProviderType) { return this.health.connect(req.user.id, provider); }
  @Delete(":provider/disconnect") disconnect(@Req() req: AuthenticatedRequest, @Param("provider") provider: HealthProviderType) { return this.health.disconnect(req.user.id, provider); }
  @Post("import") import(@Req() req: AuthenticatedRequest, @Body() dto: ImportDto) { return this.health.startImport(req.user.id, dto.provider, dto.startDate, dto.endDate); }
  @Get("import/:jobId") job(@Req() req: AuthenticatedRequest, @Param("jobId") jobId: string) { return this.health.getJob(req.user.id, jobId); }
  @Post("developer/simulate") simulate(@Req() req: AuthenticatedRequest, @Body() dto: SimulateStepsDto) { return this.health.simulateSteps(req.user.id, dto.steps); }
  @Post(":provider/records") records(@Req() req: AuthenticatedRequest, @Param("provider") provider: HealthProviderType, @Body() dto: MobileRecordsDto) { return this.health.ingestMobileRecords(req.user.id, provider, dto.records); }
}
