import { Elysia, t } from "elysia";
import {
  EmailAlreadyRegisteredError,
  InvalidCredentialsError,
  InvalidRegistrationInputError,
  UnauthorizedError,
  type AuthenticationService,
} from "@repo/contracts";
import { errorResponse, successResponse } from "../../lib/response";
import { createAuthenticationServiceInternal } from "./internal/authentication-service";
import { verifyJwt } from "./internal/jwt";

export interface AuthRoutesOptions {
  db?: Parameters<typeof createAuthenticationServiceInternal>[0];
  authService?: AuthenticationService;
}

export const authRoutes = (options: AuthRoutesOptions) => {
  const auth = options.authService ?? createAuthenticationServiceInternal(options.db!);

  return new Elysia({ name: "auth-routes" })
    .post(
      "/auth/register",
      async ({ body, set, headers, cookie: { refreshToken } }) => {
        try {
          const result = await auth.register(body);
          const isMobile = headers["x-client-type"] === "mobile";

          if (isMobile) {
            return successResponse({
              ...result.user,
              user: result.user,
              tokens: {
                accessToken: result.tokens.accessToken,
                refreshToken: result.tokens.refreshToken,
              },
            });
          } else {
            refreshToken.set({
              value: result.tokens.refreshToken,
              httpOnly: true,
              secure: true,
              path: "/",
              sameSite: "lax",
            });
            return successResponse({
              ...result.user,
              user: result.user,
              tokens: {
                accessToken: result.tokens.accessToken,
              },
            });
          }
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
          name: t.String(),
          email: t.String(),
          password: t.String(),
        }),
      }
    )
    .post(
      "/auth/login",
      async ({ body, set, headers, cookie: { refreshToken } }) => {
        try {
          const result = await auth.verifyCredentials(body);
          const isMobile = headers["x-client-type"] === "mobile";

          if (isMobile) {
            return successResponse({
              ...result.user,
              user: result.user,
              tokens: {
                accessToken: result.tokens.accessToken,
                refreshToken: result.tokens.refreshToken,
              },
            });
          } else {
            refreshToken.set({
              value: result.tokens.refreshToken,
              httpOnly: true,
              secure: true,
              path: "/",
              sameSite: "lax",
            });
            return successResponse({
              ...result.user,
              user: result.user,
              tokens: {
                accessToken: result.tokens.accessToken,
              },
            });
          }
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
    )
    .get(
      "/auth/me",
      async ({ headers, set }) => {
        const authHeader = headers["authorization"];
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return errorResponse(set, 401, new UnauthorizedError("missing or invalid authorization header"));
        }
        const token = authHeader.substring(7);
        try {
          const payload = verifyJwt(token);
          const user = await auth.getUserProfile(payload.sub);
          return successResponse(user);
        } catch {
          return errorResponse(set, 401, new UnauthorizedError("unauthorized"));
        }
      }
    )
    .post(
      "/auth/logout",
      async ({ body, set, cookie: { refreshToken } }) => {
        const bodyTyped = body as Record<string, unknown> | undefined;
        const token = bodyTyped?.refreshToken || refreshToken?.value;
        if (typeof token !== "string") {
          return errorResponse(
            set,
            400,
            new InvalidRegistrationInputError("refresh token is required")
          );
        }
        await auth.logout(token);
        refreshToken.remove();
        return successResponse({ success: true });
      },
      {
        body: t.Optional(
          t.Object({
            refreshToken: t.Optional(t.String()),
          })
        ),
      }
    )
    .post(
      "/auth/logout-all",
      async ({ headers, set, cookie: { refreshToken } }) => {
        const authHeader = headers["authorization"];
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return errorResponse(set, 401, new UnauthorizedError("missing or invalid authorization header"));
        }
        const token = authHeader.substring(7);
        try {
          const payload = verifyJwt(token);
          await auth.logoutAll(payload.sub);
          refreshToken.remove();
          return successResponse({ success: true });
        } catch {
          return errorResponse(set, 401, new UnauthorizedError("unauthorized"));
        }
      }
    );
};
