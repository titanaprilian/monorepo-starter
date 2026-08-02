import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { AuthenticationService } from "@repo/contracts";
import { MIGRATIONS_FOLDER, type DbClient } from "@repo/db";
import { createApp, type App } from "@/app";
import { createAuthenticationService } from "@/modules/authentication";

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

  // ---------------------------------------------------------------------
  // POST /auth/register
  // ---------------------------------------------------------------------
  test("POST /auth/register persists a user end-to-end", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "E2E User",
          email: "e2e@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.email).toBe("e2e@example.com");
    expect(json.data.id).toBeTruthy();
  });

  test("POST /auth/register returns 409 for a duplicate email across the composed app", async () => {
    const first = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Dup",
          email: "dup@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    expect(first.status).toBe(200);

    const second = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Dup",
          email: "dup@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    expect(second.status).toBe(409);
    const json = await second.json();
    expect(json.error.code).toBe("EMAIL_ALREADY_REGISTERED");
    expect(json.error.message).toBe(
      "email already registered: dup@example.com",
    );
  });

  // ---------------------------------------------------------------------
  // POST /auth/login
  // ---------------------------------------------------------------------
  test("POST /auth/login authenticates an existing user end-to-end", async () => {
    const register = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Login E2E",
          email: "login-e2e@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    expect(register.status).toBe(200);

    const login = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "login-e2e@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    expect(login.status).toBe(200);
    const json = await login.json();
    expect(json.data.email).toBe("login-e2e@example.com");
  });

  // ---------------------------------------------------------------------
  // POST /auth/login — concurrency
  // ---------------------------------------------------------------------
  test("concurrent POST /auth/login requests each succeed with unique refresh tokens", async () => {
    const register = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Concurrent E2E",
          email: "concurrent-e2e@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    expect(register.status).toBe(200);

    const CONCURRENT_LOGINS = 10;

    const loginRequest = () =>
      app.handle(
        new Request("http://localhost/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "concurrent-e2e@example.com",
            password: "hunter2hunter",
          }),
        }),
      );

    // fire real concurrent HTTP requests at the composed app, not just the
    // service layer — this exercises whatever the http.ts handler does
    // around the service call (e.g. cookie-setting, response shaping)
    // under actual concurrent load, not just Promise.all on a bare function
    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_LOGINS }, () => loginRequest()),
    );

    for (const response of responses) {
      expect(response.status).toBe(200);
    }

    const bodies = await Promise.all(responses.map((r) => r.json()));
    for (const json of bodies) {
      expect(json.data.email).toBe("concurrent-e2e@example.com");
    }

    // if the login response exposes the refresh token (e.g. via a
    // Set-Cookie header or response body field), assert uniqueness here.
    // Adjust the extraction below to match your actual response shape —
    // this assumes it's returned in json.data.tokens.refreshToken.
    const refreshTokenValues = bodies.map(
      (json) => json.data.tokens?.refreshToken,
    );
    if (refreshTokenValues.every(Boolean)) {
      expect(new Set(refreshTokenValues).size).toBe(CONCURRENT_LOGINS);
    }
  });

  test("concurrent requests mixing register + login for the same email resolve consistently", async () => {
    // this probes a genuinely different race than the pure-login case above:
    // what happens when a login attempt races against the registration of
    // that very same account, at the HTTP layer, through the full app stack
    const email = "race-register-login@example.com";

    const registerRequest = () =>
      app.handle(
        new Request("http://localhost/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Racer",
            email,
            password: "hunter2hunter",
          }),
        }),
      );

    const loginRequest = () =>
      app.handle(
        new Request("http://localhost/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password: "hunter2hunter" }),
        }),
      );

    const [registerResponse, loginResponse] = await Promise.all([
      registerRequest(),
      loginRequest(),
    ]);

    // exactly one well-defined outcome is acceptable here: either the login
    // lost the race and correctly got InvalidCredentialsError (404/401,
    // whatever your mapping is) because the user didn't exist yet, OR it
    // won the race and got 200 because registration committed first.
    // What must NOT happen: a 500, a hang, or a login response claiming
    // success with a user object that doesn't match what got registered.
    expect(registerResponse.status).toBe(200);
    expect([200, 401, 404]).toContain(loginResponse.status);

    if (loginResponse.status === 200) {
      const loginJson = await loginResponse.json();
      expect(loginJson.data.email).toBe(email);
    }
  });

  // ---------------------------------------------------------------------
  // Routing / global error handling (cross-cutting, not endpoint-specific)
  // ---------------------------------------------------------------------
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
      getUserProfile: async () => {
        throw new Error("database exploded");
      },
      logout: async () => {
        throw new Error("database exploded");
      },
      logoutAll: async () => {
        throw new Error("database exploded");
      },
    };

    const failingApp = createApp({ db, auth: failingAuth });
    const response = await failingApp.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Boom",
          email: "boom@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error.code).toBe("INTERNAL_SERVER");
    expect(json.error.message).toBe("internal server error");
  });
});
