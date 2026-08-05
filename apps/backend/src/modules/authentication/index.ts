import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type { AuthenticationService } from "@repo/contracts";
import { createAuthenticationServiceInternal } from "./internal/authentication-service";

export function createAuthenticationService<
  THKT extends PgQueryResultHKT,
  TSchema extends Record<string, unknown> = Record<string, unknown>,
>(
  db: PgDatabase<THKT, TSchema>
): AuthenticationService {
  return createAuthenticationServiceInternal(db);
}
