import { Injectable, UnauthorizedException } from "@nestjs/common";
import { OAuth2Client } from "google-auth-library";

export type GoogleIdentity = { subject: string; email: string; displayName: string; avatarUrl?: string };

@Injectable()
export class GoogleService {
  private readonly client = new OAuth2Client();
  private audiences(): string[] {
    return (process.env.GOOGLE_CLIENT_IDS ?? process.env.GOOGLE_WEB_CLIENT_ID ?? "").split(",").map(value => value.trim()).filter(Boolean);
  }
  async verify(credential: string, credentialType = "id_token"): Promise<GoogleIdentity> {
    const audiences = this.audiences();
    if (!audiences.length) throw new UnauthorizedException("Google Sign In is not configured on the server");
    if (credentialType === "access_token") return this.verifyAccessToken(credential, audiences);
    try {
      const ticket = await this.client.verifyIdToken({ idToken: credential, audience: audiences });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email || payload.email_verified !== true || !payload.aud || !audiences.includes(payload.aud)) throw new UnauthorizedException("Invalid Google identity");
      return { subject: payload.sub, email: payload.email.toLowerCase(), displayName: payload.name ?? payload.email.split("@")[0]!, ...(payload.picture ? { avatarUrl: payload.picture } : {}) };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Invalid Google credential");
    }
  }
  private async verifyAccessToken(token: string, audiences: string[]): Promise<GoogleIdentity> {
    try {
      const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`);
      if (!response.ok) throw new Error("Google token rejected");
      const payload = await response.json() as { sub?: string; email?: string; email_verified?: string; aud?: string; name?: string; picture?: string };
      if (!payload.sub || !payload.email || payload.email_verified !== "true" || !payload.aud || !audiences.includes(payload.aud)) throw new Error("Invalid Google identity");
      return { subject: payload.sub, email: payload.email.toLowerCase(), displayName: payload.name ?? payload.email.split("@")[0]!, ...(payload.picture ? { avatarUrl: payload.picture } : {}) };
    } catch { throw new UnauthorizedException("Invalid Google credential"); }
  }
}
