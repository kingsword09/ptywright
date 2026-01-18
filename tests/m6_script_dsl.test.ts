import { expect, test } from "bun:test";

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { defineScript, ScriptBuilder } from "../src/script/dsl";
import { loadScriptModule } from "../src/script/module";
import { runScript } from "../src/script/runner";
import { createAssertSnapshotEqualsStep } from "../src/script/steps";
import type { CustomStepHandler } from "../src/script/runner";

test("script DSL supports custom steps (direct runner)", async () => {
  type CustomSteps = {
    assertMaskedEquals: { expected: string };
  };

  const steps = {
    assertMaskedEquals: createAssertSnapshotEqualsStep("masked") satisfies CustomStepHandler<
      CustomSteps["assertMaskedEquals"]
    >,
  } satisfies Record<string, CustomStepHandler>;

  const script = defineScript(() =>
    new ScriptBuilder<never, CustomSteps>({
      name: "m6_dsl_test",
      launch: {
        command: "bun",
        args: ["run", "tests/fixtures/random_token_demo.ts"],
        cwd: ".",
        cols: 60,
        rows: 8,
        name: "xterm-256color",
      },
      trace: {
        saveCast: true,
        saveReport: true,
        reportScope: "visible",
        reportMaxFrames: 40,
      },
    })
      .waitForText({ scope: "visible", text: "DONE", timeoutMs: 5000, intervalMs: 50 })
      .snapshotText({
        scope: "visible",
        trimRight: true,
        trimBottom: true,
        mask: [
          {
            regex: "TOKEN: [0-9a-f-]+",
            flags: "i",
            replacement: "TOKEN: <id>",
          },
        ],
        saveAs: "masked",
        saveTo: "masked.txt",
      })
      .custom("assertMaskedEquals", { expected: "TOKEN: <id>\nDONE" }),
  );

  const artifactsDir = resolve(".tmp/test_scripts/m6_dsl_test");
  const result = await runScript(script, { artifactsDir, steps });
  expect(result.ok).toBe(true);

  const maskedPath = join(artifactsDir, "masked.txt");
  const castPath = join(artifactsDir, "m6_dsl_test.cast");
  const reportPath = join(artifactsDir, "m6_dsl_test.report.html");

  expect(existsSync(maskedPath)).toBe(true);
  expect(existsSync(castPath)).toBe(true);
  expect(existsSync(reportPath)).toBe(true);

  const masked = readFileSync(maskedPath, "utf8").trimEnd();
  expect(masked).toBe("TOKEN: <id>\nDONE");
});

test("script module loader runs a TS DSL script", async () => {
  const loaded = await loadScriptModule("scripts/m6_dsl_demo.ts");
  const artifactsDir = resolve(".tmp/test_scripts/m6_dsl_module_demo");

  const result = await runScript(loaded.script, { artifactsDir, steps: loaded.steps });
  expect(result.ok).toBe(true);

  const maskedPath = join(artifactsDir, "masked.txt");
  const castPath = join(artifactsDir, "m6_dsl_demo.cast");
  const reportPath = join(artifactsDir, "m6_dsl_demo.report.html");

  expect(existsSync(maskedPath)).toBe(true);
  expect(existsSync(castPath)).toBe(true);
  expect(existsSync(reportPath)).toBe(true);

  const masked = readFileSync(maskedPath, "utf8").trimEnd();
  expect(masked).toBe("TOKEN: <id>\nDONE");
});
