import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";

import { formatPublicStepLabel } from "./step_label";
import type { ScriptExecutionStep } from "./runner_types";

export function writeTestDataArtifact(args: {
  artifactsDir: string;
  scriptName: string;
  ok: boolean;
  error?: string;
  executionSteps: Array<
    Pick<ScriptExecutionStep, "index" | "step" | "durationMs" | "ok" | "error">
  >;
  resolveArtifactPath: (path: string) => string;
}): void {
  try {
    const testId = basename(args.artifactsDir);
    const outPath = args.resolveArtifactPath("test.data.js");
    mkdirSync(dirname(outPath), { recursive: true });

    const steps = args.executionSteps.map((s) => ({
      index: s.index + 1,
      type: s.step.type,
      label: formatPublicStepLabel(s.step),
      ok: s.ok,
      durationMs: s.durationMs,
      error: s.ok ? null : (s.error ?? null),
    }));

    const data = {
      version: 1,
      testId,
      scriptName: args.scriptName,
      ok: args.ok,
      error: args.ok ? null : (args.error ?? null),
      stepCount: steps.length,
      steps,
      generatedAt: new Date().toISOString(),
    };

    const json = JSON.stringify(data).replaceAll("<", "\\u003c");
    const key = JSON.stringify(testId);
    const js =
      `globalThis.__ptywright = globalThis.__ptywright || {};\n` +
      `globalThis.__ptywright.tests = globalThis.__ptywright.tests || {};\n` +
      `globalThis.__ptywright.tests[${key}] = ${json};\n`;
    writeFileSync(outPath, js, "utf8");
  } catch {
    // best-effort
  }
}
