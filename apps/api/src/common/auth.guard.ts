import { CanActivate, ExecutionContext, Injectable, Inject, UnauthorizedException, createParamDecorator } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { APP_CONFIG, type AppConfig } from "./config.js";

export type AuthedRequest = Request & { userId: string };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("Missing access token");
    try {
      const payload = this.jwt.verify<{ sub: string }>(header.slice(7), { secret: this.config.jwtAccessSecret });
      request.userId = payload.sub;
      return true;
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }
  }
}

/** Injects the authenticated user's id. */
export const UserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<AuthedRequest>().userId;
});
