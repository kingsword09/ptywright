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
  pack: {
    entry: {
      cli: "src/cli.ts",
      index: "src/index.ts",
      agent: "src/agent/runner.ts",
      mcp: "src/mcp/server.ts",
      "pty-cassette": "src/pty-cassette/index.ts",
      script: "src/script/runner.ts",
      session: "src/session/terminal_session.ts",
      "bin/ptywright": "src/bin/ptywright.ts",
    },
    outDir: "dist",
    format: "esm",
    platform: "node",
    target: "es2022",
    clean: true,
    dts: false,
    deps: {
      skipNodeModulesBundle: true,
    },
  },
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
