import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard, type AuthenticatedRequest } from "../common/auth.js";
import { ChallengesService } from "./challenges.service.js";
import { CreateChallengeDto, InviteChallengeDto } from "./challenges.dto.js";
@Controller("challenges") @UseGuards(JwtAuthGuard)
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}
  @Post() create(@Req() req: AuthenticatedRequest, @Body() dto: CreateChallengeDto) { return this.challenges.create(req.user.id, dto); }
  @Get() list(@Req() req: AuthenticatedRequest) { return this.challenges.list(req.user.id); }
  @Get(":id") get(@Req() req: AuthenticatedRequest, @Param("id") id: string) { return this.challenges.get(req.user.id, id); }
  @Get(":id/leaderboard") leaderboard(@Req() req: AuthenticatedRequest, @Param("id") id: string) { return this.challenges.get(req.user.id, id).then(result => result.leaderboard); }
  @Post(":id/join") join(@Req() req: AuthenticatedRequest, @Param("id") id: string) { return this.challenges.join(req.user.id, id); }
  @Post(":id/invite") invite(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() dto: InviteChallengeDto) { return this.challenges.invite(req.user.id, id, dto); }
  @Post(":id/leave") leave(@Req() req: AuthenticatedRequest, @Param("id") id: string) { return this.challenges.leave(req.user.id, id); }
}
