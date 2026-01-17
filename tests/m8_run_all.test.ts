import { expect, test } from "bun:test";

import { basename } from "node:path";

import { runAllScripts } from "../src/scenario/run_all";

test("script:run-all discovers scripts and skips step modules", async () => {
  const dir = "tests/fixtures/run_all_scripts";
  const result = await runAllScripts({
    dir,
    artifactsRoot: ".tmp/test_scenarios/run_all",
    stepsPath: `${dir}/custom_steps.ts`,
  });

  expect(result.entries.length).toBeGreaterThan(0);
  expect(result.entries.some((e) => basename(e.filePath) === "custom_steps.ts")).toBe(false);
  expect(result.entries.some((e) => basename(e.filePath) === "ignore.steps.ts")).toBe(false);

  expect(result.ok).toBe(true);
});
