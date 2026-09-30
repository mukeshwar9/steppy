import { CanActivate, ExecutionContext, Injectable, Inject, UnauthorizedException, createParamDecorator } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { APP_CONFIG, type AppConfig } from "./config.js";
import { PrismaService } from "./prisma.service.js";

export type AuthedRequest = Request & { userId: string };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("Missing access token");
    let userId: string;
    try {
      userId = this.jwt.verify<{ sub: string }>(header.slice(7), { secret: this.config.jwtAccessSecret }).sub;
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }
    // A valid token for a deleted user must not work.
    const exists = await this.prisma.user.count({ where: { id: userId } });
    if (!exists) throw new UnauthorizedException("Unknown user");
    request.userId = userId;
    return true;
  }
}

/** Injects the authenticated user's id. */
export const UserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().userId;
});
