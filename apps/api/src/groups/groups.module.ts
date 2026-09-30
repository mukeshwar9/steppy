import { Module } from "@nestjs/common";
import { FriendsModule } from "../friends/friends.module.js";
import { GroupsController } from "./groups.controller.js";
import { GroupsService } from "./groups.service.js";

@Module({ imports: [FriendsModule], controllers: [GroupsController], providers: [GroupsService], exports: [GroupsService] })
export class GroupsModule {}
