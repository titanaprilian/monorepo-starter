import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import {
  type AuthenticationService,
} from "@repo/contracts";
import { authRoutes } from "@/modules/authentication/http";
import { signJwt } from "@/modules/authentication/internal/jwt";

describe("authentication http adapter: logout-all", () => {
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
