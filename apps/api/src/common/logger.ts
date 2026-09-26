import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class AppLogger {
  private readonly logger = new Logger("Steppy");
  info(event: string, data: Record<string, unknown> = {}): void { this.logger.log(JSON.stringify({ event, ...data })); }
  error(event: string, error: unknown, data: Record<string, unknown> = {}): void { this.logger.error(JSON.stringify({ event, error: error instanceof Error ? error.message : error, ...data })); }
}
