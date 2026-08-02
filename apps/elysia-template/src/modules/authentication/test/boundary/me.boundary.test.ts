import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { MIGRATIONS_FOLDER } from "@repo/db";
import { createAuthenticationService } from "@/modules/authentication";

describe("authentication: me / getUserProfile", () => {
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
  // getUserProfile — behavior
  // ---------------------------------------------------------------------
  describe("getUserProfile: behavior", () => {
    test("returns the user for a valid id", async () => {
      const { user } = await auth.register({
        name: "Profile Alice",
        email: "profile@example.com",
        password: "hunter2hunter",
      });
      const profile = await auth.getUserProfile(user.id);
      expect(profile.id).toBe(user.id);
      expect(profile.email).toBe("profile@example.com");
      expect(profile.name).toBe("Profile Alice");
      expect(profile).not.toHaveProperty("passwordHash");
    });

    test("rejects for an unknown user id", async () => {
      await expect(auth.getUserProfile("no-such-user")).rejects.toBeTruthy();
    });

    test("never exposes the password hash", async () => {
      const { user } = await auth.register({
        name: "Profile Bob",
        email: "profilebob@example.com",
        password: "hunter2hunter",
      });
      const profile = await auth.getUserProfile(user.id);
      expect(JSON.stringify(profile)).not.toContain("$argon2");
    });
  });
});
