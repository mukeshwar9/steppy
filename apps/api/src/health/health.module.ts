import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { HealthController } from "./health.controller.js";
import { HealthService } from "./health.service.js";
import { ProviderRegistry } from "./provider-registry.js";
@Module({ imports: [EventEmitterModule, AuthModule], controllers: [HealthController], providers: [HealthService, ProviderRegistry], exports: [HealthService] })
export class HealthModule {}
