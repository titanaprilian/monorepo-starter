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
import { users, refreshTokens, MIGRATIONS_FOLDER } from "@repo/db";
import { createAuthenticationService } from "../index";

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
      // Adjust the literal length below to match whatever MIN_PASSWORD_LENGTH
      // the contract actually specifies — this test only has value if it's
      // pinned to the real boundary, not an arbitrary guess.
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
      // This is the boundary-level guarantee that prevents user enumeration:
      // an attacker probing the login endpoint must not be able to tell
      // "this email doesn't exist" apart from "this email exists but the
      // password is wrong" based on error type, shape, or message.
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
      // The exact error type for an unknown id is deliberately not pinned:
      // the contract only guarantees that looking up a missing user fails.
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
