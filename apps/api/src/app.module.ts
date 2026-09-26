import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { CommonModule } from "./common/common.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { UsersModule } from "./users/users.module.js";
import { HealthModule } from "./health/health.module.js";
import { ActivityModule } from "./activity/activity.module.js";
import { ChallengesModule } from "./challenges/challenges.module.js";
import { FriendsModule } from "./friends/friends.module.js";
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), EventEmitterModule.forRoot(), CommonModule, AuthModule, UsersModule, HealthModule, ActivityModule, ChallengesModule, FriendsModule] })
export class AppModule {}
