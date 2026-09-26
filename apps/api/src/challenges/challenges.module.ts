import { Module } from "@nestjs/common";
import { ChallengesController } from "./challenges.controller.js";
import { ChallengesService } from "./challenges.service.js";
import { ChallengesGateway } from "./challenges.gateway.js";
import { AuthModule } from "../auth/auth.module.js";
@Module({ imports: [AuthModule], controllers: [ChallengesController], providers: [ChallengesService, ChallengesGateway], exports: [ChallengesService] })
export class ChallengesModule {}
