import { Module } from "@nestjs/common";
import { AccountModule } from "../account/account.module.js";
import { UsersController } from "./users.controller.js";

@Module({ imports: [AccountModule], controllers: [UsersController] })
export class UsersModule {}
