import { Controller, Delete, Get, Param, Post, Query, Req, UseGuards, Body } from "@nestjs/common";
import { JwtAuthGuard, type AuthenticatedRequest } from "../common/auth.js";
import { FriendRequestDto } from "./friends.dto.js";
import { FriendsService } from "./friends.service.js";
@Controller("friends") @UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friends: FriendsService) {}
  @Get() list(@Req() req: AuthenticatedRequest) { return this.friends.list(req.user.id); }
  @Get("search") search(@Req() req: AuthenticatedRequest, @Query("username") username = "") { return this.friends.search(username, req.user.id); }
  @Get("requests") requests(@Req() req: AuthenticatedRequest) { return this.friends.requests(req.user.id); }
  @Post("requests") request(@Req() req: AuthenticatedRequest, @Body() dto: FriendRequestDto) { return this.friends.request(req.user.id, dto.username); }
  @Post("requests/:id/accept") accept(@Req() req: AuthenticatedRequest, @Param("id") id: string) { return this.friends.accept(req.user.id, id); }
  @Delete(":id") remove(@Req() req: AuthenticatedRequest, @Param("id") id: string) { return this.friends.remove(req.user.id, id); }
}
