import { Elysia, t } from "elysia";
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidRegistrationInputError,
  type AuthenticationService,
} from "@repo/contracts";
import { errorResponse, successResponse } from "../../lib/response";
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
          return successResponse(await auth.register(body));
        } catch (error) {
          if (error instanceof EmailAlreadyRegisteredError) {
            return errorResponse(set, 409, error);
          }
          if (error instanceof InvalidRegistrationInputError) {
            return errorResponse(set, 400, error);
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
          return successResponse(await auth.verifyCredentials(body));
        } catch (error) {
          if (error instanceof InvalidCredentialsError) {
            return errorResponse(set, 401, error);
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
    );
};
