import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { refreshTokens, system, users } from "./schema";

export async function seed<
  THKT extends PgQueryResultHKT,
  TSchema extends Record<string, unknown> = Record<string, unknown>,
>(db: PgDatabase<THKT, TSchema>): Promise<void> {
  // Clear existing data safely by deleting child tables first to respect foreign keys
  await db.delete(refreshTokens);
  await db.delete(users);
  await db.delete(system);

  // Insert deterministic base user data (password is "password123")
  await db.insert(users).values([
    {
      id: "user-1",
      name: "Test User",
      email: "test@example.com",
      passwordHash: "$2b$10$/W0WAoqhJkNoV5..MEq/JujDUTCAusr5xBksbG6JLv84XMq2H4bay",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      failedAttempts: 0,
      lockedUntil: null,
      sessionsValidAfter: null,
    },
    {
      id: "user-2",
      name: "Standard User",
      email: "user@example.com",
      passwordHash: "$2b$10$/W0WAoqhJkNoV5..MEq/JujDUTCAusr5xBksbG6JLv84XMq2H4bay",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      failedAttempts: 0,
      lockedUntil: null,
      sessionsValidAfter: null,
    },
  ]);

  // Insert deterministic base system settings
  await db.insert(system).values([
    {
      id: "sys-1",
      key: "environment",
      value: "development",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
    {
      id: "sys-2",
      key: "version",
      value: "1.0.0",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ]);
}
