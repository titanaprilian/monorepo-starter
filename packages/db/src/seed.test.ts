import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { MIGRATIONS_FOLDER } from "./client";
import { refreshTokens, system, users } from "./schema";
import { seed } from "./seed";

describe("seed(db)", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  });

  afterAll(async () => {
    await client.close();
  });

  test("populates database with deterministic seed data on fresh db", async () => {
    await seed(db);

    const userRows = await db.select().from(users);
    expect(userRows).toHaveLength(2);
    expect(userRows.map((u) => u.email)).toContain("test@example.com");
    expect(userRows.map((u) => u.email)).toContain("user@example.com");

    const systemRows = await db.select().from(system);
    expect(systemRows).toHaveLength(2);
    expect(systemRows.map((s) => s.key)).toContain("environment");
    expect(systemRows.map((s) => s.key)).toContain("version");

    const tokenRows = await db.select().from(refreshTokens);
    expect(tokenRows).toHaveLength(0);
  });

  test("can be executed safely multiple times (idempotent / clean reset)", async () => {
    // Add some dummy refresh token and extra user data to ensure clean teardown
    await db.insert(users).values({
      id: "extra-user",
      name: "Extra",
      email: "extra@example.com",
      passwordHash: "hash",
      createdAt: new Date(),
    });

    await db.insert(refreshTokens).values({
      id: "token-1",
      token: "dummy-token",
      userId: "extra-user",
      expiresAt: new Date(),
      createdAt: new Date(),
    });

    // Run seed again
    await seed(db);

    const userRows = await db.select().from(users);
    expect(userRows).toHaveLength(2);
    expect(userRows.map((u) => u.id)).toEqual(expect.arrayContaining(["user-1", "user-2"]));

    const tokenRows = await db.select().from(refreshTokens);
    expect(tokenRows).toHaveLength(0);

    const systemRows = await db.select().from(system);
    expect(systemRows).toHaveLength(2);
  });
});
