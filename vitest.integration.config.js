import { defineConfig } from "vitest/config";
import path from "path";

// Separate config so the DB-hitting end-to-end harness never runs in the normal
// unit suite (`vitest run`, which is scoped to tests/unit/**).
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/integration/env-setup.js"],
    include: ["tests/integration/**/*.itest.js"],
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
