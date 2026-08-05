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
          headers: { "Content-Type": "application/json", "X-Client-Type": "mobile" },
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
      expect(json.data.tokens?.refreshToken).toBeTruthy();
    }

    const refreshTokenValues = bodies.map(
      (json) => json.data.tokens.refreshToken,
    );
    expect(new Set(refreshTokenValues).size).toBe(CONCURRENT_LOGINS);
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
    // lost the race and correctly got InvalidCredentialsError (401)
    // because the user didn't exist yet, OR it won the race and got 200
    // because registration committed first.
    // What must NOT happen: a 500, a hang, or a login response claiming
    // success with a user object that doesn't match what got registered.
    expect(registerResponse.status).toBe(200);
    expect([200, 401]).toContain(loginResponse.status);

    if (loginResponse.status === 200) {
      const loginJson = await loginResponse.json();
      expect(loginJson.data.email).toBe(email);
    }
  });

  // ---------------------------------------------------------------------
  // GET /auth/me
  // ---------------------------------------------------------------------
  test("GET /auth/me with a valid bearer access token returns 200 and authenticated user profile", async () => {
    const register = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Type": "mobile" },
        body: JSON.stringify({
          name: "Me User",
          email: "me-e2e@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    expect(register.status).toBe(200);
    const registerJson = await register.json();
    const token = registerJson.data.tokens.accessToken;

    const response = await app.handle(
      new Request("http://localhost/auth/me", {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.id).toBe(registerJson.data.id);
    expect(json.data.email).toBe("me-e2e@example.com");
    expect(json.data.name).toBe("Me User");
  });

  test("GET /auth/me with no Authorization header returns 401", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/me", {
        method: "GET",
      }),
    );
    expect(response.status).toBe(401);
  });

  test("GET /auth/me with a malformed or expired token returns 401", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/me", {
        method: "GET",
        headers: { Authorization: "Bearer invalid.token.value" },
      }),
    );
    expect(response.status).toBe(401);
  });

  // ---------------------------------------------------------------------
  // POST /auth/logout
  // ---------------------------------------------------------------------
  test("POST /auth/logout with a valid refresh token invalidates single session end-to-end", async () => {
    const register = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Logout User",
          email: "logout-e2e@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    expect(register.status).toBe(200);

    const loginOne = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Type": "mobile" },
        body: JSON.stringify({
          email: "logout-e2e@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    const loginTwo = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Type": "mobile" },
        body: JSON.stringify({
          email: "logout-e2e@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    expect(loginOne.status).toBe(200);
    expect(loginTwo.status).toBe(200);

    const sessionOne = (await loginOne.json()).data.tokens;
    const sessionTwo = (await loginTwo.json()).data.tokens;

    const logoutResponse = await app.handle(
      new Request("http://localhost/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: sessionOne.refreshToken }),
      }),
    );
    expect(logoutResponse.status).toBe(200);
    const logoutJson = await logoutResponse.json();
    expect(logoutJson.data).toEqual({ success: true });

    // sessionTwo refresh still works (200) — proving single-session logout, not logout-all
    const refreshTwo = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: sessionTwo.refreshToken }),
      }),
    );
    expect(refreshTwo.status).toBe(200);

    // sessionOne refresh is rejected (401)
    const refreshOne = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: sessionOne.refreshToken }),
      }),
    );
    expect(refreshOne.status).toBe(401);
  });

  test("POST /auth/logout with no token returns 400", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/logout", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(400);
  });

  // ---------------------------------------------------------------------
  // POST /auth/refresh
  // ---------------------------------------------------------------------
  test("POST /auth/refresh rotates valid refresh token and returns new tokens", async () => {
    const register = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Refresh User",
          email: "refresh-e2e@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    expect(register.status).toBe(200);

    const login = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Type": "mobile" },
        body: JSON.stringify({
          email: "refresh-e2e@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    expect(login.status).toBe(200);
    const originalTokens = (await login.json()).data.tokens;

    const refreshResponse = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Type": "mobile" },
        body: JSON.stringify({ refreshToken: originalTokens.refreshToken }),
      }),
    );
    expect(refreshResponse.status).toBe(200);
    const newTokens = (await refreshResponse.json()).data.tokens;

    expect(newTokens.accessToken).toBeDefined();
    expect(newTokens.refreshToken).toBeDefined();
    expect(newTokens.refreshToken).not.toBe(originalTokens.refreshToken);

    // replay protection: using original refresh token again returns 401
    const replayResponse = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: originalTokens.refreshToken }),
      }),
    );
    expect(replayResponse.status).toBe(401);
  });

  test("POST /auth/refresh with an invalid or tampered token returns 401", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "invalid.refresh.token" }),
      }),
    );
    expect(response.status).toBe(401);
  });

  test("POST /auth/refresh with no token returns 401", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(401);
  });

  // ---------------------------------------------------------------------
  // POST /auth/logout-all
  // ---------------------------------------------------------------------
  test("POST /auth/logout-all revokes every session for the authenticated caller end-to-end", async () => {
    const register = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Logout All E2E",
          email: "logoutall-e2e@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    expect(register.status).toBe(200);

    // two separate sessions for the same user — e.g. two devices
    const loginOne = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Type": "mobile" },
        body: JSON.stringify({
          email: "logoutall-e2e@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    const loginTwo = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Type": "mobile" },
        body: JSON.stringify({
          email: "logoutall-e2e@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    expect(loginOne.status).toBe(200);
    expect(loginTwo.status).toBe(200);

    const sessionOne = (await loginOne.json()).data.tokens;
    const sessionTwo = (await loginTwo.json()).data.tokens;

    const logoutAllResponse = await app.handle(
      new Request("http://localhost/auth/logout-all", {
        method: "POST",
        headers: { Authorization: `Bearer ${sessionOne.accessToken}` },
      }),
    );
    expect(logoutAllResponse.status).toBe(200);

    // both sessions — including the one that made the call — must be dead.
    // This is the meaningful end-to-end assertion: it proves logoutAll's
    // effect is actually enforced on the real refresh path, not just
    // written to a column nothing reads.
    const refreshOne = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: sessionOne.refreshToken }),
      }),
    );
    const refreshTwo = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: sessionTwo.refreshToken }),
      }),
    );
    expect(refreshOne.status).toBe(401);
    expect(refreshTwo.status).toBe(401);
  });

  test("POST /auth/logout-all rejects an unauthenticated request", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/logout-all", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(401);
  });

  test("POST /auth/logout-all cannot be used to revoke another user's sessions via a spoofed id", async () => {
    const registerAttacker = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Attacker",
          email: "attacker-e2e@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    const registerVictim = await app.handle(
      new Request("http://localhost/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Victim",
          email: "victim-e2e@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    expect(registerAttacker.status).toBe(200);
    expect(registerVictim.status).toBe(200);
    const victimId = (await registerVictim.json()).data.id;

    const attackerLogin = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Type": "mobile" },
        body: JSON.stringify({
          email: "attacker-e2e@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    const victimLogin = await app.handle(
      new Request("http://localhost/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Type": "mobile" },
        body: JSON.stringify({
          email: "victim-e2e@example.com",
          password: "hunter2hunter",
        }),
      }),
    );
    const attackerTokens = (await attackerLogin.json()).data.tokens;
    const victimTokens = (await victimLogin.json()).data.tokens;

    // attacker is authenticated as themselves but tries to smuggle the
    // victim's id into the request body, hoping a naive handler trusts it
    // instead of deriving the target user from the access token.
    const spoofedResponse = await app.handle(
      new Request("http://localhost/auth/logout-all", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${attackerTokens.accessToken}`,
        },
        body: JSON.stringify({ userId: victimId }),
      }),
    );
    // acceptable outcomes: the body field is silently ignored (200,
    // attacker logs themselves out), or it's explicitly rejected (400/403).
    // A 500 or an outcome that revokes the victim's session is a failure.
    expect([200, 400, 403]).toContain(spoofedResponse.status);

    // the decisive assertion: whatever the status code, the victim's real
    // session must still be alive. This is what an IDOR would actually
    // break, and it's the only check here that can't be faked by a
    // handler that just returns the "right-looking" status code.
    const victimRefresh = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: victimTokens.refreshToken }),
      }),
    );
    expect(victimRefresh.status).toBe(200);
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
      refresh: async () => {
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
