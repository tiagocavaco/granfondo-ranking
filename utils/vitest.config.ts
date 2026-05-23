import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 95,
        lines: 80,
      },
      exclude: ["**/*.test.ts"],
    },
  },
});
