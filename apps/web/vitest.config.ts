import path from 'node:path';
import reactPreset from '@repo/config-vitest/vitest.react';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
  reactPreset,
  defineConfig({
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'src'),
      },
    },
    test: {
      css: true,
    },
  })
);
