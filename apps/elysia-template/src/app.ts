import { Elysia } from "elysia";
import type { AuthenticationService } from "@repo/contracts";
import type { DbClient } from "@repo/db";
import { authRoutes } from "./modules/authentication/http";
import { healthRoutes } from "./modules/health/http";

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
      set.status = 500;
      return { error: "internal server error" };
    })
    .use(healthRoutes({ db }))
    .use(authRoutes({ authService: auth }));
};

export type App = ReturnType<typeof createApp>;
