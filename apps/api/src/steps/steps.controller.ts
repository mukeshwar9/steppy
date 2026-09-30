import { Body, Controller, Get, HttpCode, Put, Query, UseGuards } from "@nestjs/common";
import { localDateSchema, uploadStepsSchema, type DailySteps, type UploadStepsResponse } from "@steppy/core";
import { z } from "zod";
import { JwtAuthGuard, UserId } from "../common/auth.guard.js";
import { ZodValidationPipe } from "../common/zod.pipe.js";
import { StepsService } from "./steps.service.js";

const rangeSchema = z.object({ from: localDateSchema.optional(), to: localDateSchema.optional() });

@Controller()
@UseGuards(JwtAuthGuard)
export class StepsController {
  constructor(private readonly steps: StepsService) {}

  @Put("steps")
  @HttpCode(200)
  upload(
    @UserId() userId: string,
    @Body(new ZodValidationPipe(uploadStepsSchema)) body: z.output<typeof uploadStepsSchema>
  ): Promise<UploadStepsResponse> {
    return this.steps.upload(userId, body);
  }

  @Get("me/steps")
  list(@UserId() userId: string, @Query(new ZodValidationPipe(rangeSchema)) q: z.output<typeof rangeSchema>): Promise<DailySteps[]> {
    return this.steps.list(userId, q.from, q.to);
  }
}
