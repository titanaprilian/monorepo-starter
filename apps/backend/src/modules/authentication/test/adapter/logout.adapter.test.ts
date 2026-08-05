import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import {
  type AuthenticationService,
} from "@repo/contracts";
import { authRoutes } from "@/modules/authentication/http";

describe("authentication http adapter: logout", () => {
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
