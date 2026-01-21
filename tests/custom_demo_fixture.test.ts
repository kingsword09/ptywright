import { expect, test } from "bun:test";
import { runScriptPath } from "../src/script/path";

test("fixtures/run_all_scripts/custom_demo.json runs successfully", async () => {
  const result = await runScriptPath("tests/fixtures/run_all_scripts/custom_demo.json", {
    artifactsDir: ".tmp/test/custom_demo_json",
    stepsPath: "tests/fixtures/run_all_scripts/custom_steps.ts",
  });
  if (!result.ok) {
    console.error(result.error);
  }
  expect(result.ok).toBe(true);
});
