import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import {
  InvalidCredentialsError,
  type AuthenticationService,
} from "@repo/contracts";
import { authRoutes } from "../../http";

describe("authentication http adapter: login", () => {
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

  const app = new Elysia().use(authRoutes({ authService: mockAuthService }));

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
