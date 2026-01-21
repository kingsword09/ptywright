import { expect, test } from "bun:test";
import { runScriptPath } from "../src/script/path";

test("fixtures/run_all_scripts/ok.ts runs successfully WITH steps path", async () => {
  const result = await runScriptPath("tests/fixtures/run_all_scripts/ok.ts", {
    artifactsDir: ".tmp/test/ok_ts_with_steps",
    stepsPath: "tests/fixtures/run_all_scripts/custom_steps.ts",
  });
  if (!result.ok) {
    console.error(result.error);
  }
  expect(result.ok).toBe(true);
});
