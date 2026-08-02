import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { MIGRATIONS_FOLDER, type DbClient } from "@repo/db";
import { createApp, type App } from "../../app";
import { createAuthenticationService } from "../../modules/authentication";

function createTestDb(client: PGlite): DbClient {
  const pgliteDb = drizzle(client);
  const db = Object.create(pgliteDb);
  db.$client = {
    ...pgliteDb.$client,
    unsafe: async (query: string, params?: unknown[]) => {
      const result = await pgliteDb.$client.query(query, params);
      return result.rows;
    },
  };
  return db as unknown as DbClient;
}

describe("health module orchestration (Tier 3)", () => {
  let client: PGlite;
  let db: DbClient;
  let app: App;

  beforeAll(async () => {
    client = new PGlite();
    const pgliteDb = drizzle(client);
    await migrate(pgliteDb, { migrationsFolder: MIGRATIONS_FOLDER });
    db = createTestDb(client);
    app = createApp({ db, auth: createAuthenticationService(db) });
  });

  afterAll(async () => {
    await client.close();
  });

  test("GET /health returns ok against the injected database", async () => {
    const response = await app.handle(new Request("http://localhost/health"));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ status: "ok", db: true });
  });
});
