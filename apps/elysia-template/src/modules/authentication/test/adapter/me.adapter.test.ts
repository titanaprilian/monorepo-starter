import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import {
  type AuthenticationService,
} from "@repo/contracts";
import { authRoutes } from "@/modules/authentication/http";
import { signJwt } from "@/modules/authentication/internal/jwt";

describe("authentication http adapter: me", () => {
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
