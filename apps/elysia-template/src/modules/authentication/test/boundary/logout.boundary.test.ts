import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { refreshTokens, MIGRATIONS_FOLDER } from "@repo/db";
import { createAuthenticationService } from "../../index";

describe("authentication: logout", () => {
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
  // logout — behavior
  // ---------------------------------------------------------------------
  describe("logout: behavior", () => {
    test("revokes the refresh token", async () => {
      const { user, tokens } = await auth.register({
        name: "Logout Alice",
        email: "logout@example.com",
        password: "hunter2hunter",
      });
      await auth.logout(tokens.refreshToken);

      const [row] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));
      expect(row?.revoked).toBe(true);
    });

    test("revoking an already-revoked token is a safe no-op", async () => {
      const { tokens } = await auth.register({
        name: "Idem Alice",
        email: "idem@example.com",
        password: "hunter2hunter",
      });
      await auth.logout(tokens.refreshToken);
      await expect(auth.logout(tokens.refreshToken)).resolves.toBeUndefined();
    });

    test("does not revoke other users' tokens", async () => {
      const { user: bystander } = await auth.register({
        name: "Bystander",
        email: "bystanderlogout@example.com",
        password: "hunter2hunter",
      });
      await auth.register({
        name: "Leaver",
        email: "leaver@example.com",
        password: "hunter2hunter",
      });
      const { tokens: leaverTokens } = await auth.verifyCredentials({
        email: "leaver@example.com",
        password: "hunter2hunter",
      });

      await auth.logout(leaverTokens.refreshToken);

      const rows = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, bystander.id));
      for (const row of rows) expect(row.revoked).toBe(false);
    });
  });
});
