import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        statements: 65,
        branches: 35,
        functions: 70,
        lines: 65,
      },
      // db-client.ts is sql.js-only (browser path) and not exercised by tests.
      // schema.ts is type definitions, not runtime code worth covering.
      exclude: [
        "**/*.test.ts",
        "src/db-client.ts",
        "src/schema.ts",
      ],
    },
  },
});
