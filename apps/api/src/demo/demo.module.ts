import { Module } from "@nestjs/common";
import { AccountModule } from "../account/account.module.js";
import { DemoService } from "./demo.service.js";

@Module({ imports: [AccountModule], providers: [DemoService], exports: [DemoService] })
export class DemoModule {}
