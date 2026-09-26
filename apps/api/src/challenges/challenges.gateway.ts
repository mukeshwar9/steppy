import { ConnectedSocket, MessageBody, OnGatewayConnection, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import { OnEvent } from "@nestjs/event-emitter";
import { Server, Socket } from "socket.io";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../common/prisma.service.js";

@WebSocketGateway({ namespace: "/leaderboards", cors: { origin: "*" } })
export class ChallengesGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;
  constructor(private readonly jwt: JwtService, private readonly prisma: PrismaService) {}
  handleConnection(client: Socket): void {
    try { const token = String(client.handshake.auth?.token ?? "").replace(/^Bearer /, ""); const payload = this.jwt.verify<{ sub: string }>(token); client.data.userId = payload.sub; }
    catch { client.disconnect(true); }
  }
  @SubscribeMessage("challenge.join")
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: { challengeId?: string }) {
    if (!body.challengeId || !client.data.userId) return { ok: false };
    const participant = await this.prisma.challengeParticipant.findUnique({ where: { challengeId_userId: { challengeId: body.challengeId, userId: client.data.userId } } });
    if (!participant) return { ok: false, error: "Not a participant" };
    await client.join(`challenge:${body.challengeId}`); return { ok: true };
  }
  @OnEvent("challenge.leaderboard.updated")
  publishEvent(payload: { challengeId: string; updatedAt: string; participants: unknown[] }): void { this.server.to(`challenge:${payload.challengeId}`).emit("challenge.leaderboard.updated", payload); }
}
