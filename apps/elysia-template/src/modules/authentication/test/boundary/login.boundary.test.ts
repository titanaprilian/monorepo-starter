import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  InvalidCredentialsError,
} from "@repo/contracts";
import { users, refreshTokens, MIGRATIONS_FOLDER } from "@repo/db";
import { createAuthenticationService } from "../../index";

describe("authentication: login / verifyCredentials", () => {
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
  // verifyCredentials — behavior
  // ---------------------------------------------------------------------
  describe("verifyCredentials: behavior", () => {
    test("returns the user for the correct password", async () => {
      await auth.register({
        name: "Carol",
        email: "carol@example.com",
        password: "hunter2hunter",
      });
      const { user } = await auth.verifyCredentials({
        email: "CAROL@example.com",
        password: "hunter2hunter",
      });
      expect(user.email).toBe("carol@example.com");
      expect(user.id).toBeTruthy();
    });

    test("trims whitespace from the email before lookup", async () => {
      await auth.register({
        name: "Carol",
        email: "trimlookup@example.com",
        password: "hunter2hunter",
      });
      const { user } = await auth.verifyCredentials({
        email: "  trimlookup@example.com  ",
        password: "hunter2hunter",
      });
      expect(user.email).toBe("trimlookup@example.com");
    });

    test("rejects an unknown email", async () => {
      await expect(
        auth.verifyCredentials({
          email: "ghost@example.com",
          password: "hunter2hunter",
        }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    test("rejects a wrong password", async () => {
      await auth.register({
        name: "Dave",
        email: "dave@example.com",
        password: "hunter2hunter",
      });
      await expect(
        auth.verifyCredentials({
          email: "dave@example.com",
          password: "wrongpassword",
        }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    test("treats password comparison as case-sensitive", async () => {
      await auth.register({
        name: "Dave",
        email: "casepw@example.com",
        password: "Hunter2Hunter",
      });
      await expect(
        auth.verifyCredentials({
          email: "casepw@example.com",
          password: "hunter2hunter",
        }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    test("rejects an empty password against a real account", async () => {
      await auth.register({
        name: "Dave",
        email: "nonemptycheck@example.com",
        password: "hunter2hunter",
      });
      await expect(
        auth.verifyCredentials({
          email: "nonemptycheck@example.com",
          password: "",
        }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });
  });

  // ---------------------------------------------------------------------
  // verifyCredentials — token issuance
  // ---------------------------------------------------------------------
  describe("verifyCredentials: token issuance", () => {
    test("returns access and refresh tokens alongside the user", async () => {
      await auth.register({
        name: "Login Tokens",
        email: "logintokens@example.com",
        password: "hunter2hunter",
      });
      const { user, tokens } = await auth.verifyCredentials({
        email: "logintokens@example.com",
        password: "hunter2hunter",
      });
      expect(user.name).toBe("Login Tokens");
      expect(tokens.accessToken.split(".")).toHaveLength(3);
      expect(tokens.refreshToken.length).toBeGreaterThan(0);
    });

    test("issues a fresh refresh token for every login session", async () => {
      await auth.register({
        name: "Multi Session",
        email: "multisession@example.com",
        password: "hunter2hunter",
      });
      const first = await auth.verifyCredentials({
        email: "multisession@example.com",
        password: "hunter2hunter",
      });
      const second = await auth.verifyCredentials({
        email: "multisession@example.com",
        password: "hunter2hunter",
      });
      expect(first.tokens.refreshToken).not.toBe(second.tokens.refreshToken);

      const { user } = first;
      const rows = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));
      expect(rows).toHaveLength(3);
      for (const row of rows) expect(row.revoked).toBe(false);
    });
  });

  // ---------------------------------------------------------------------
  // verifyCredentials — security invariants
  // ---------------------------------------------------------------------
  describe("verifyCredentials: security invariants", () => {
    test("unknown email and wrong password fail with the same error type", async () => {
      await auth.register({
        name: "Enum Check",
        email: "enumcheck@example.com",
        password: "hunter2hunter",
      });

      let unknownEmailError: unknown;
      let wrongPasswordError: unknown;

      try {
        await auth.verifyCredentials({
          email: "doesnotexist@example.com",
          password: "hunter2hunter",
        });
      } catch (err) {
        unknownEmailError = err;
      }

      try {
        await auth.verifyCredentials({
          email: "enumcheck@example.com",
          password: "wrongpassword",
        });
      } catch (err) {
        wrongPasswordError = err;
      }

      expect(unknownEmailError).toBeInstanceOf(InvalidCredentialsError);
      expect(wrongPasswordError).toBeInstanceOf(InvalidCredentialsError);
      expect((unknownEmailError as Error).message).toBe(
        (wrongPasswordError as Error).message,
      );
    });

    test("the returned user object never exposes the password hash", async () => {
      await auth.register({
        name: "No Leak",
        email: "noleakverify@example.com",
        password: "hunter2hunter",
      });
      const { user } = await auth.verifyCredentials({
        email: "noleakverify@example.com",
        password: "hunter2hunter",
      });
      expect(user).not.toHaveProperty("passwordHash");
      expect(JSON.stringify(user)).not.toContain("$argon2");
    });
  });
});
