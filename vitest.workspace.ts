import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "apps/backend",
  "apps/web",
  "packages/contracts",
  "packages/db",
]);
