import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // Thresholds slightly below the measured baseline. Any change that drops
      // coverage further fails CI. Raise these once new tests land.
      thresholds: {
        statements: 65,
        branches: 60,
        functions: 65,
        lines: 65,
      },
      exclude: [
        "src/scripts/**",
        "src/db/manage-db.ts",
        "src/db/decrypt-db.ts",
        "**/*.test.ts",
        "**/test-fixture.ts",
      ],
    },
  },
});
