import { ConflictException, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { User } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { AuthResponse, LoginRequest, RefreshRequest } from "@steppy/core";
import type { z } from "zod";
import { registerSchema } from "@steppy/core";
import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import { Clock } from "../common/clock.js";
import { uniqueCode } from "../common/codes.js";
import { APP_CONFIG, type AppConfig } from "../common/config.js";
import { toApiUser } from "../common/mappers.js";
import { PrismaService } from "../common/prisma.service.js";
import { assertTimezone } from "../common/timezone.js";

const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  async register(input: z.output<typeof registerSchema>): Promise<AuthResponse> {
    assertTimezone(input.timezone);
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException("Email already registered");
    const passwordHash = await bcrypt.hash(input.password, this.config.bcryptRounds);
    try {
      const user = await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          timezone: input.timezone,
          friendCode: await uniqueCode(async (code) => (await this.prisma.user.count({ where: { friendCode: code } })) > 0)
        }
      });
      return this.issueTokens(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Email already registered");
      }
      throw error;
    }
  }

  async login(input: LoginRequest): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    const ok = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
    if (!user || !ok) throw new UnauthorizedException("Invalid email or password");
    return this.issueTokens(user);
  }

  async refresh(input: RefreshRequest): Promise<AuthResponse> {
    const now = this.clock.now();
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(input.refreshToken) },
      include: { user: true }
    });
    if (!token || token.revokedAt || token.expiresAt <= now) throw new UnauthorizedException("Invalid refresh token");
    // Rotate: the claim succeeds for exactly one concurrent caller.
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: token.id, revokedAt: null },
      data: { revokedAt: now }
    });
    if (claimed.count !== 1) throw new UnauthorizedException("Invalid refresh token");
    return this.issueTokens(token.user);
  }

  async issueTokens(user: User): Promise<AuthResponse> {
    const accessToken = this.jwt.sign(
      { sub: user.id },
      { secret: this.config.jwtAccessSecret, expiresIn: this.config.accessTokenTtlSeconds }
    );
    const refreshToken = randomBytes(32).toString("base64url");
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(this.clock.now().getTime() + this.config.refreshTokenTtlDays * 86_400_000)
      }
    });
    return { accessToken, refreshToken, user: toApiUser(user) };
  }
}
