import { Injectable } from "@nestjs/common";
import type { RealtimeEvents } from "@steppy/core";
import type { Namespace } from "socket.io";
import { PrismaService } from "../common/prisma.service.js";

export const groupRoom = (groupId: string): string => `group:${groupId}`;
export const userRoom = (userId: string): string => `user:${userId}`;

@Injectable()
export class RealtimeService {
  private namespace: Namespace | null = null;

  constructor(private readonly prisma: PrismaService) {}

  attach(namespace: Namespace): void {
    this.namespace = namespace;
  }

  emitToGroup<E extends keyof RealtimeEvents>(groupId: string, event: E, payload: RealtimeEvents[E]): void {
    this.namespace?.to(groupRoom(groupId)).emit(event, payload);
  }

  /** Rebuilds the `group:*` room membership of every connected socket of the user. */
  async resubscribeUser(userId: string): Promise<void> {
    if (!this.namespace) return;
    const sockets = await this.namespace.in(userRoom(userId)).fetchSockets();
    if (sockets.length === 0) return;
    const memberships = await this.prisma.groupMember.findMany({ where: { userId }, select: { groupId: true } });
    const wanted = new Set(memberships.map((m) => groupRoom(m.groupId)));
    for (const socket of sockets) {
      for (const room of socket.rooms) {
        if (room.startsWith("group:") && !wanted.has(room)) socket.leave(room);
      }
      for (const room of wanted) socket.join(room);
    }
  }
}
