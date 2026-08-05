import { Elysia } from "elysia";
import type { DbClient } from "@repo/db";

export const createHealthRoutesInternal = (db: DbClient) => {
  return new Elysia({ name: "health-routes" })
    .decorate("db", db)
    .get("/health", async ({ db }) => {
      const rows = await db.$client.unsafe("SELECT 1 AS ok");
      return { status: "ok", db: rows.length === 1 };
    });
};
