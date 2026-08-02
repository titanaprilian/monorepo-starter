import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  EmailAlreadyRegisteredError,
  InvalidRegistrationInputError,
  InvalidCredentialsError,
} from "@repo/contracts";
import { users, refreshTokens, MIGRATIONS_FOLDER } from "@repo/db";
import { createAuthenticationService } from "../../index";

describe("authentication: register", () => {
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
  // register — input normalization
  // ---------------------------------------------------------------------
  describe("register: input normalization", () => {
    test("trims and lowercases email", async () => {
      const { user } = await auth.register({
        name: "Alice",
        email: "  Alice@Example.com ",
        password: "hunter2hunter",
      });
      expect(user.email).toBe("alice@example.com");
      expect(user.id).toBeTruthy();
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user).not.toHaveProperty("passwordHash");

      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.email, "alice@example.com"));
      expect(row?.passwordHash).toBeTruthy();
      expect(row?.passwordHash).not.toBe("hunter2hunter");
      expect(row?.passwordHash).toMatch(/^\$argon2/);
    });

    test("accepts plus-addressed email as a distinct, valid registration", async () => {
      const { user } = await auth.register({
        name: "Alice",
        email: "alice+newsletter@example.com",
        password: "hunter2hunter",
      });
      expect(user.email).toBe("alice+newsletter@example.com");
    });

    test("does NOT trim or otherwise mutate the password", async () => {
      // A password with meaningful leading/trailing whitespace must remain
      // exactly what the user typed. Silently trimming it would locate a
      // different credential than what verifyCredentials later receives.
      const email = "padded-pw@example.com";
      await auth.register({ name: "Alice", email, password: " hunter2hunter " });

      await expect(
        auth.verifyCredentials({ email, password: "hunter2hunter" }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);

      const { user } = await auth.verifyCredentials({
        email,
        password: " hunter2hunter ",
      });
      expect(user.email).toBe(email);
    });
  });

  // ---------------------------------------------------------------------
  // register — validation
  // ---------------------------------------------------------------------
  describe("register: input validation", () => {
    test("rejects invalid email formats", async () => {
      const invalidEmails = [
        "not-an-email",
        "missing-domain@",
        "@missing-local.com",
        "two@@at.com",
        "   ",
        "",
      ];

      for (const email of invalidEmails) {
        await expect(
          auth.register({ name: "Alice", email, password: "hunter2hunter" }),
        ).rejects.toBeInstanceOf(InvalidRegistrationInputError);
      }
    });

    test("rejects passwords below the minimum length", async () => {
      await expect(
        auth.register({
          name: "Alice",
          email: "shortpw@example.com",
          password: "short",
        }),
      ).rejects.toBeInstanceOf(InvalidRegistrationInputError);
    });

    test("rejects an empty password", async () => {
      await expect(
        auth.register({
          name: "Alice",
          email: "emptypw@example.com",
          password: "",
        }),
      ).rejects.toBeInstanceOf(InvalidRegistrationInputError);
    });

    test("accepts a password exactly at the minimum length boundary", async () => {
      const boundaryPassword = "a".repeat(8);
      const { user } = await auth.register({
        name: "Alice",
        email: "boundarypw@example.com",
        password: boundaryPassword,
      });
      expect(user.email).toBe("boundarypw@example.com");
    });

    test("rejects a missing name", async () => {
      await expect(
        auth.register({ email: "noname@example.com", password: "hunter2hunter" }),
      ).rejects.toBeInstanceOf(InvalidRegistrationInputError);
    });

    test("rejects an empty name", async () => {
      await expect(
        auth.register({
          name: "",
          email: "emptyname@example.com",
          password: "hunter2hunter",
        }),
      ).rejects.toBeInstanceOf(InvalidRegistrationInputError);
    });

    test("does not create a row when registration is rejected for invalid input", async () => {
      await expect(
        auth.register({
          name: "Alice",
          email: "not-an-email",
          password: "hunter2hunter",
        }),
      ).rejects.toBeInstanceOf(InvalidRegistrationInputError);

      const rows = await db
        .select()
        .from(users)
        .where(eq(users.email, "not-an-email"));
      expect(rows).toHaveLength(0);
    });

    test("does not create a row when registration is rejected for a missing name", async () => {
      await expect(
        auth.register({ email: "noname2@example.com", password: "hunter2hunter" }),
      ).rejects.toBeInstanceOf(InvalidRegistrationInputError);

      const rows = await db
        .select()
        .from(users)
        .where(eq(users.email, "noname2@example.com"));
      expect(rows).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------
  // register — name
  // ---------------------------------------------------------------------
  describe("register: name", () => {
    test("persists the name on the returned user and in the database", async () => {
      const { user } = await auth.register({
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "hunter2hunter",
      });
      expect(user.name).toBe("Ada Lovelace");

      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.email, "ada@example.com"));
      expect(row?.name).toBe("Ada Lovelace");
    });
  });

  // ---------------------------------------------------------------------
  // register — duplicate handling
  // ---------------------------------------------------------------------
  describe("register: duplicate email handling", () => {
    test("rejects a duplicate email", async () => {
      await auth.register({
        name: "Bob",
        email: "bob@example.com",
        password: "hunter2hunter",
      });
      await expect(
        auth.register({
          name: "Bob",
          email: "bob@example.com",
          password: "anotherpass",
        }),
      ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    });

    test("treats email uniqueness as case-insensitive", async () => {
      await auth.register({
        name: "Bob",
        email: "CaseTest@example.com",
        password: "hunter2hunter",
      });
      await expect(
        auth.register({
          name: "Bob",
          email: "casetest@example.com",
          password: "hunter2hunter",
        }),
      ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    });

    test("does not leave a duplicate row behind after a rejected duplicate registration", async () => {
      await auth.register({
        name: "Bob",
        email: "onlyone@example.com",
        password: "hunter2hunter",
      });
      await expect(
        auth.register({
          name: "Bob",
          email: "onlyone@example.com",
          password: "differentpass",
        }),
      ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);

      const rows = await db
        .select()
        .from(users)
        .where(eq(users.email, "onlyone@example.com"));
      expect(rows).toHaveLength(1);
    });

    test("only one registration succeeds when the same email races concurrently", async () => {
      const email = "race@example.com";
      const attempt = () =>
        auth.register({ name: "Bob", email, password: "hunter2hunter" });

      const results = await Promise.allSettled([attempt(), attempt()]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(
        EmailAlreadyRegisteredError,
      );

      const rows = await db.select().from(users).where(eq(users.email, email));
      expect(rows).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------
  // register — token issuance
  // ---------------------------------------------------------------------
  describe("register: token issuance", () => {
    test("returns access and refresh tokens alongside the user", async () => {
      const { user, tokens } = await auth.register({
        name: "Token Alice",
        email: "tokens@example.com",
        password: "hunter2hunter",
      });
      expect(user.id).toBeTruthy();
      expect(typeof tokens.accessToken).toBe("string");
      expect(tokens.accessToken.length).toBeGreaterThan(0);
      expect(typeof tokens.refreshToken).toBe("string");
      expect(tokens.refreshToken.length).toBeGreaterThan(0);
    });

    test("issues an access token that is a JWT", async () => {
      const { tokens } = await auth.register({
        name: "JWT Alice",
        email: "jwt@example.com",
        password: "hunter2hunter",
      });
      expect(tokens.accessToken.split(".")).toHaveLength(3);
    });

    test("persists a refresh token row for the user", async () => {
      const { user } = await auth.register({
        name: "DB Alice",
        email: "dbtoken@example.com",
        password: "hunter2hunter",
      });
      const [row] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));
      expect(row).toBeTruthy();
      expect(row?.expiresAt).toBeInstanceOf(Date);
      expect(row?.expiresAt.getTime()).toBeGreaterThan(Date.now());
      expect(row?.revoked).toBe(false);
    });

    test("stores the refresh token hashed, never in plaintext", async () => {
      const { user, tokens } = await auth.register({
        name: "Hash Alice",
        email: "hashtoken@example.com",
        password: "hunter2hunter",
      });
      const [row] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));
      expect(row?.token).toBeTruthy();
      expect(row?.token).not.toBe(tokens.refreshToken);
    });
  });

  // ---------------------------------------------------------------------
  // register — security invariants
  // ---------------------------------------------------------------------
  describe("register: security invariants", () => {
    test("identical passwords across different users produce different hashes", async () => {
      await auth.register({
        name: "Salt A",
        email: "salt-a@example.com",
        password: "hunter2hunter",
      });
      await auth.register({
        name: "Salt B",
        email: "salt-b@example.com",
        password: "hunter2hunter",
      });

      const [rowA] = await db
        .select()
        .from(users)
        .where(eq(users.email, "salt-a@example.com"));
      const [rowB] = await db
        .select()
        .from(users)
        .where(eq(users.email, "salt-b@example.com"));

      expect(rowA?.passwordHash).toBeTruthy();
      expect(rowB?.passwordHash).toBeTruthy();
      expect(rowA?.passwordHash).not.toBe(rowB?.passwordHash);
    });

    test("the returned user object never exposes the password hash under any key", async () => {
      const { user } = await auth.register({
        name: "No Leak",
        email: "noleak@example.com",
        password: "hunter2hunter",
      });
      const values = JSON.stringify(user);
      expect(values).not.toContain("$argon2");
      expect(values.toLowerCase()).not.toContain("hunter2hunter");
    });
  });
});
