import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { createChallengeSchema, type ChallengeDetail, type ChallengeSummary } from "@steppy/core";
import type { z } from "zod";
import { JwtAuthGuard, UserId } from "../common/auth.guard.js";
import { ZodValidationPipe } from "../common/zod.pipe.js";
import { ChallengesService } from "./challenges.service.js";

@Controller()
@UseGuards(JwtAuthGuard)
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Get("groups/:id/challenges")
  list(@UserId() userId: string, @Param("id") id: string): Promise<ChallengeSummary[]> {
    return this.challenges.listForGroup(id, userId);
  }

  @Post("groups/:id/challenges")
  create(
    @UserId() userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createChallengeSchema)) body: z.output<typeof createChallengeSchema>
  ): Promise<ChallengeDetail> {
    return this.challenges.create(id, userId, body);
  }

  @Get("challenges/:id")
  get(@UserId() userId: string, @Param("id") id: string): Promise<ChallengeDetail> {
    return this.challenges.get(id, userId);
  }

  @Post("challenges/:id/join")
  @HttpCode(200)
  join(@UserId() userId: string, @Param("id") id: string): Promise<ChallengeDetail> {
    return this.challenges.join(id, userId);
  }

  @Post("challenges/:id/leave")
  @HttpCode(200)
  leave(@UserId() userId: string, @Param("id") id: string): Promise<ChallengeDetail> {
    return this.challenges.leave(id, userId);
  }
}
