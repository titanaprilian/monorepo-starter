import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidRegistrationInputError,
  type AuthenticationService,
} from "@repo/contracts";
import { authRoutes } from "../http";

describe("authentication http adapter (Tier 2)", () => {
  // Define a customizable mock authentication service
  const mockAuthService: AuthenticationService = {
    register: async () => {
      throw new Error("Mock not configured");
    },
    verifyCredentials: async () => {
      throw new Error("Mock not configured");
    },
  };

  // Mount the plugin under test
  const app = new Elysia().use(authRoutes({ authService: mockAuthService }));

  describe("POST /auth/register", () => {
    test("returns 200 and user on successful registration", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      };

      mockAuthService.register = async (input) => {
        expect(input.email).toBe("test@example.com");
        expect(input.password).toBe("password123");
        return mockUser;
      };

      const response = await app.handle(
        new Request("http://localhost/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "test@example.com", password: "password123" }),
        })
      );

      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({
        id: "user-123",
        email: "test@example.com",
        createdAt: "2026-08-01T00:00:00.000Z",
      });
    });

    test("returns 409 when email is already registered", async () => {
      mockAuthService.register = async (input) => {
        throw new EmailAlreadyRegisteredError(input.email);
      };

      const response = await app.handle(
        new Request("http://localhost/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "conflict@example.com", password: "password123" }),
        })
      );

      expect(response.status).toBe(409);
      const json = await response.json();
      expect(json).toEqual({ error: "email already registered: conflict@example.com" });
    });

    test("returns 400 when registration input is invalid", async () => {
      mockAuthService.register = async () => {
        throw new InvalidRegistrationInputError("password must be at least 8 characters");
      };

      const response = await app.handle(
        new Request("http://localhost/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "invalid@example.com", password: "short" }),
        })
      );

      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json).toEqual({ error: "password must be at least 8 characters" });
    });

    test("returns 422 when schema validation fails (missing email)", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: "password123" }),
        })
      );

      expect(response.status).toBe(422);
    });
  });

  describe("POST /auth/login", () => {
    test("returns 200 and user on successful login", async () => {
      const mockUser = {
        id: "user-123",
        email: "test@example.com",
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
      };

      mockAuthService.verifyCredentials = async (input) => {
        expect(input.email).toBe("test@example.com");
        expect(input.password).toBe("password123");
        return mockUser;
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
        id: "user-123",
        email: "test@example.com",
        createdAt: "2026-08-01T00:00:00.000Z",
      });
    });

    test("returns 401 on invalid credentials", async () => {
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
      expect(json).toEqual({ error: "invalid email or password" });
    });

    test("returns 422 when schema validation fails (missing password)", async () => {
      const response = await app.handle(
        new Request("http://localhost/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: "test@example.com" }),
        })
      );

      expect(response.status).toBe(422);
    });
  });
});
