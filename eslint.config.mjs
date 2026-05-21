import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import prettier from "eslint-config-prettier";

export default [
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: ["**/node_modules/**", "**/dist/**", "**/.vite/**"],
    languageOptions: {
      parser: tsparser,
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "curly": ["error", "all"],
      "eqeqeq": ["error", "always", { "null": "ignore" }],
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
];
