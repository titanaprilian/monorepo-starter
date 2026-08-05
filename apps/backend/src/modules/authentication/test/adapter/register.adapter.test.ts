import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import {
  EmailAlreadyRegisteredError,
  InvalidRegistrationInputError,
  type AuthenticationService,
} from "@repo/contracts";
import { authRoutes } from "@/modules/authentication/http";

describe("authentication http adapter: register", () => {
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
    refresh: async () => {
      throw new Error("Mock not configured");
    },
  };

  const app = new Elysia().use(authRoutes({ authService: mockAuthService }));

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
