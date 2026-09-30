import { Inject, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConnectedSocket, OnGatewayInit, SubscribeMessage, WebSocketGateway } from "@nestjs/websockets";
import type { Namespace, Socket } from "socket.io";
import { APP_CONFIG, corsOrigins, type AppConfig } from "../common/config.js";
import { PrismaService } from "../common/prisma.service.js";
import { RealtimeService, groupRoom, userRoom } from "./realtime.service.js";

@WebSocketGateway({ namespace: "/realtime", cors: { origin: corsOrigins(), credentials: true } })
export class RealtimeGateway implements OnGatewayInit {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  afterInit(server: Namespace): void {
    this.realtime.attach(server);
    // Authenticate and join rooms during the handshake so the client's `connect` implies it is subscribed.
    server.use((socket, next) => {
      void this.authenticate(socket).then(
        () => next(),
        (error: unknown) => {
          this.logger.debug(`rejected socket: ${String(error)}`);
          next(new Error("Unauthorized"));
        }
      );
    });
  }

  @SubscribeMessage("groups.resubscribe")
  async onResubscribe(@ConnectedSocket() client: Socket): Promise<{ ok: true }> {
    await this.subscribe(client);
    return { ok: true };
  }

  private async authenticate(socket: Socket): Promise<void> {
    const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    if (typeof token !== "string" || !token) throw new Error("missing token");
    const userId = this.jwt.verify<{ sub: string }>(token, { secret: this.config.jwtAccessSecret }).sub;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new Error("unknown user");
    socket.data.userId = userId;
    await socket.join(userRoom(userId));
    await this.subscribe(socket);
  }

  private async subscribe(socket: Socket): Promise<void> {
    const userId = socket.data.userId as string | undefined;
    if (!userId) return;
    const memberships = await this.prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } });
    const wanted = new Set(memberships.map((m) => groupRoom(m.groupId)));
    for (const room of socket.rooms) {
      if (room.startsWith("group:") && !wanted.has(room)) await socket.leave(room);
    }
    for (const room of wanted) await socket.join(room);
  }
}
