import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { MIGRATIONS_FOLDER } from "@repo/db";

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.TEST_DATABASE_URL ??
  "postgres://postgres:root_password@localhost:5432/test_db";

export async function setup() {
  const url = new URL(TEST_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  const adminUrl = `${url.protocol}//${url.username}:${url.password}@${url.hostname}:${url.port}/postgres`;

  const adminSql = postgres(adminUrl);
  try {
    const result = await adminSql`SELECT 1 FROM pg_database WHERE datname = ${dbName}`;
    if (result.length === 0) {
      await adminSql.unsafe(`CREATE DATABASE "${dbName}"`);
      console.log(`Created database: ${dbName}`);
    }
  } finally {
    await adminSql.end();
  }

  const testSql = postgres(TEST_DATABASE_URL);
  const testDb = drizzle(testSql);

  try {
    await migrate(testDb, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("Migrations applied");
  } finally {
    await testSql.end();
  }
}