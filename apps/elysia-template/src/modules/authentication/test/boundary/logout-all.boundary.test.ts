import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { refreshTokens, MIGRATIONS_FOLDER } from "@repo/db";
import { createAuthenticationService } from "@/modules/authentication";

describe("authentication: logout-all", () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle>;
  let auth: ReturnType<typeof createAuthenticationService>;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    auth = createAuthenticationService(db);
  });

  afterAll(async () => {
    await client.close();
  });

  // ---------------------------------------------------------------------
  // logoutAll — behavior
  // ---------------------------------------------------------------------
  describe("logoutAll: behavior", () => {
    test("revokes every refresh token for the user", async () => {
      const { user } = await auth.register({
        name: "All Alice",
        email: "logoutall@example.com",
        password: "hunter2hunter",
      });
      await auth.verifyCredentials({
        email: "logoutall@example.com",
        password: "hunter2hunter",
      });
      await auth.verifyCredentials({
        email: "logoutall@example.com",
        password: "hunter2hunter",
      });

      const rowsBefore = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));
      expect(rowsBefore).toHaveLength(3);

      await auth.logoutAll(user.id);

      const rowsAfter = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));
      expect(rowsAfter).toHaveLength(3);
      for (const row of rowsAfter) expect(row.revoked).toBe(true);
    });

    test("leaves other users' tokens untouched", async () => {
      const { user: target } = await auth.register({
        name: "Target",
        email: "target@example.com",
        password: "hunter2hunter",
      });
      const { user: bystander } = await auth.register({
        name: "Bystander",
        email: "bystanderall@example.com",
        password: "hunter2hunter",
      });
      await auth.verifyCredentials({
        email: "bystanderall@example.com",
        password: "hunter2hunter",
      });

      await auth.logoutAll(target.id);

      const rows = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, bystander.id));
      expect(rows).toHaveLength(2);
      for (const row of rows) expect(row.revoked).toBe(false);
    });
  });
});
