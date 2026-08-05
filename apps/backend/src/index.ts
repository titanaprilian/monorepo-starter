import { createDbClient } from "@repo/db";
import { createApp } from "./app";
import { createAuthenticationService } from "./modules/authentication";

const db = createDbClient(process.env.DATABASE_URL);
const auth = createAuthenticationService(db);

const port = Number(process.env.PORT ?? 3000);

const app = createApp({ db, auth }).listen(port);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
