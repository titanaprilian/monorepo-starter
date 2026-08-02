import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidRegistrationInputError,
  type AuthenticationService,
} from "@repo/contracts";
import { authRoutes } from "../http";
import { signJwt } from "../internal/jwt";

describe("authentication http adapter (Tier 2)", () => {
  // Define a customizable mock authentication service
  const mockAuthService: AuthenticationService = {
    register: async () => {
      throw new Error("Mock not configured");
    },
    verifyCredentials: async () => {
      throw new Error("Mock not configured");
    },
    getUserProfile: async () => {
      throw new Error("Mock not configured");
    },
    logout: async () => {
      throw new Error("Mock not configured");
    },
    logoutAll: async () => {
      throw new Error("Mock not configured");
    },
  };

  // Mount the plugin under test
  const app = new Elysia().use(authRoutes({ authService: mockAuthService }));

  describe("POST /auth/register", () => {
    test("returns 200, user and only access token on web (default) registration, with cookie set", async () => {
      const mockUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      };

      mockAuthService.register = async (input) => {
        expect(input.name).toBe("Test User");
        expect(input.email).toBe("test@example.com");
        expect(input.password).toBe("password123");
        return {
          user: mockUser,
          tokens: {
            accessToken: "access-token-123",
            refreshToken: "refresh-token-123",
          },
        };
      };

      const response = await app.handle(
        new Request("http://localhost/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test User", email: "test@example.com", password: "password123" }),
        })
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({
        data: {
          id: "user-123",
          name: "Test User",
          email: "test@example.com",
          createdAt: "2026-08-01T00:00:00.000Z",
          user: {
            id: "user-123",
            name: "Test User",
            email: "test@example.com",
            createdAt: "2026-08-01T00:00:00.000Z",
          },
          tokens: {
            accessToken: "access-token-123",
          },
        },
      });

      // Verify cookie header
      const cookieHeader = response.headers.get("Set-Cookie");
      expect(cookieHeader).toContain("refreshToken=refresh-token-123");
      expect(cookieHeader).toContain("HttpOnly");
      expect(cookieHeader).toContain("Secure");
    });

    test("returns 200, user and both tokens on mobile registration", async () => {
      const mockUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      };

      mockAuthService.register = async (_input) => {
        return {
          user: mockUser,
          tokens: {
            accessToken: "access-token-123",
            refreshToken: "refresh-token-123",
          },
        };
      };

      const response = await app.handle(
        new Request("http://localhost/auth/register", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Client-Type": "mobile",
          },
          body: JSON.stringify({ name: "Test User", email: "test@example.com", password: "password123" }),
        })
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({
        data: {
          id: "user-123",
          name: "Test User",
          email: "test@example.com",
          createdAt: "2026-08-01T00:00:00.000Z",
          user: {
            id: "user-123",
            name: "Test User",
            email: "test@example.com",
            createdAt: "2026-08-01T00:00:00.000Z",
          },
          tokens: {
            accessToken: "access-token-123",
            refreshToken: "refresh-token-123",
          },
        },
      });

      // Verify no cookie set
      const cookieHeader = response.headers.get("Set-Cookie");
      expect(cookieHeader).toBeNull();
    });

    test("returns 409 with EMAIL_ALREADY_REGISTERED code when email is already registered", async () => {
      mockAuthService.register = async (input) => {
        throw new EmailAlreadyRegisteredError(input.email);
      };

      const response = await app.handle(
        new Request("http://localhost/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Conflict User", email: "conflict@example.com", password: "password123" }),
        })
      );

      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json).toEqual({
        error: {
          code: "EMAIL_ALREADY_REGISTERED",
          message: "email already registered: conflict@example.com",
        },
      });
    });

    test("returns 400 with INVALID_REGISTRATION_INPUT code when registration input is invalid", async () => {
      mockAuthService.register = async () => {
        throw new InvalidRegistrationInputError("password must be at least 8 characters");
      };

      const response = await app.handle(
        new Request("http://localhost/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Invalid User", email: "invalid@example.com", password: "short" }),
        })
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toEqual({
        error: {
          code: "INVALID_REGISTRATION_INPUT",
          message: "password must be at least 8 characters",
        },
      });
    });

    test("returns 422 when schema validation fails (missing name)", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "noname@example.com", password: "password123" }),
        })
      );

      expect(response.status).toBe(422);
    });
  });

  describe("POST /auth/login", () => {
    test("returns 200, user and only access token on web (default) login, with cookie set", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      };

      mockAuthService.verifyCredentials = async (input) => {
        expect(input.email).toBe("test@example.com");
        expect(input.password).toBe("password123");
        return {
          user: mockUser,
          tokens: {
            accessToken: "access-token-123",
            refreshToken: "refresh-token-123",
          },
        };
      };

      const response = await app.handle(
        new Request("http://localhost/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "test@example.com", password: "password123" }),
        })
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({
        data: {
          id: "user-123",
          email: "test@example.com",
          createdAt: "2026-08-01T00:00:00.000Z",
          user: {
            id: "user-123",
            email: "test@example.com",
            createdAt: "2026-08-01T00:00:00.000Z",
          },
          tokens: {
            accessToken: "access-token-123",
          },
        },
      });

      // Verify cookie header
      const cookieHeader = response.headers.get("Set-Cookie");
      expect(cookieHeader).toContain("refreshToken=refresh-token-123");
      expect(cookieHeader).toContain("HttpOnly");
      expect(cookieHeader).toContain("Secure");
    });

    test("returns 200, user and both tokens on mobile login", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      };

      mockAuthService.verifyCredentials = async () => {
        return {
          user: mockUser,
          tokens: {
            accessToken: "access-token-123",
            refreshToken: "refresh-token-123",
          },
        };
      };

      const response = await app.handle(
        new Request("http://localhost/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Client-Type": "mobile",
          },
          body: JSON.stringify({ email: "test@example.com", password: "password123" }),
        })
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({
        data: {
          id: "user-123",
          email: "test@example.com",
          createdAt: "2026-08-01T00:00:00.000Z",
          user: {
            id: "user-123",
            email: "test@example.com",
            createdAt: "2026-08-01T00:00:00.000Z",
          },
          tokens: {
            accessToken: "access-token-123",
            refreshToken: "refresh-token-123",
          },
        },
      });

      // Verify no cookie set
      const cookieHeader = response.headers.get("Set-Cookie");
      expect(cookieHeader).toBeNull();
    });

    test("returns 401 with INVALID_CREDENTIALS code on invalid credentials", async () => {
      mockAuthService.verifyCredentials = async () => {
        throw new InvalidCredentialsError();
      };

      const response = await app.handle(
        new Request("http://localhost/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "wrong@example.com", password: "wrongpassword" }),
        })
      );

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json).toEqual({
        error: { code: "INVALID_CREDENTIALS", message: "invalid email or password" },
      });
    });
  });

  describe("GET /auth/me", () => {
    test("returns 200 and the user profile on valid authorization header", async () => {
      const mockUser = {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      };

      mockAuthService.getUserProfile = async (id) => {
        expect(id).toBe("user-123");
        return mockUser;
      };

      const token = signJwt({ sub: "user-123" });

      const response = await app.handle(
        new Request("http://localhost/auth/me", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({
        data: {
          id: "user-123",
          name: "Test User",
          email: "test@example.com",
          createdAt: "2026-08-01T00:00:00.000Z",
        },
      });
    });

    test("returns 401 when Authorization header is missing", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/me", {
          method: "GET",
        })
      );

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });

    test("returns 401 when Bearer token is invalid", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/me", {
          method: "GET",
          headers: {
            Authorization: "Bearer invalid-token",
          },
        })
      );

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });
  });

  describe("POST /auth/logout", () => {
    test("revokes token when passed in the body", async () => {
      let revokedToken = "";
      mockAuthService.logout = async (token) => {
        revokedToken = token;
      };

      const response = await app.handle(
        new Request("http://localhost/auth/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken: "body-token" }),
        })
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ data: { success: true } });
      expect(revokedToken).toBe("body-token");
    });

    test("revokes token when passed in the cookie", async () => {
      let revokedToken = "";
      mockAuthService.logout = async (token) => {
        revokedToken = token;
      };

      const response = await app.handle(
        new Request("http://localhost/auth/logout", {
          method: "POST",
          headers: {
            Cookie: "refreshToken=cookie-token",
          },
        })
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ data: { success: true } });
      expect(revokedToken).toBe("cookie-token");

      // Verify cookie is removed
      const cookieHeader = response.headers.get("Set-Cookie");
      expect(cookieHeader).toContain("refreshToken=;");
    });

    test("returns 400 when no token is provided", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/logout", {
          method: "POST",
        })
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe("INVALID_REGISTRATION_INPUT");
    });
  });

  describe("POST /auth/logout-all", () => {
    test("revokes all tokens when authorized", async () => {
      let revokedUserId = "";
      mockAuthService.logoutAll = async (id) => {
        revokedUserId = id;
      };

      const token = signJwt({ sub: "user-123" });

      const response = await app.handle(
        new Request("http://localhost/auth/logout-all", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            Cookie: "refreshToken=some-token",
          },
        })
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ data: { success: true } });
      expect(revokedUserId).toBe("user-123");

      // Verify cookie is removed
      const cookieHeader = response.headers.get("Set-Cookie");
      expect(cookieHeader).toContain("refreshToken=;");
    });

    test("returns 401 when unauthorized", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/logout-all", {
          method: "POST",
        })
      );

      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error.code).toBe("UNAUTHORIZED");
    });
  });
});
