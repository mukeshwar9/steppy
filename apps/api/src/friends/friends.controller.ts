import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { addFriendSchema, type Friend } from "@steppy/core";
import type { z } from "zod";
import { JwtAuthGuard, UserId } from "../common/auth.guard.js";
import { ZodValidationPipe } from "../common/zod.pipe.js";
import { FriendsService } from "./friends.service.js";

@Controller("friends")
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}

  @Get()
  list(@UserId() userId: string): Promise<Friend[]> {
    return this.friends.list(userId);
  }

  @Post()
  @HttpCode(200)
  add(@UserId() userId: string, @Body(new ZodValidationPipe(addFriendSchema)) body: z.output<typeof addFriendSchema>): Promise<Friend> {
    return this.friends.addByCode(userId, body.friendCode);
  }

  @Delete(":userId")
  @HttpCode(204)
  async remove(@UserId() userId: string, @Param("userId") friendId: string): Promise<void> {
    await this.friends.remove(userId, friendId);
  }
}
