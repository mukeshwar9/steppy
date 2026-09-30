import { Body, Controller, Get, HttpCode, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  addGroupMemberSchema,
  createGroupSchema,
  joinGroupSchema,
  leaderboardPeriodSchema,
  type GroupDetail,
  type GroupHistory,
  type GroupSummary,
  type Leaderboard
} from "@steppy/core";
import { z } from "zod";
import { JwtAuthGuard, UserId } from "../common/auth.guard.js";
import { ZodValidationPipe } from "../common/zod.pipe.js";
import { GroupsService } from "./groups.service.js";

const leaderboardQuery = z.object({ period: leaderboardPeriodSchema.default("week") });
const historyQuery = z.object({ days: z.coerce.number().int().min(1).max(90).default(7) });

@Controller("groups")
@UseGuards(JwtAuthGuard)
export class GroupsController {
  constructor(private readonly groups: GroupsService) {}

  @Get()
  list(@UserId() userId: string): Promise<GroupSummary[]> {
    return this.groups.list(userId);
  }

  @Post()
  create(@UserId() userId: string, @Body(new ZodValidationPipe(createGroupSchema)) body: z.output<typeof createGroupSchema>): Promise<GroupDetail> {
    return this.groups.create(userId, body);
  }

  // Declared before ":id" routes so "join" is never read as an id.
  @Post("join")
  @HttpCode(200)
  join(@UserId() userId: string, @Body(new ZodValidationPipe(joinGroupSchema)) body: z.output<typeof joinGroupSchema>): Promise<GroupDetail> {
    return this.groups.join(userId, body.inviteCode);
  }

  @Get(":id")
  get(@UserId() userId: string, @Param("id") id: string): Promise<GroupDetail> {
    return this.groups.get(id, userId);
  }

  @Post(":id/members")
  @HttpCode(200)
  addMember(
    @UserId() userId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addGroupMemberSchema)) body: z.output<typeof addGroupMemberSchema>
  ): Promise<GroupDetail> {
    return this.groups.addFriend(id, userId, body.userId);
  }

  @Post(":id/leave")
  @HttpCode(204)
  async leave(@UserId() userId: string, @Param("id") id: string): Promise<void> {
    await this.groups.leave(id, userId);
  }

  @Post(":id/invite-code/rotate")
  @HttpCode(200)
  rotate(@UserId() userId: string, @Param("id") id: string): Promise<GroupSummary> {
    return this.groups.rotateInviteCode(id, userId);
  }

  @Get(":id/leaderboard")
  leaderboard(
    @UserId() userId: string,
    @Param("id") id: string,
    @Query(new ZodValidationPipe(leaderboardQuery)) q: z.output<typeof leaderboardQuery>
  ): Promise<Leaderboard> {
    return this.groups.leaderboard(id, userId, q.period);
  }

  @Get(":id/history")
  history(
    @UserId() userId: string,
    @Param("id") id: string,
    @Query(new ZodValidationPipe(historyQuery)) q: z.output<typeof historyQuery>
  ): Promise<GroupHistory> {
    return this.groups.history(id, userId, q.days);
  }
}
