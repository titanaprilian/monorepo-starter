import { Elysia } from "elysia";
import type { AuthenticationService } from "@repo/contracts";
import type { DbClient } from "@repo/db";
import { errorResponse } from "./lib/response";
import { authRoutes } from "./modules/authentication/http";
import { healthRoutes } from "./modules/health/http";

export interface CreateAppDeps {
  db: DbClient;
  auth: AuthenticationService;
}

class InternalServerErrorError extends Error {
  constructor() {
    super("internal server error");
  }
}

export const createApp = (deps: CreateAppDeps) => {
  const { db, auth } = deps;

  return new Elysia({ name: "app" })
    .onError(({ code, set }) => {
      if (code === "NOT_FOUND") {
        return;
      }
      return errorResponse(set, 500, new InternalServerErrorError());
    })
    .use(healthRoutes({ db }))
    .use(authRoutes({ authService: auth }));
};

export type App = ReturnType<typeof createApp>;
