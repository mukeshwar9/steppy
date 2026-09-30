import { Module } from "@nestjs/common";
import { GroupsModule } from "../groups/groups.module.js";
import { ChallengesController } from "./challenges.controller.js";
import { ChallengesService } from "./challenges.service.js";

@Module({ imports: [GroupsModule], controllers: [ChallengesController], providers: [ChallengesService], exports: [ChallengesService] })
export class ChallengesModule {}
