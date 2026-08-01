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
import { users, type NewUserRow, type UserRow } from "@repo/db";
import { hashPassword, verifyPassword } from "./password";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD_LENGTH = 8;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validateRegistration(input: RegisterInput): void {
  if (!EMAIL_PATTERN.test(input.email.trim())) {
    throw new InvalidRegistrationInputError("email must be a valid email address");
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new InvalidRegistrationInputError(
      `password must be at least ${MIN_PASSWORD_LENGTH} characters`
    );
  }
}

function toUser(row: UserRow): User {
  return { id: row.id, email: row.email, createdAt: row.createdAt };
}

export function createAuthenticationServiceInternal<
  THKT extends PgQueryResultHKT,
  TSchema extends Record<string, unknown>,
>(
  db: PgDatabase<THKT, TSchema>
): AuthenticationService {
  return {
    async register(input: RegisterInput): Promise<User> {
      validateRegistration(input);
      const email = normalizeEmail(input.email);

      const [existing] = await db.select().from(users).where(eq(users.email, email));
      if (existing) {
        throw new EmailAlreadyRegisteredError(email);
      }

      const passwordHash = await hashPassword(input.password);
      const row: NewUserRow = {
        id: randomUUID(),
        email,
        passwordHash,
        createdAt: new Date(),
      };

      try {
        await db.insert(users).values(row);
        return toUser(row);
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

    async verifyCredentials(input: VerifyCredentialsInput): Promise<User> {
      const email = normalizeEmail(input.email);

      const [row] = await db.select().from(users).where(eq(users.email, email));
      if (!row) {
        throw new InvalidCredentialsError();
      }

      const passwordMatches = await verifyPassword(input.password, row.passwordHash);
      if (!passwordMatches) {
        throw new InvalidCredentialsError();
      }

      return toUser(row);
    },
  };
}
