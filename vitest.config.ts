import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
  optimizeDeps: {
    exclude: ['node:sqlite', 'drizzle-orm/sqlite-proxy'],
  },
});
