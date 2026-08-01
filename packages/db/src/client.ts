import postgres from "postgres";
import path from "node:path";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";

export type DbClient = PostgresJsDatabase & {
  $client: postgres.Sql;
};

export const DEFAULT_DATABASE_URL = "postgres://postgres:root_password@localhost:5432/postgres";

export const MIGRATIONS_FOLDER = path.join(import.meta.dir, "../drizzle");

export function createDbClient(databaseUrl?: string): DbClient {
  const sql = postgres(databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  return drizzle(sql);
}
