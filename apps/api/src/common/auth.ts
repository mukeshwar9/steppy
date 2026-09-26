import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";

export type AuthenticatedRequest = Request & { user: { id: string; email: string } };

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("Missing access token");
    try {
      const payload = this.jwt.verify<{ sub: string; email: string }>(header.slice(7), { secret: process.env.JWT_ACCESS_SECRET ?? "" });
      request.user = { id: payload.sub, email: payload.email };
      return true;
    } catch { throw new UnauthorizedException("Invalid access token"); }
  }
}
