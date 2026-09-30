import { CanActivate, ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { APP_CONFIG, type AppConfig } from "../common/config.js";

/** Tiny in-memory fixed-window limiter for /auth routes (per IP and path). */
@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const limit = this.config.authRateLimitPerMinute;
    if (limit <= 0) return true;
    const req = context.switchToHttp().getRequest<Request>();
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    if (this.hits.size > 5000) for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    entry.count += 1;
    if (entry.count > limit) throw new HttpException("Too many requests", HttpStatus.TOO_MANY_REQUESTS);
    return true;
  }
}
