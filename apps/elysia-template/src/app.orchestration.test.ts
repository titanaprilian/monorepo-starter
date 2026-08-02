import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { AuthenticationService } from "@repo/contracts";
import { MIGRATIONS_FOLDER, type DbClient } from "@repo/db";
import { createApp, type App } from "./app";
import { createAuthenticationService } from "./modules/authentication";

function createTestDb(client: PGlite): DbClient {
  const pgliteDb = drizzle(client);
  const db = Object.create(pgliteDb);
  db.$client = {
    ...pgliteDb.$client,
    unsafe: async (query: string, params?: unknown[]) => {
      const result = await pgliteDb.$client.query(query, params);
      return result.rows;
    },
  };
  return db as unknown as DbClient;
}

describe("app composition root (Tier 3)", () => {
  let client: PGlite;
  let db: DbClient;
  let auth: AuthenticationService;
  let app: App;

  beforeAll(async () => {
    client = new PGlite();
    const pgliteDb = drizzle(client);
    await migrate(pgliteDb, { migrationsFolder: MIGRATIONS_FOLDER });
    db = createTestDb(client);
    auth = createAuthenticationService(db);
    app = createApp({ db, auth });
  });

  afterAll(async () => {
    await client.close();
  });

  test("GET /health returns ok against the injected database", async () => {
    const response = await app.handle(new Request("http://localhost/health"));
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({ status: "ok", db: true });
  });

  test("POST /auth/register persists a user end-to-end", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "e2e@example.com", password: "hunter2hunter" }),
      })
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.email).toBe("e2e@example.com");
    expect(json.data.id).toBeTruthy();
  });

  test("POST /auth/login authenticates an existing user end-to-end", async () => {
    const register = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "login-e2e@example.com", password: "hunter2hunter" }),
      })
    );
    expect(register.status).toBe(200);

    const login = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "login-e2e@example.com", password: "hunter2hunter" }),
      })
    );
    expect(login.status).toBe(200);
    const json = await login.json();
    expect(json.data.email).toBe("login-e2e@example.com");
  });

  test("POST /auth/register returns 409 for a duplicate email across the composed app", async () => {
    const first = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "dup@example.com", password: "hunter2hunter" }),
      })
    );
    expect(first.status).toBe(200);

    const second = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "dup@example.com", password: "hunter2hunter" }),
      })
    );
    expect(second.status).toBe(409);
    const json = await second.json();
    expect(json.error.code).toBe("EMAIL_ALREADY_REGISTERED");
    expect(json.error.message).toBe("email already registered: dup@example.com");
  });

  test("unknown routes fall through to the default 404", async () => {
    const response = await app.handle(new Request("http://localhost/unknown"));
    expect(response.status).toBe(404);
  });

  test("global error handling maps unhandled errors to 500", async () => {
    const failingAuth: AuthenticationService = {
      register: async () => {
        throw new Error("database exploded");
      },
      verifyCredentials: async () => {
        throw new Error("database exploded");
      },
    };

    const failingApp = createApp({ db, auth: failingAuth });
    const response = await failingApp.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "boom@example.com", password: "hunter2hunter" }),
      })
    );
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error.code).toBe("INTERNAL_SERVER");
    expect(json.error.message).toBe("internal server error");
  });
});
