import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { UnauthorizedError } from "@repo/contracts";
import { refreshTokens, users, MIGRATIONS_FOLDER } from "@repo/db";
import { createAuthenticationService } from "@/modules/authentication";
import { hashRefreshToken } from "@/modules/authentication/internal/jwt";

describe("authentication: refresh", () => {
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

  test("successfully rotates refresh token and returns new tokens", async () => {
    const { tokens: initialTokens, user } = await auth.register({
      name: "Refresh Success",
      email: "refresh_success@example.com",
      password: "password123",
    });

    const initialHashed = hashRefreshToken(initialTokens.refreshToken);

    // Initial check
    const [initialRow] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, initialHashed));
    expect(initialRow.revoked).toBe(false);

    // Perform refresh
    const { tokens: newTokens, user: refreshedUser } = await auth.refresh(
      initialTokens.refreshToken,
    );

    expect(refreshedUser.id).toBe(user.id);
    expect(refreshedUser.email).toBe(user.email);
    expect(newTokens.accessToken).toBeTruthy();
    expect(newTokens.refreshToken).toBeTruthy();
    expect(newTokens.refreshToken).not.toBe(initialTokens.refreshToken);

    // Verify old is revoked
    const [updatedInitialRow] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, initialHashed));
    expect(updatedInitialRow.revoked).toBe(true);

    // Verify new is valid (not revoked)
    const newHashed = hashRefreshToken(newTokens.refreshToken);
    const [newRow] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, newHashed));
    expect(newRow.revoked).toBe(false);
  });

  test("detects reuse and revokes all refresh tokens for the user", async () => {
    const { tokens: initialTokens } = await auth.register({
      name: "Refresh Reuse",
      email: "refresh_reuse@example.com",
      password: "password123",
    });

    // First refresh (valid)
    const { tokens: nextTokens } = await auth.refresh(
      initialTokens.refreshToken,
    );

    // Verify next token is not revoked yet
    const nextHashed = hashRefreshToken(nextTokens.refreshToken);
    const [nextRowBefore] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, nextHashed));
    expect(nextRowBefore.revoked).toBe(false);

    // Reuse the initial token
    await expect(
      auth.refresh(initialTokens.refreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    // Verify ALL user's tokens are now revoked
    const [nextRowAfter] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, nextHashed));
    expect(nextRowAfter.revoked).toBe(true);
  });

  test("rejects invalid, malformed, or non-existent refresh tokens", async () => {
    await expect(auth.refresh("non-existent-token")).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(auth.refresh("")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  test("rejects expired refresh tokens", async () => {
    const { tokens } = await auth.register({
      name: "Refresh Expired",
      email: "refresh_expired@example.com",
      password: "password123",
    });

    const hashedToken = hashRefreshToken(tokens.refreshToken);

    // Manually expire the token in the DB
    await db
      .update(refreshTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(refreshTokens.token, hashedToken));

    await expect(auth.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  test("rejects refresh for a locked user", async () => {
    const { tokens, user } = await auth.register({
      name: "Refresh Locked",
      email: "refresh_locked@example.com",
      password: "password123",
    });

    // Manually lock the user in the DB
    await db
      .update(users)
      .set({ lockedUntil: new Date(Date.now() + 15 * 60 * 1000) })
      .where(eq(users.id, user.id));

    await expect(auth.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  test("reuse detection revokes tokens across independent sessions, not just the same chain", async () => {
    const { user, tokens: sessionOneTokens } = await auth.register({
      name: "Refresh Cross Session",
      email: "refresh_cross_session@example.com",
      password: "password123",
    });

    // a genuinely separate login — its own chain, not derived from
    // sessionOneTokens via refresh()
    const { tokens: sessionTwoTokens } = await auth.verifyCredentials({
      email: "refresh_cross_session@example.com",
      password: "password123",
    });

    // advance session one's chain once, so we have a used-up token to replay
    await auth.refresh(sessionOneTokens.refreshToken);

    // verify session two is untouched before the reuse event
    const sessionTwoHashed = hashRefreshToken(sessionTwoTokens.refreshToken);
    const [sessionTwoRowBefore] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, sessionTwoHashed));
    expect(sessionTwoRowBefore.revoked).toBe(false);

    // trigger reuse detection on session one's already-consumed token
    await expect(
      auth.refresh(sessionOneTokens.refreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedError);

    // the critical assertion: session two — a completely independent login —
    // must also be revoked. If reuse detection only walks the offending
    // token's own lineage, this will fail while the narrower same-chain
    // test still passes.
    const [sessionTwoRowAfter] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.token, sessionTwoHashed));
    expect(sessionTwoRowAfter.revoked).toBe(true);

    // and prove it's actually enforced, not just flagged in the DB
    await expect(
      auth.refresh(sessionTwoTokens.refreshToken),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
