import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  AccountLockedError,
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidRegistrationInputError,
  UnauthorizedError,
  UserNotFoundError,
  type AuthenticationService,
  type RegisterInput,
  type User,
  type VerifyCredentialsInput,
} from "@repo/contracts";
import { users, refreshTokens, type NewUserRow } from "@repo/db";
import { hashPassword, verifyPassword } from "./password";
import { signJwt, hashRefreshToken } from "./jwt";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD_LENGTH = 8;
const DUMMY_HASH = "$argon2id$v=19$m=65536,t=2,p=1$vgjJbKuHqF+jCFy0qUcSfo1mWkV+Pj9N8Fy4zVKvJik$beNSxuPEQ9GrO5koaX8+cwCT5eRfPcDjZuiLWAqRsL8";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateRegistration(input: RegisterInput): void {
  if (!input.name || input.name.trim() === "") {
    throw new InvalidRegistrationInputError("name is required");
  }
  if (!EMAIL_PATTERN.test(input.email.trim())) {
    throw new InvalidRegistrationInputError("email must be a valid email address");
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new InvalidRegistrationInputError(
      `password must be at least ${MIN_PASSWORD_LENGTH} characters`
    );
  }
}

function toUser(row: { id: string; email: string; name?: string | null; createdAt: Date }): User {
  return { id: row.id, name: row.name ?? undefined, email: row.email, createdAt: row.createdAt };
}

export function createAuthenticationServiceInternal<
  THKT extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<THKT, TSchema>
): AuthenticationService {
  return {
    async register(input: RegisterInput): Promise<{ user: User; tokens: { accessToken: string; refreshToken: string }; accessToken: string; refreshToken: string }> {
      validateRegistration(input);
      const email = normalizeEmail(input.email);

      const [existing] = await db.select().from(users).where(eq(users.email, email));
      if (existing) {
        throw new EmailAlreadyRegisteredError(email);
      }

      const passwordHash = await hashPassword(input.password);
      const row: NewUserRow = {
        id: randomUUID(),
        name: input.name.trim(),
        email,
        passwordHash,
        createdAt: new Date(),
      };

      const user = toUser(row);
      const accessToken = signJwt({ sub: user.id, email: user.email, name: user.name });
      const rawRefreshToken = randomUUID();
      const hashedToken = hashRefreshToken(rawRefreshToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      try {
        await db.insert(users).values(row);
        await db.insert(refreshTokens).values({
          id: randomUUID(),
          token: hashedToken,
          userId: user.id,
          expiresAt,
          revoked: false,
          createdAt: new Date(),
        });
        return {
          user,
          tokens: {
            accessToken,
            refreshToken: rawRefreshToken,
          },
          accessToken,
          refreshToken: rawRefreshToken,
        };
      } catch (e: unknown) {
        // Drizzle may wrap the underlying pgLite error
        const error = e as { cause?: { code?: string; message?: string }; code?: string; message?: string };
        const cause = error.cause || error;
        
        if (
          cause.code === "23505" || 
          cause.message?.includes("duplicate key value violates unique constraint") || 
          cause.message?.includes("UNIQUE constraint failed")
        ) {
          throw new EmailAlreadyRegisteredError(email);
        }
        throw e;
      }
    },

    async verifyCredentials(input: VerifyCredentialsInput): Promise<{ user: User; tokens: { accessToken: string; refreshToken: string }; accessToken: string; refreshToken: string }> {
      const email = normalizeEmail(input.email);

      const [row] = await db.select().from(users).where(eq(users.email, email));
      if (!row) {
        await verifyPassword(input.password, DUMMY_HASH);
        throw new InvalidCredentialsError();
      }

      if (row.lockedUntil && new Date(row.lockedUntil) > new Date()) {
        throw new AccountLockedError();
      }

      const passwordMatches = await verifyPassword(input.password, row.passwordHash);
      if (!passwordMatches) {
        const [updated] = await db
          .update(users)
          .set({
            failedAttempts: sql`${users.failedAttempts} + 1`,
          })
          .where(eq(users.id, row.id))
          .returning();

        if (updated.failedAttempts >= 5) {
          await db
            .update(users)
            .set({
              lockedUntil: new Date(Date.now() + 15 * 60 * 1000),
            })
            .where(eq(users.id, row.id));
        }

        throw new InvalidCredentialsError();
      }

      if (row.failedAttempts > 0 || row.lockedUntil !== null) {
        await db
          .update(users)
          .set({
            failedAttempts: 0,
            lockedUntil: null,
          })
          .where(eq(users.id, row.id));
      }

      const user = toUser(row);
      const accessToken = signJwt({ sub: user.id, email: user.email, name: user.name });
      const rawRefreshToken = randomUUID();
      const hashedToken = hashRefreshToken(rawRefreshToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(refreshTokens).values({
        id: randomUUID(),
        token: hashedToken,
        userId: user.id,
        expiresAt,
        revoked: false,
        createdAt: new Date(),
      });

      return {
        user,
        tokens: {
          accessToken,
          refreshToken: rawRefreshToken,
        },
        accessToken,
        refreshToken: rawRefreshToken,
      };
    },

    async getUserProfile(userId: string): Promise<User> {
      const [row] = await db.select().from(users).where(eq(users.id, userId));
      if (!row) {
        throw new UserNotFoundError();
      }
      return toUser(row);
    },

    async logout(idOrToken: string): Promise<void> {
      const hashedToken = hashRefreshToken(idOrToken);
      const [tokenRecord] = await db
        .select()
        .from(refreshTokens)
        .where(
          sql`${refreshTokens.id} = ${idOrToken} OR ${refreshTokens.token} = ${hashedToken}`
        );

      if (tokenRecord && !tokenRecord.revoked) {
        await db
          .update(refreshTokens)
          .set({
            revoked: true,
            revokedAt: new Date(),
          })
          .where(eq(refreshTokens.id, tokenRecord.id));
      }
    },

    async logoutAll(userId: string): Promise<void> {
      await db
        .delete(refreshTokens)
        .where(
          sql`${refreshTokens.userId} = ${userId} AND ${refreshTokens.revoked} = false`
        );

      await db
        .update(users)
        .set({ sessionsValidAfter: new Date() })
        .where(eq(users.id, userId));
    },

    async refresh(tokenInput: string | { refreshToken: string }): Promise<{ user: User; tokens: { accessToken: string; refreshToken: string }; accessToken: string; refreshToken: string }> {
      let token: string;
      if (typeof tokenInput === "object" && tokenInput !== null && "refreshToken" in tokenInput) {
        token = tokenInput.refreshToken;
      } else if (typeof tokenInput === "string") {
        token = tokenInput;
      } else {
        throw new UnauthorizedError("invalid or expired refresh token");
      }

      const hashedToken = hashRefreshToken(token);

      const [tokenRecord] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.token, hashedToken));

      if (!tokenRecord) {
        throw new UnauthorizedError("invalid or expired refresh token");
      }

      if (new Date(tokenRecord.expiresAt) < new Date()) {
        throw new UnauthorizedError("invalid or expired refresh token");
      }

      const [userRecord] = await db
        .select()
        .from(users)
        .where(eq(users.id, tokenRecord.userId));

      if (!userRecord) {
        throw new UnauthorizedError("user not found");
      }

      if (userRecord.lockedUntil && new Date(userRecord.lockedUntil) > new Date()) {
        throw new UnauthorizedError("account is locked");
      }

      if (userRecord.sessionsValidAfter && new Date(tokenRecord.createdAt) < new Date(userRecord.sessionsValidAfter)) {
        throw new UnauthorizedError("invalid or expired refresh token");
      }

      if (tokenRecord.revoked) {
        // Reuse detected! Revoke all tokens for this user.
        await db
          .update(refreshTokens)
          .set({
            revoked: true,
            revokedAt: sql`COALESCE(${refreshTokens.revokedAt}, NOW())`,
          })
          .where(eq(refreshTokens.userId, tokenRecord.userId));
        throw new UnauthorizedError("refresh token has been revoked");
      }

      // Mark the current token as revoked
      await db
        .update(refreshTokens)
        .set({
          revoked: true,
          revokedAt: new Date(),
        })
        .where(eq(refreshTokens.id, tokenRecord.id));

      const user = toUser(userRecord);
      const accessToken = signJwt({ sub: user.id, email: user.email, name: user.name });
      const rawRefreshToken = randomUUID();
      const newHashedToken = hashRefreshToken(rawRefreshToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(refreshTokens).values({
        id: randomUUID(),
        token: newHashedToken,
        userId: user.id,
        expiresAt,
        revoked: false,
        createdAt: new Date(),
      });

      return {
        user,
        tokens: {
          accessToken,
          refreshToken: rawRefreshToken,
        },
        accessToken,
        refreshToken: rawRefreshToken,
      };
    },
  };
}
