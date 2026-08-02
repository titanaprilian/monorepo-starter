import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidRegistrationInputError,
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
    async register(input: RegisterInput): Promise<{ user: User; tokens: { accessToken: string; refreshToken: string } }> {
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
          token: hashedToken,
          userId: user.id,
          expiresAt,
          revoked: false,
        });
        return {
          user,
          tokens: {
            accessToken,
            refreshToken: rawRefreshToken,
          },
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

    async verifyCredentials(input: VerifyCredentialsInput): Promise<{ user: User; tokens: { accessToken: string; refreshToken: string } }> {
      const email = normalizeEmail(input.email);

      const [row] = await db.select().from(users).where(eq(users.email, email));
      if (!row) {
        throw new InvalidCredentialsError();
      }

      const passwordMatches = await verifyPassword(input.password, row.passwordHash);
      if (!passwordMatches) {
        throw new InvalidCredentialsError();
      }

      const user = toUser(row);
      const accessToken = signJwt({ sub: user.id, email: user.email, name: user.name });
      const rawRefreshToken = randomUUID();
      const hashedToken = hashRefreshToken(rawRefreshToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      await db.insert(refreshTokens).values({
        token: hashedToken,
        userId: user.id,
        expiresAt,
        revoked: false,
      });

      return {
        user,
        tokens: {
          accessToken,
          refreshToken: rawRefreshToken,
        },
      };
    },

    async getUserProfile(userId: string): Promise<User> {
      const [row] = await db.select().from(users).where(eq(users.id, userId));
      if (!row) {
        throw new Error("User not found");
      }
      return toUser(row);
    },

    async logout(token: string): Promise<void> {
      const hashedToken = hashRefreshToken(token);
      await db
        .update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.token, hashedToken));
    },

    async logoutAll(userId: string): Promise<void> {
      await db
        .update(refreshTokens)
        .set({ revoked: true })
        .where(eq(refreshTokens.userId, userId));
    },
  };
}
