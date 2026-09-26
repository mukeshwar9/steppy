import { Injectable, NotImplementedException } from "@nestjs/common";
import type { HealthProvider, HealthProviderType } from "@steppy/health-domain";
import { DeveloperHealthProvider } from "./developer.provider.js";

@Injectable()
export class ProviderRegistry {
  get(type: HealthProviderType): HealthProvider {
    if (type === "DEVELOPER") return new DeveloperHealthProvider();
    throw new NotImplementedException(`${type} adapter requires native/provider credentials and is not enabled yet`);
  }
}
