import { Elysia, t } from "elysia";
import {
  EmailAlreadyRegisteredError,
  InvalidRegistrationInputError,
  type AuthenticationService,
} from "@repo/contracts";
import { createAuthenticationServiceInternal } from "./internal/authentication-service";

export interface AuthRoutesOptions {
  db?: Parameters<typeof createAuthenticationServiceInternal>[0];
  authService?: AuthenticationService;
}

export const authRoutes = (options: AuthRoutesOptions) => {
  const auth = options.authService ?? createAuthenticationServiceInternal(options.db!);

  return new Elysia({ name: "auth-routes" })
    .post(
      "/auth/register",
      async ({ body, set }) => {
        try {
          return await auth.register(body);
        } catch (error) {
          if (error instanceof EmailAlreadyRegisteredError) {
            set.status = 409;
            return { error: error.message };
          }
          if (error instanceof InvalidRegistrationInputError) {
            set.status = 400;
            return { error: error.message };
          }
          throw error;
        }
      },
      {
        body: t.Object({
          email: t.String(),
          password: t.String(),
        }),
      }
    )
    .post(
      "/auth/login",
      async ({ body, set }) => {
        try {
          return await auth.verifyCredentials(body);
        } catch {
          set.status = 401;
          return { error: "invalid email or password" };
        }
      },
      {
        body: t.Object({
          email: t.String(),
          password: t.String(),
        }),
      }
    );
};
