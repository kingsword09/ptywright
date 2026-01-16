import { expect, test } from "bun:test";

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { runScenarioFile } from "../src/scenario/runner";

test("scenario runner executes JSON scenario and writes artifacts", async () => {
  const scenarioPath = resolve("scenarios/m5_mask_demo.json");
  const artifactsDir = resolve(".tmp/test_scenarios/m5_mask_demo");

  const result = await runScenarioFile(scenarioPath, { artifactsDir });
  expect(result.ok).toBe(true);

  const maskedPath = join(artifactsDir, "masked.txt");
  const castPath = join(artifactsDir, "m5_mask_demo.cast");
  const reportPath = join(artifactsDir, "m5_mask_demo.report.html");

  expect(existsSync(maskedPath)).toBe(true);
  expect(existsSync(castPath)).toBe(true);
  expect(existsSync(reportPath)).toBe(true);

  const masked = readFileSync(maskedPath, "utf8").trimEnd();
  expect(masked).toBe("TOKEN: <id>\nDONE");
});
