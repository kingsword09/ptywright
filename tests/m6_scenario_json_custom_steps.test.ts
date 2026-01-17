import { expect, test } from "bun:test";

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { loadStepHandlersModule } from "../src/scenario/module";
import { runScenarioFile } from "../src/scenario/runner";

test("JSON scenario supports custom steps (handlers injected)", async () => {
  const scenarioPath = resolve("scripts/m6_json_custom_demo.json");
  const artifactsDir = resolve(".tmp/test_scenarios/m6_json_custom_demo");

  const loaded = await loadStepHandlersModule("scripts/m6_json_custom_steps.ts");

  const result = await runScenarioFile(scenarioPath, { artifactsDir, steps: loaded.steps });
  expect(result.ok).toBe(true);

  const maskedPath = join(artifactsDir, "masked.txt");
  const castPath = join(artifactsDir, "m6_json_custom_demo.cast");
  const reportPath = join(artifactsDir, "m6_json_custom_demo.report.html");

  expect(existsSync(maskedPath)).toBe(true);
  expect(existsSync(castPath)).toBe(true);
  expect(existsSync(reportPath)).toBe(true);

  const masked = readFileSync(maskedPath, "utf8").trimEnd();
  expect(masked).toBe("TOKEN: <id>\nDONE");
});
