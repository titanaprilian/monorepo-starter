import { Elysia } from "elysia";
import type { AuthenticationService } from "@repo/contracts";
import type { DbClient } from "@repo/db";
import { rateLimit } from "@elysiajs/rate-limit";
import { errorResponse } from "./lib/response";
import { authRoutes } from "./modules/authentication/http";
import { healthRoutes } from "./modules/health/http";
import { InternalServerError } from "./lib/errors";

export interface CreateAppDeps {
  db: DbClient;
  auth: AuthenticationService;
}

export const createApp = (deps: CreateAppDeps) => {
  const { db, auth } = deps;

  return new Elysia({ name: "app" })
    .onError(({ code, set }) => {
      if (code === "NOT_FOUND") {
        return;
      }
      return errorResponse(set, 500, new InternalServerError());
    })
    .use(
      rateLimit({
        duration: 60000,
        max: (key) => {
          if (key.endsWith(":login")) {
            return 10;
          }
          return 100;
        },
        generator: (request, server) => {
          const ip =
            server?.requestIP(request)?.address ||
            request.headers.get("x-forwarded-for") ||
            request.headers.get("x-real-ip") ||
            "127.0.0.1";
          const url = new URL(request.url);
          const isLogin = url.pathname === "/auth/login";
          return `${ip}:${isLogin ? "login" : "global"}`;
        },
        errorResponse: new Response(
          JSON.stringify({
            error: {
              code: "RATE_LIMIT",
              message: "rate-limit reached",
            },
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
            },
          }
        ),
        skip: (request) => {
          if (process.env.NODE_ENV === "test") {
            return request.headers.get("x-test-rate-limit") !== "true";
          }
          return false;
        },
      })
    )
    .use(healthRoutes({ db }))
    .use(authRoutes({ authService: auth }));
};

export type App = ReturnType<typeof createApp>;
