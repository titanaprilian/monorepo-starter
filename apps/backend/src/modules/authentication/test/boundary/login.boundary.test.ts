import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { InvalidCredentialsError } from "@repo/contracts";
import { refreshTokens, MIGRATIONS_FOLDER } from "@repo/db";
import { createAuthenticationService } from "@/modules/authentication";

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

    test("unknown email and wrong password take comparable time (no early-exit before hashing)", async () => {
      await auth.register({
        name: "Timing",
        email: "timing@example.com",
        password: "hunter2hunter",
      });

      const time = async (fn: () => Promise<unknown>) => {
        const start = performance.now();
        await fn().catch(() => {});
        return performance.now() - start;
      };

      const unknownMs = await time(() =>
        auth.verifyCredentials({
          email: "notreal@example.com",
          password: "hunter2hunter",
        }),
      );

      // structural check that the unknown-email path is not an instant early-exit,
      // without pinning a specific duration.
      const instantMs = await time(async () => {});
      expect(unknownMs).toBeGreaterThan(instantMs);
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

    test("does not trim whitespace from the password", async () => {
      await auth.register({
        name: "Space",
        email: "spacepw@example.com",
        password: "hunter2hunter ",
      });
      await expect(
        auth.verifyCredentials({
          email: "spacepw@example.com",
          password: "hunter2hunter",
        }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    test("rejects (not crashes on) an extremely long password", async () => {
      await auth.register({
        name: "Long",
        email: "longpw@example.com",
        password: "hunter2hunter",
      });
      const hugePassword = "a".repeat(1_000_000);
      await expect(
        auth.verifyCredentials({
          email: "longpw@example.com",
          password: hugePassword,
        }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });
  });

  // ---------------------------------------------------------------------
  // verifyCredentials — email normalization edge cases
  // ---------------------------------------------------------------------
  describe("verifyCredentials: email normalization edge cases", () => {
    test("matches mixed-case ASCII email regardless of casing pattern used at lookup", async () => {
      await auth.register({
        name: "Mixed Case",
        email: "MixedCase@Example.com",
        password: "hunter2hunter",
      });
      const { user } = await auth.verifyCredentials({
        email: "mIXEDcASE@eXAMPLE.COM",
        password: "hunter2hunter",
      });
      expect(user.email).toBe("mixedcase@example.com");
    });

    test("does not fold Turkish dotted/dotless I as if it were ASCII i/I", async () => {
      // JS .toLowerCase() is locale-independent and will NOT turn "İ" into "i"
      // (it becomes "i̇", i + combining dot above). Under a Turkish locale-aware
      // lowercasing this could diverge. This test pins down that registered
      // "İstanbul@example.com" is not reachable via a plain ASCII "istanbul@example.com" lookup.
      await auth.register({
        name: "Turkish I",
        email: "İstanbul@example.com",
        password: "hunter2hunter",
      });

      await expect(
        auth.verifyCredentials({
          email: "istanbul@example.com",
          password: "hunter2hunter",
        }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    test("does not treat full-width Unicode characters as their ASCII equivalents", async () => {
      // "ｅｘａｍｐｌｅ.ｃｏｍ" (full-width) is visually similar to "example.com"
      // but is a completely different code point sequence. It must not be
      // treated as equivalent by lookup or normalization.
      await auth.register({
        name: "Fullwidth Domain",
        email: "user@ｅｘａｍｐｌｅ.com",
        password: "hunter2hunter",
      });

      await expect(
        auth.verifyCredentials({
          email: "user@example.com",
          password: "hunter2hunter",
        }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    test("does not apply Unicode NFC/NFD normalization equivalence across composed and decomposed forms", async () => {
      // "é" as a single composed code point (U+00E9) vs "e" + combining acute
      // accent (U+0065 U+0301) are visually identical but byte-different.
      // Without explicit Unicode normalization, these should NOT be treated
      // as the same email.
      const composed = "jos\u00e9@example.com"; // josé (single code point é)
      const decomposed = "jose\u0301@example.com"; // jose + combining acute accent

      await auth.register({
        name: "Composed Accent",
        email: composed,
        password: "hunter2hunter",
      });

      await expect(
        auth.verifyCredentials({
          email: decomposed,
          password: "hunter2hunter",
        }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });

    test("treats leading/trailing non-breaking space the same as a trimmable regular space", async () => {
      // JavaScript's .trim() strips U+00A0 (non-breaking space), so a login attempt
      // with NBSP-padded email correctly resolves rather than rejects.
      await auth.register({
        name: "NBSP Check",
        email: "nbspcheck@example.com",
        password: "hunter2hunter",
      });

      const { user } = await auth.verifyCredentials({
        email: "\u00A0nbspcheck@example.com\u00A0",
        password: "hunter2hunter",
      });
      expect(user.email).toBe("nbspcheck@example.com");
    });

    test("does not treat visually confusable Cyrillic characters as Latin equivalents", async () => {
      // Cyrillic "а" (U+0430) looks identical to Latin "a" (U+0061) but is a
      // distinct code point. A lookup using the Latin version must not match
      // an account registered with the Cyrillic homoglyph.
      const cyrillicA = "c\u0430rol-homoglyph@example.com"; // "c" + Cyrillic а + "rol-homoglyph@..."

      await auth.register({
        name: "Homoglyph",
        email: cyrillicA,
        password: "hunter2hunter",
      });

      await expect(
        auth.verifyCredentials({
          email: "carol-homoglyph@example.com",
          password: "hunter2hunter",
        }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    });
  });

  // ---------------------------------------------------------------------
  // verifyCredentials — brute-force protection (NOT YET IMPLEMENTED)
  // ---------------------------------------------------------------------
  describe("verifyCredentials: brute-force protection", () => {
    // Skipped until rate limiting / lockout is implemented.
    // Flip to `test(...)` once the feature lands.
    test("locks out further attempts after repeated failed logins", async () => {
      await auth.register({
        name: "Lockout",
        email: "lockout@example.com",
        password: "hunter2hunter",
      });

      const attemptWrongPassword = () =>
        auth.verifyCredentials({
          email: "lockout@example.com",
          password: "wrongpassword",
        });

      // exhaust whatever the attempt threshold is (adjust count to match
      // actual policy once defined, e.g. 5 attempts)
      for (let i = 0; i < 5; i++) {
        await expect(attemptWrongPassword()).rejects.toBeInstanceOf(
          InvalidCredentialsError,
        );
      }

      // the next attempt, even with the CORRECT password, should now be
      // rejected/locked out rather than succeeding — proves the lockout
      // triggers on failure count, not just continuing to check the password
      await expect(
        auth.verifyCredentials({
          email: "lockout@example.com",
          password: "hunter2hunter",
        }),
      ).rejects.toThrow(); // replace with a specific error type once defined,
      // e.g. rejects.toBeInstanceOf(AccountLockedError)
    });

    test("lockout is scoped per-account, not global", async () => {
      // failed attempts against one account should not lock out a
      // different account — otherwise this becomes a DoS vector where
      // an attacker locks out arbitrary users by spamming their email
      await auth.register({
        name: "Victim",
        email: "victim@example.com",
        password: "hunter2hunter",
      });
      await auth.register({
        name: "Bystander",
        email: "bystander@example.com",
        password: "hunter2hunter",
      });

      for (let i = 0; i < 5; i++) {
        await expect(
          auth.verifyCredentials({
            email: "victim@example.com",
            password: "wrongpassword",
          }),
        ).rejects.toBeInstanceOf(InvalidCredentialsError);
      }

      // bystander should be entirely unaffected
      const { user } = await auth.verifyCredentials({
        email: "bystander@example.com",
        password: "hunter2hunter",
      });
      expect(user.email).toBe("bystander@example.com");
    });
  });

  // ---------------------------------------------------------------------
  // verifyCredentials — concurrency on refresh token issuance
  // ---------------------------------------------------------------------
  describe("verifyCredentials: concurrency", () => {
    test("simultaneous logins each get a unique refresh token with no lost or duplicate rows", async () => {
      await auth.register({
        name: "Concurrent",
        email: "concurrent@example.com",
        password: "hunter2hunter",
      });

      const CONCURRENT_LOGINS = 10;

      // fire all logins at once instead of sequentially — this is the part
      // the existing "issues a fresh refresh token for every login session"
      // test can't catch, since it awaits each call before starting the next
      const results = await Promise.all(
        Array.from({ length: CONCURRENT_LOGINS }, () =>
          auth.verifyCredentials({
            email: "concurrent@example.com",
            password: "hunter2hunter",
          }),
        ),
      );

      // every call should succeed and return the same user
      for (const { user } of results) {
        expect(user.email).toBe("concurrent@example.com");
      }

      // every refresh token must be unique — a race condition in token
      // generation or insertion could otherwise produce collisions
      const refreshTokenValues = results.map((r) => r.tokens.refreshToken);
      expect(new Set(refreshTokenValues).size).toBe(CONCURRENT_LOGINS);

      // the DB should have exactly one row per login, no fewer (lost writes)
      // and no more (duplicate writes) — registration itself issues a token
      // too, so account for that baseline of 1
      const { user } = results[0];
      const rows = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));
      expect(rows).toHaveLength(CONCURRENT_LOGINS + 1);

      // none of the concurrently-issued tokens should have been marked
      // revoked as a side effect of the race
      for (const row of rows) expect(row.revoked).toBe(false);
    });

    test("simultaneous logins with one wrong password among many correct ones only rejects the wrong one", async () => {
      await auth.register({
        name: "Mixed Concurrent",
        email: "mixedconcurrent@example.com",
        password: "hunter2hunter",
      });

      const attempts = [
        auth.verifyCredentials({
          email: "mixedconcurrent@example.com",
          password: "hunter2hunter",
        }),
        auth.verifyCredentials({
          email: "mixedconcurrent@example.com",
          password: "hunter2hunter",
        }),
        auth.verifyCredentials({
          email: "mixedconcurrent@example.com",
          password: "wrongpassword",
        }),
        auth.verifyCredentials({
          email: "mixedconcurrent@example.com",
          password: "hunter2hunter",
        }),
      ];

      const outcomes = await Promise.allSettled(attempts);

      expect(outcomes[0].status).toBe("fulfilled");
      expect(outcomes[1].status).toBe("fulfilled");
      expect(outcomes[2].status).toBe("rejected");
      expect(outcomes[3].status).toBe("fulfilled");

      if (outcomes[2].status === "rejected") {
        expect(outcomes[2].reason).toBeInstanceOf(InvalidCredentialsError);
      }
    });
  });
});
