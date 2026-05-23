import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";

export default [
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.vite/**",
      "**/coverage/**",
      // One-shot maintenance scripts are kept out of the readability sweep;
      // they're long-form imperative pipelines and not part of the runtime.
      "scraper/src/scripts/**",
    ],
    languageOptions: {
      parser: tsparser,
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "curly": ["error", "all"],
      "eqeqeq": ["error", "always", { "null": "ignore" }],
      // See "Code style" in CLAUDE.md. Allowlist covers conventional shorts
      // (numeric loop indices, coordinates, intentional unused, common
      // domain abbreviations). Anything else needs ≥3 chars.
      // Iteration/callback singletons are fine when context makes them clear
      // (sort comparators, .map/.filter callbacks, table builders). The rule
      // still catches multi-char cryptic names like `ca`, `kb`, `tokA` —
      // those carry encoding, not meaning, and need spelling out.
      "id-length": [
        "warn",
        {
          min: 3,
          exceptions: [
            "i", "j", "k",
            "x", "y",
            "_",
            "a", "b", "c", "d", "f", "n", "m", "p", "s", "t", "v",
            "db", "id", "ok", "el", "fn", "cb", "ev", "e", "r",
            "fs", "os", "ms",
            // Crypto convention: iv = initialization vector, ct = ciphertext.
            "iv", "ct",
            // Chart convention (Recharts cx/cy = circle center coords).
            "cx", "cy",
          ],
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
  // Disables ESLint formatting rules that conflict with Prettier.
  prettier,
  // Re-add padding-line after prettier (prettier disables it).
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "padding-line-between-statements": [
        "warn",
        { blankLine: "always", prev: "block-like", next: "*" },
      ],
    },
  },
  // Test files use (a, b) in sort comparators heavily — a convention the
  // id-length rule fights against without benefit. Disable it for tests.
  {
    files: ["**/*.test.ts", "**/*.test.tsx", "**/test-fixture.ts", "**/test-db.ts"],
    rules: {
      "id-length": "off",
    },
  },
  // Drizzle schema files use (t) => [...] for table builder callbacks — that's
  // the upstream convention; renaming makes the schema diverge from documentation.
  {
    files: ["**/schema.ts"],
    rules: {
      "id-length": "off",
    },
  },
];
