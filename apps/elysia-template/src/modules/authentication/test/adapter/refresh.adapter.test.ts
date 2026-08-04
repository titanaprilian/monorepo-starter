import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import {
  UnauthorizedError,
  type AuthenticationService,
} from "@repo/contracts";
import { authRoutes } from "@/modules/authentication/http";

describe("authentication http adapter: refresh", () => {
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

  test("returns 200, user and only access token on web (default) refresh, with cookie set", async () => {
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    };

    mockAuthService.refresh = async (token) => {
      expect(token).toBe("refresh-token-123");
      return {
        user: mockUser,
        tokens: {
          accessToken: "new-access-token-123",
          refreshToken: "new-refresh-token-123",
        },
      };
    };

    const response = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "refresh-token-123" }),
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
          accessToken: "new-access-token-123",
        },
      },
    });

    const cookieHeader = response.headers.get("Set-Cookie");
    expect(cookieHeader).toContain("refreshToken=new-refresh-token-123");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader).toContain("Secure");
  });

  test("returns 200, user and both tokens on mobile refresh", async () => {
    const mockUser = {
      id: "user-123",
      email: "test@example.com",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
    };

    mockAuthService.refresh = async () => {
      return {
        user: mockUser,
        tokens: {
          accessToken: "new-access-token-123",
          refreshToken: "new-refresh-token-123",
        },
      };
    };

    const response = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Type": "mobile",
        },
        body: JSON.stringify({ refreshToken: "refresh-token-123" }),
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
          accessToken: "new-access-token-123",
          refreshToken: "new-refresh-token-123",
        },
      },
    });

    const cookieHeader = response.headers.get("Set-Cookie");
    expect(cookieHeader).toBeNull();
  });

  test("accepts token from cookie", async () => {
    let receivedToken = "";
    mockAuthService.refresh = async (token) => {
      receivedToken = token as string;
      return {
        user: {
          id: "user-123",
          email: "test@example.com",
          createdAt: new Date("2026-08-01T00:00:00.000Z"),
        },
        tokens: {
          accessToken: "new-access-token-123",
          refreshToken: "new-refresh-token-123",
        },
      };
    };

    const response = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: {
          Cookie: "refreshToken=cookie-token-123",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(receivedToken).toBe("cookie-token-123");
  });

  test("returns 401 with UNAUTHORIZED code on UnauthorizedError from service", async () => {
    mockAuthService.refresh = async () => {
      throw new UnauthorizedError("invalid or expired refresh token");
    };

    const response = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "bad-token" }),
      })
    );

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json).toEqual({
      error: { code: "UNAUTHORIZED", message: "invalid or expired refresh token" },
    });
  });

  test("returns 401 when no token is provided", async () => {
    const response = await app.handle(
      new Request("http://localhost/auth/refresh", {
        method: "POST",
      })
    );

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json).toEqual({
      error: { code: "UNAUTHORIZED", message: "refresh token is required" },
    });
  });
});
