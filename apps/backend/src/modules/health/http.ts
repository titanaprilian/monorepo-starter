import type { DbClient } from "@repo/db";
import { createHealthRoutesInternal } from "./internal/health-http";

export interface HealthRoutesOptions {
  db: DbClient;
}

export const healthRoutes = (options: HealthRoutesOptions) => {
  return createHealthRoutesInternal(options.db);
};
