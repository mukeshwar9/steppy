import { Module } from "@nestjs/common";
import { DemoService } from "./demo.service.js";

@Module({ providers: [DemoService], exports: [DemoService] })
export class DemoModule {}
