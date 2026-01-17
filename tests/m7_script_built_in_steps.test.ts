import { expect, test } from "bun:test";

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { runScenario } from "../src/scenario/runner";

test("script JSON schema is valid JSON", () => {
  const raw = readFileSync(resolve("schemas/ptywright-script.schema.json"), "utf8");
  expect(() => JSON.parse(raw)).not.toThrow();
});

test("runner supports built-in steps: sleep/expectMeta/waitForExit", async () => {
  const artifactsDir = resolve(".tmp/test_scenarios/m7_script_built_in_steps");

  const result = await runScenario(
    {
      name: "m7_script_built_in_steps",
      launch: {
        command: "bun",
        args: ["run", "tests/fixtures/alt_screen_demo.ts"],
        cwd: ".",
        cols: 40,
        rows: 8,
        name: "xterm-256color",
      },
      steps: [
        { type: "waitForText", scope: "visible", text: "ALT SCREEN", timeoutMs: 5_000 },
        { type: "expectMeta", bufferType: "alternate", cols: 40, rows: 8 },
        { type: "sleep", ms: 20 },
        { type: "waitForExit", timeoutMs: 5_000, exitCode: 0 },
      ],
    },
    { artifactsDir },
  );
  expect(result.ok).toBe(true);

  const castPath = join(artifactsDir, "m7_script_built_in_steps.cast");
  const reportPath = join(artifactsDir, "m7_script_built_in_steps.report.html");

  expect(existsSync(castPath)).toBe(true);
  expect(existsSync(reportPath)).toBe(true);
});
