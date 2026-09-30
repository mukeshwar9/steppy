import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { AuthResponse, UploadStepsResponse } from "@steppy/core";
import { io, type Socket } from "socket.io-client";
import request from "supertest";
import { AppModule } from "../src/app.module.js";
import { configureApp } from "../src/app.setup.js";
import { Clock } from "../src/common/clock.js";
import { APP_CONFIG, loadConfig, type AppConfig } from "../src/common/config.js";
import { PrismaService } from "../src/common/prisma.service.js";

export class FakeClock extends Clock {
  constructor(private current: Date) {
    super();
  }
  override now(): Date {
    return new Date(this.current);
  }
  set(iso: string): void {
    this.current = new Date(iso);
  }
}

/** Wednesday 2026-10-14 12:00 UTC; the ISO week started Monday 2026-10-12. */
export const NOON = "2026-10-14T12:00:00Z";

export type TestCtx = {
  app: INestApplication;
  clock: FakeClock;
  prisma: PrismaService;
  config: AppConfig;
  url: string;
  close(): Promise<void>;
};

export async function createTestApp(opts: { now?: string; config?: Partial<AppConfig> } = {}): Promise<TestCtx> {
  const clock = new FakeClock(new Date(opts.now ?? NOON));
  const config: AppConfig = { ...loadConfig({ NODE_ENV: "test" } as NodeJS.ProcessEnv), ...opts.config };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .overrideProvider(APP_CONFIG)
    .useValue(config)
    .compile();
  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.listen(0);
  const address = app.getHttpServer().address() as { port: number };
  return {
    app,
    clock,
    prisma: app.get(PrismaService),
    config,
    url: `http://127.0.0.1:${address.port}`,
    close: () => app.close()
  };
}

export type Session = { token: string; refreshToken: string; id: string; name: string; friendCode: string; email: string };

export function api(ctx: TestCtx) {
  const server = ctx.app.getHttpServer();
  const call = (method: "get" | "post" | "put" | "patch" | "delete", path: string, token?: string, body?: object) => {
    let r = request(server)[method](path);
    if (token) r = r.set("Authorization", `Bearer ${token}`);
    return body ? r.send(body) : r;
  };
  return {
    get: (path: string, token?: string) => call("get", path, token),
    post: (path: string, token?: string, body?: object) => call("post", path, token, body ?? {}),
    put: (path: string, token?: string, body?: object) => call("put", path, token, body),
    patch: (path: string, token?: string, body?: object) => call("patch", path, token, body),
    delete: (path: string, token?: string) => call("delete", path, token),

    async register(name: string, timezone = "UTC"): Promise<Session> {
      const res = await call("post", "/auth/register", undefined, {
        email: `${name.toLowerCase()}@example.com`,
        password: "secret123",
        displayName: name,
        timezone
      });
      if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
      const body = res.body as AuthResponse;
      return {
        token: body.accessToken,
        refreshToken: body.refreshToken,
        id: body.user.id,
        name,
        friendCode: body.user.friendCode,
        email: body.user.email
      };
    },

    async befriend(a: Session, b: Session): Promise<void> {
      const res = await call("post", "/friends", a.token, { friendCode: b.friendCode });
      if (res.status !== 200) throw new Error(`befriend failed: ${res.status}`);
    },

    async createGroup(owner: Session, name = "Crew", timezone?: string): Promise<{ id: string; inviteCode: string }> {
      const res = await call("post", "/groups", owner.token, { name, ...(timezone ? { timezone } : {}) });
      if (res.status !== 201) throw new Error(`createGroup failed: ${res.status} ${JSON.stringify(res.body)}`);
      return res.body as { id: string; inviteCode: string };
    },

    async joinGroup(user: Session, inviteCode: string): Promise<void> {
      const res = await call("post", "/groups/join", user.token, { inviteCode });
      if (res.status !== 200) throw new Error(`join failed: ${res.status}`);
    },

    async upload(
      user: Session,
      days: Array<{ date: string; steps: number }>,
      timezone = "UTC"
    ): Promise<UploadStepsResponse> {
      const res = await call("put", "/steps", user.token, { source: "HEALTHKIT", timezone, reason: "foreground", days });
      if (res.status !== 200) throw new Error(`upload failed: ${res.status} ${JSON.stringify(res.body)}`);
      return res.body as UploadStepsResponse;
    }
  };
}

export function connectSocket(ctx: TestCtx, token: string | undefined): Socket {
  return io(`${ctx.url}/realtime`, {
    auth: token === undefined ? {} : { token },
    transports: ["websocket"],
    reconnection: false,
    forceNew: true
  });
}

export function once<T = unknown>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}
