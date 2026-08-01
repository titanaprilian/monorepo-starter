import path from "node:path";
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
import { users } from "@repo/db";
import { createAuthenticationService } from "./index";

const MIGRATIONS_FOLDER = path.join(import.meta.dir, "../../../../../packages/db/drizzle");

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

  test("register creates a user and stores a hashed password", async () => {
    const user = await auth.register({ email: "  Alice@Example.com ", password: "hunter2hunter" });

    expect(user.email).toBe("alice@example.com");
    expect(user.id).toBeTruthy();
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user).not.toHaveProperty("passwordHash");

    const [row] = await db.select().from(users).where(eq(users.email, "alice@example.com"));
    expect(row?.passwordHash).toBeTruthy();
    expect(row?.passwordHash).not.toBe("hunter2hunter");
    expect(row?.passwordHash).toMatch(/^\$argon2/);
  });

  test("register rejects a duplicate email", async () => {
    await auth.register({ email: "bob@example.com", password: "hunter2hunter" });
    await expect(
      auth.register({ email: "bob@example.com", password: "anotherpass" })
    ).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  test("register rejects invalid input", async () => {
    await expect(
      auth.register({ email: "not-an-email", password: "hunter2hunter" })
    ).rejects.toBeInstanceOf(InvalidRegistrationInputError);
    await expect(auth.register({ email: "c@example.com", password: "short" })).rejects.toBeInstanceOf(
      InvalidRegistrationInputError
    );
  });

  test("verifyCredentials returns the user for the correct password", async () => {
    await auth.register({ email: "carol@example.com", password: "hunter2hunter" });
    const user = await auth.verifyCredentials({
      email: "CAROL@example.com",
      password: "hunter2hunter",
    });

    expect(user.email).toBe("carol@example.com");
    expect(user.id).toBeTruthy();
  });

  test("verifyCredentials rejects an unknown email", async () => {
    await expect(
      auth.verifyCredentials({ email: "ghost@example.com", password: "hunter2hunter" })
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  test("verifyCredentials rejects a wrong password", async () => {
    await auth.register({ email: "dave@example.com", password: "hunter2hunter" });
    await expect(
      auth.verifyCredentials({ email: "dave@example.com", password: "wrongpassword" })
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});
