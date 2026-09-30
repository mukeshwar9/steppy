import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { ChallengesModule } from "./challenges/challenges.module.js";
import { CommonModule } from "./common/common.module.js";
import { DemoModule } from "./demo/demo.module.js";
import { FriendsModule } from "./friends/friends.module.js";
import { GroupsModule } from "./groups/groups.module.js";
import { HealthController } from "./health.controller.js";
import { RealtimeModule } from "./realtime/realtime.module.js";
import { StepsModule } from "./steps/steps.module.js";
import { UsersModule } from "./users/users.module.js";

@Module({
  imports: [
    CommonModule,
    RealtimeModule,
    DemoModule,
    AuthModule,
    UsersModule,
    StepsModule,
    FriendsModule,
    GroupsModule,
    ChallengesModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
