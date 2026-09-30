import { Body, Controller, HttpCode, Inject, NotFoundException, Post, UseGuards } from "@nestjs/common";
import {
  demoLoginSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  type AuthResponse
} from "@steppy/core";
import type { z } from "zod";
import { APP_CONFIG, type AppConfig } from "../common/config.js";
import { assertTimezone } from "../common/timezone.js";
import { ZodValidationPipe } from "../common/zod.pipe.js";
import { DemoService } from "../demo/demo.service.js";
import { AuthRateLimitGuard } from "./rate-limit.guard.js";
import { AuthService } from "./auth.service.js";

@Controller("auth")
@UseGuards(AuthRateLimitGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly demo: DemoService,
    @Inject(APP_CONFIG) private readonly config: AppConfig
  ) {}

  @Post("register")
  register(@Body(new ZodValidationPipe(registerSchema)) body: z.output<typeof registerSchema>): Promise<AuthResponse> {
    return this.auth.register(body);
  }

  @Post("login")
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(loginSchema)) body: z.output<typeof loginSchema>): Promise<AuthResponse> {
    return this.auth.login(body);
  }

  @Post("refresh")
  @HttpCode(200)
  refresh(@Body(new ZodValidationPipe(refreshSchema)) body: z.output<typeof refreshSchema>): Promise<AuthResponse> {
    return this.auth.refresh(body);
  }

  @Post("demo")
  async demoLogin(@Body(new ZodValidationPipe(demoLoginSchema)) body: z.output<typeof demoLoginSchema>): Promise<AuthResponse> {
    if (!this.config.demoMode) throw new NotFoundException();
    assertTimezone(body.timezone);
    const user = await this.demo.createDemoUser(body.displayName, body.timezone);
    return this.auth.issueTokens(user);
  }
}
