import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { users, refreshTokens, system } from "@repo/db";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:root_password@localhost:5432/test_db";

const sql = postgres(TEST_DATABASE_URL);
const db = drizzle(sql);

try {
  await db.delete(refreshTokens);
  await db.delete(users);
  await db.delete(system);
} finally {
  await sql.end();
}