import { Module } from "@nestjs/common";
import { StepsController } from "./steps.controller.js";
import { StepsService } from "./steps.service.js";

@Module({ controllers: [StepsController], providers: [StepsService], exports: [StepsService] })
export class StepsModule {}
