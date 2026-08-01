import { Elysia, t } from "elysia";
import {
  DUMMY_VALUE,
  EmailAlreadyRegisteredError,
  InvalidRegistrationInputError,
  type Dummy,
} from "@repo/contracts";
import { createDbClient } from "@repo/db";
import { createAuthenticationService } from "./modules/authentication";

const db = createDbClient(process.env.DATABASE_URL);
const authService = createAuthenticationService(db);

const app = new Elysia()
  .decorate("db", db)
  .decorate("auth", authService)
  .get("/", () => DUMMY_VALUE.message)
  .get("/health", async ({ db }) => {
    const rows = await db.$client.unsafe("SELECT 1 AS ok");
    return { status: "ok", db: rows.length === 1 };
  })
  .post(
    "/auth/register",
    async ({ auth, body, set }) => {
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
    { body: t.Object({ email: t.String(), password: t.String() }) }
  )
  .post(
    "/auth/login",
    async ({ auth, body, set }) => {
      try {
        return await auth.verifyCredentials(body);
      } catch {
        set.status = 401;
        return { error: "invalid email or password" };
      }
    },
    { body: t.Object({ email: t.String(), password: t.String() }) }
  )
  .listen(3000);

const dummy: Dummy = DUMMY_VALUE;

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port} (contracts: ${dummy.message})`
);
