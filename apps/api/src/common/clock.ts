import { Injectable } from "@nestjs/common";

/** Injectable time source so tests control `now` without faking timers. */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}
