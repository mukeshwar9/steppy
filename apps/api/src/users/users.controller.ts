import { Body, Controller, Get, Patch, UnauthorizedException, UseGuards } from "@nestjs/common";
import { updateMeSchema, type User } from "@steppy/core";
import type { z } from "zod";
import { JwtAuthGuard, UserId } from "../common/auth.guard.js";
import { toApiUser } from "../common/mappers.js";
import { PrismaService } from "../common/prisma.service.js";
import { assertTimezone } from "../common/timezone.js";
import { ZodValidationPipe } from "../common/zod.pipe.js";

@Controller("me")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async me(@UserId() userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException("Unknown user");
    return toApiUser(user);
  }

  @Patch()
  async update(
    @UserId() userId: string,
    @Body(new ZodValidationPipe(updateMeSchema)) body: z.output<typeof updateMeSchema>
  ): Promise<User> {
    if (body.timezone) assertTimezone(body.timezone);
    const exists = await this.prisma.user.count({ where: { id: userId } });
    if (!exists) throw new UnauthorizedException("Unknown user");
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { displayName: body.displayName, timezone: body.timezone }
    });
    return toApiUser(user);
  }
}
