import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/postgres-js";
import { createDbClient } from "./client";
import { system } from "./schema";

describe("createDbClient", () => {
  test("returns a postgres-js backed drizzle client without connecting", () => {
    const db = createDbClient();
    expect(typeof db.$client.unsafe).toBe("function");
  });
});

describe("system schema", () => {
  test("generates a SELECT against the system table", () => {
    const db = drizzle.mock();
    const query = db.select().from(system).toSQL();
    expect(query.sql).toContain('from "system"');
    expect(query.sql).toContain('"id"');
    expect(query.sql).toContain('"key"');
    expect(query.sql).toContain('"value"');
    expect(query.sql).toContain('"created_at"');
  });

  test("generates an INSERT against the system table", () => {
    const db = drizzle.mock();
    const query = db
      .insert(system)
      .values({
        id: "sys-1",
        key: "boot-time",
        value: "1",
        createdAt: new Date(),
      })
      .toSQL();
    expect(query.sql).toContain('insert into "system"');
  });
});
