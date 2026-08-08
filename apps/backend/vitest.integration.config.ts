import path from "node:path";
import { defineConfig, mergeConfig } from "vitest/config";
import nodeConfig from "@repo/config-vitest/vitest.node";

export default mergeConfig(
  nodeConfig,
  defineConfig({
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src"),
      },
    },
    test: {
      dir: "./test/integration",
      passWithNoTests: true,
      globalSetup: ["./test/global-setup.ts"],
      setupFiles: ["./test/setup.ts"],
    },
  }),
);