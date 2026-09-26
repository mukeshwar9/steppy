import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { IsDateString, IsOptional } from "class-validator";
import { JwtAuthGuard, type AuthenticatedRequest } from "../common/auth.js";
import { ActivityService } from "./activity.service.js";
class HistoryQuery { @IsOptional() @IsDateString() from?: string; @IsOptional() @IsDateString() to?: string; }
@Controller("me/activity") @UseGuards(JwtAuthGuard)
export class ActivityController {
  constructor(private readonly activity: ActivityService) {}
  @Get("today") today(@Req() req: AuthenticatedRequest) { return this.activity.today(req.user.id); }
  @Get("history") history(@Req() req: AuthenticatedRequest, @Query() query: HistoryQuery) { return this.activity.history(req.user.id, query.from, query.to); }
  @Get("stats") stats(@Req() req: AuthenticatedRequest) { return this.activity.stats(req.user.id); }
}
