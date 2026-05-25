import { readFileSync } from "node:fs";

import { expect, test } from "bun:test";

test("CI workflow runs the full check gate and uploads agent artifacts", () => {
  const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

  expect(workflow).toContain("bun-version: 1.3.6");
  expect(workflow).toContain("bun install --frozen-lockfile");
  expect(workflow).toContain("bunx playwright install --with-deps chromium");
  expect(workflow).toContain("bun run check");
  expect(workflow).toContain("actions/upload-artifact@v4");
  expect(workflow).toContain("path: .tmp/agent-check");
});
