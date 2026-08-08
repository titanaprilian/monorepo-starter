import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});