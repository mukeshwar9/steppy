import { Module } from "@nestjs/common";
import { ChallengesModule } from "../challenges/challenges.module.js";
import { GroupsModule } from "../groups/groups.module.js";
import { AccountService } from "./account.service.js";

@Module({ imports: [GroupsModule, ChallengesModule], providers: [AccountService], exports: [AccountService] })
export class AccountModule {}
