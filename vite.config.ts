import { defineConfig } from "vite-plus";

const toolingIgnorePatterns = [
  "dist/**",
  "node_modules/**",
  ".tmp/**",
  "scripts/**",
  "skills/**",
  "tests/fixtures/**",
  "tests/golden/**",
  "tests/agent-snapshots/**",
  "AGENTS.md",
  "DEEPRESEARCH.md",
  "README.md",
  "README_ZH.md",
  "plan.md",
];

export default defineConfig({
  lint: {
    env: {
      node: true,
    },
    globals: {
      crypto: "readonly",
    },
    ignorePatterns: toolingIgnorePatterns,
  },
  fmt: {
    ignorePatterns: toolingIgnorePatterns,
    printWidth: 100,
    tabWidth: 2,
    singleQuote: false,
    semi: true,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
