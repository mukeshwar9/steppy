import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../common/prisma.service.js";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import type { GoogleSignInDto, LoginDto, RegisterDto } from "./auth.dto.js";
import { GoogleService } from "./google.service.js";

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService, private readonly google: GoogleService) {}
  async register(dto: RegisterDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findFirst({ where: { OR: [{ email }, { username: dto.username }] } });
    if (existing) throw new ConflictException("Email or username already exists");
    const user = await this.prisma.user.create({ data: { email, username: dto.username, displayName: dto.displayName, passwordHash: await bcrypt.hash(dto.password, 12) } });
    return this.issue(user.id, user.email);
  }
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user?.passwordHash || !(await bcrypt.compare(dto.password, user.passwordHash))) throw new UnauthorizedException("Invalid credentials");
    return this.issue(user.id, user.email);
  }
  async guest() {
    let user = await this.prisma.user.findUnique({ where: { username: "guest" } });
    const isNewUser = !user;
    if (!user) user = await this.prisma.user.create({ data: { email: "guest@steppy.local", username: "guest", displayName: "Guest", passwordHash: null, timezone: "UTC", primaryProvider: "DEVELOPER" } });
    return { ...(await this.issue(user.id, user.email)), isNewUser };
  }
  async googleLogin(dto: GoogleSignInDto) {
    const identity = await this.google.verify(dto.credential, dto.credentialType);
    let user = await this.prisma.user.findUnique({ where: { googleSubject: identity.subject } });
    let isNewUser = false;
    if (!user) {
      user = await this.prisma.user.findUnique({ where: { email: identity.email } });
      if (user?.googleSubject && user.googleSubject !== identity.subject) throw new UnauthorizedException("Google account does not match linked account");
      if (user) user = await this.prisma.user.update({ where: { id: user.id }, data: { googleSubject: identity.subject, avatarUrl: user.avatarUrl ?? identity.avatarUrl } });
    }
    if (!user) {
      isNewUser = true;
      user = await this.prisma.user.create({ data: { email: identity.email, googleSubject: identity.subject, passwordHash: null, displayName: identity.displayName, username: await this.uniqueUsername(identity.email) , avatarUrl: identity.avatarUrl } });
    }
    return { ...(await this.issue(user.id, user.email)), isNewUser };
  }
  async logout(refreshToken: string) {
    const [tokenId] = refreshToken.split(".");
    if (tokenId) await this.prisma.refreshToken.updateMany({ where: { id: tokenId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { loggedOut: true };
  }
  async refresh(refreshToken: string) {
    const [tokenId, secret] = refreshToken.split(".");
    if (!tokenId || !secret) throw new UnauthorizedException("Invalid refresh token");
    const match = await this.prisma.refreshToken.findFirst({ where: { id: tokenId, revokedAt: null, expiresAt: { gt: new Date() } }, include: { user: true } });
    if (!match || !(await bcrypt.compare(secret, match.tokenHash))) throw new UnauthorizedException("Invalid refresh token");
    await this.prisma.refreshToken.update({ where: { id: match.id }, data: { revokedAt: new Date() } });
    return this.issue(match.userId, match.user.email);
  }
  private async uniqueUsername(email: string): Promise<string> {
    const base = (email.split("@")[0] ?? "user").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 20) || "user";
    let username = base.length >= 3 ? base : `${base}user`;
    let suffix = 1;
    while (await this.prisma.user.findUnique({ where: { username } })) { username = `${base.slice(0, 24 - String(suffix).length)}${suffix++}`; }
    return username;
  }
  private async issue(userId: string, email: string) {
    const accessToken = await this.jwt.signAsync({ sub: userId, email }, { expiresIn: "15m" });
    const tokenId = randomBytes(18).toString("base64url");
    const secret = randomBytes(48).toString("base64url");
    await this.prisma.refreshToken.create({ data: { id: tokenId, userId, tokenHash: await bcrypt.hash(secret, 12), expiresAt: new Date(Date.now() + 30 * 86400000) } });
    return { accessToken, refreshToken: `${tokenId}.${secret}` };
  }
}
