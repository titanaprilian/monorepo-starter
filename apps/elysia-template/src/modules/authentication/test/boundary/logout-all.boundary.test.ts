import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { refreshTokens, MIGRATIONS_FOLDER } from "@repo/db";
import { createAuthenticationService } from "@/modules/authentication";

describe("authentication: logout-all — security", () => {
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

  // -------------------------------------------------------------------
  // #1 — revoked tokens must actually be REJECTED, not just flagged
  // -------------------------------------------------------------------
  // This is the test that proves logoutAll does what it claims. Setting
  // revoked=true in Postgres is an implementation detail; the contract
  // users care about is "my old session can no longer be used." If the
  // refresh/rotate path forgets to check `revoked`, every other test in
  // the suite can still pass while the feature is completely broken.
  describe("logoutAll: revoked tokens are rejected by refresh", () => {
    test("a token issued before logoutAll cannot be used to refresh afterward", async () => {
      const { user } = await auth.register({
        name: "Reject Rita",
        email: "reject-rita@example.com",
        password: "hunter2hunter",
      });

      // ASSUMPTION: verifyCredentials returns the raw refresh token string
      // (or an object containing it) so we can attempt to reuse it later.
      const session = await auth.verifyCredentials({
        email: "reject-rita@example.com",
        password: "hunter2hunter",
      });
      const staleRefreshToken = session.refreshToken;

      await auth.logoutAll(user.id);

      // ASSUMPTION: the method that consumes a refresh token is named
      // `refresh` / `rotateToken` and throws on an invalid/revoked token.
      // Rename to match your actual service method.
      await expect(
        auth.refresh({ refreshToken: staleRefreshToken }),
      ).rejects.toThrow();
    });

    test("a token issued AFTER logoutAll still works (no over-broad lockout)", async () => {
      // Guards against an overzealous fix — e.g. someone "fixing" #1 by
      // rejecting all tokens with a stale issuedAt, instead of checking
      // the revoked flag on the specific row.
      const { user } = await auth.register({
        name: "Reject Rob",
        email: "reject-rob@example.com",
        password: "hunter2hunter",
      });

      await auth.verifyCredentials({
        email: "reject-rob@example.com",
        password: "hunter2hunter",
      });
      await auth.logoutAll(user.id);

      const freshSession = await auth.verifyCredentials({
        email: "reject-rob@example.com",
        password: "hunter2hunter",
      });

      await expect(
        auth.refresh({ refreshToken: freshSession.refreshToken }),
      ).resolves.toBeDefined();
    });
  });

  // -------------------------------------------------------------------
  // #3 — zero-token user is a no-op, not an error
  // -------------------------------------------------------------------
  describe("logoutAll: user with no sessions", () => {
    test("does not throw when the user has never logged in", async () => {
      const { user } = await auth.register({
        name: "Never Logged In",
        email: "nologin@example.com",
        password: "hunter2hunter",
      });

      await expect(auth.logoutAll(user.id)).resolves.not.toThrow();

      const rows = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));
      expect(rows).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------
  // #2 — logoutAll must not clobber existing revocation metadata
  // -------------------------------------------------------------------
  // If a token was already revoked earlier (e.g. a single-session
  // logout, or a prior logoutAll), calling logoutAll again should not
  // silently overwrite its original revokedAt timestamp. Preserving the
  // first revocation time matters for audit trails / incident forensics
  // ("when did this session actually die?").
  describe("logoutAll: does not overwrite existing revocation timestamps", () => {
    test("a token revoked before logoutAll keeps its original revokedAt", async () => {
      const { user } = await auth.register({
        name: "Already Revoked Amy",
        email: "already-revoked@example.com",
        password: "hunter2hunter",
      });

      await auth.verifyCredentials({
        email: "already-revoked@example.com",
        password: "hunter2hunter",
      });

      const [row] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.userId, user.id));

      // ASSUMPTION: there's a single-session logout method, e.g.
      // auth.logout(refreshTokenId) or auth.revokeToken(id). Rename to
      // match your actual service API.
      await auth.logout(row.id);

      const [revokedBefore] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.id, row.id));
      const originalRevokedAt = revokedBefore.revokedAt;
      expect(originalRevokedAt).not.toBeNull();

      // Give logoutAll a real time gap to work with, so an overwrite
      // would be detectable rather than accidentally identical.
      await new Promise((resolve) => setTimeout(resolve, 5));

      await auth.logoutAll(user.id);

      const [revokedAfter] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.id, row.id));

      expect(revokedAfter.revoked).toBe(true);
      expect(revokedAfter.revokedAt).toEqual(originalRevokedAt);
    });
  });
});
