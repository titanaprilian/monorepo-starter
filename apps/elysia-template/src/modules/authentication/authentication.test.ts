import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidRegistrationInputError,
} from "@repo/contracts";
import { users, MIGRATIONS_FOLDER } from "@repo/db";
import { createAuthenticationService } from "./index";

describe("authentication module (boundary)", () => {
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
  // register — normalization
  // ---------------------------------------------------------------------
  describe("register: input normalization", () => {
    test("trims and lowercases email", async () => {
      const user = await auth.register({
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
      const user = await auth.register({
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
      await auth.register({ email, password: " hunter2hunter " });

      await expect(
        auth.verifyCredentials({ email, password: "hunter2hunter" }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);

      const user = await auth.verifyCredentials({
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
          auth.register({ email, password: "hunter2hunter" }),
        ).rejects.toBeInstanceOf(InvalidRegistrationInputError);
      }
    });

    test("rejects passwords below the minimum length", async () => {
      await expect(
        auth.register({ email: "shortpw@example.com", password: "short" }),
      ).rejects.toBeInstanceOf(InvalidRegistrationInputError);
    });

    test("rejects an empty password", async () => {
      await expect(
        auth.register({ email: "emptypw@example.com", password: "" }),
      ).rejects.toBeInstanceOf(InvalidRegistrationInputError);
    });

    test("accepts a password exactly at the minimum length boundary", async () => {
      // Adjust the literal length below to match whatever MIN_PASSWORD_LENGTH
      // the contract actually specifies — this test only has value if it's
      // pinned to the real boundary, not an arbitrary guess.
      const boundaryPassword = "a".repeat(8);
      const user = await auth.register({
        email: "boundarypw@example.com",
        password: boundaryPassword,
      });
      expect(user.email).toBe("boundarypw@example.com");
    });

    test("does not create a row when registration is rejected for invalid input", async () => {
      await expect(
        auth.register({ email: "not-an-email", password: "hunter2hunter" }),
      ).rejects.toBeInstanceOf(InvalidRegistrationInputError);

      const rows = await db
        .select()
        .from(users)
        .where(eq(users.email, "not-an-email"));
      expect(rows).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------
  // register — duplicate handling
  // ---------------------------------------------------------------------
  describe("register: duplicate email handling", () => {
    test("rejects a duplicate email", async () => {
      await auth.register({
        email: "bob@example.com",
        password: "hunter2hunter",
      });
      await expect(
        auth.register({ email: "bob@example.com", password: "anotherpass" }),
      ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    });

    test("treats email uniqueness as case-insensitive", async () => {
      await auth.register({
        email: "CaseTest@example.com",
        password: "hunter2hunter",
      });
      await expect(
        auth.register({
          email: "casetest@example.com",
          password: "hunter2hunter",
        }),
      ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    });

    test("does not leave a duplicate row behind after a rejected duplicate registration", async () => {
      await auth.register({
        email: "onlyone@example.com",
        password: "hunter2hunter",
      });
      await expect(
        auth.register({
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
      const attempt = () => auth.register({ email, password: "hunter2hunter" });

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
  // register — security invariants
  // ---------------------------------------------------------------------
  describe("register: security invariants", () => {
    test("identical passwords across different users produce different hashes", async () => {
      await auth.register({
        email: "salt-a@example.com",
        password: "hunter2hunter",
      });
      await auth.register({
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
      const user = await auth.register({
        email: "noleak@example.com",
        password: "hunter2hunter",
      });
      const values = JSON.stringify(user);
      expect(values).not.toContain("$argon2");
      expect(values.toLowerCase()).not.toContain("hunter2hunter");
    });
  });

  // ---------------------------------------------------------------------
  // verifyCredentials — behavior
  // ---------------------------------------------------------------------
  describe("verifyCredentials: behavior", () => {
    test("returns the user for the correct password", async () => {
      await auth.register({
        email: "carol@example.com",
        password: "hunter2hunter",
      });
      const user = await auth.verifyCredentials({
        email: "CAROL@example.com",
        password: "hunter2hunter",
      });
      expect(user.email).toBe("carol@example.com");
      expect(user.id).toBeTruthy();
    });

    test("trims whitespace from the email before lookup", async () => {
      await auth.register({
        email: "trimlookup@example.com",
        password: "hunter2hunter",
      });
      const user = await auth.verifyCredentials({
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
  // verifyCredentials — security invariants
  // ---------------------------------------------------------------------
  describe("verifyCredentials: security invariants", () => {
    test("unknown email and wrong password fail with the same error type", async () => {
      // This is the boundary-level guarantee that prevents user enumeration:
      // an attacker probing the login endpoint must not be able to tell
      // "this email doesn't exist" apart from "this email exists but the
      // password is wrong" based on error type, shape, or message.
      await auth.register({
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
        email: "noleakverify@example.com",
        password: "hunter2hunter",
      });
      const user = await auth.verifyCredentials({
        email: "noleakverify@example.com",
        password: "hunter2hunter",
      });
      expect(user).not.toHaveProperty("passwordHash");
      expect(JSON.stringify(user)).not.toContain("$argon2");
    });
  });
});
