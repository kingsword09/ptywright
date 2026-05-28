import { mkdirSync } from "node:fs";

import { envTruthy } from "../common/env";
import {
  writeFailureArtifacts,
  writeTestDataArtifact,
  writeTraceArtifacts,
} from "./runner_artifacts";
import { createScriptPathResolvers, resolveArtifactsDir } from "./runner_paths";
import { loadJsonScriptFileWithDefaultName } from "./runner_load";
import { launchScriptSession } from "./runner_session";
import { resolveScriptTraceArtifacts } from "./runner_trace";
import type { CustomStepHandler, ScriptExecutionStep, SnapshotRecord } from "./runner_types";
import { scriptSchema } from "./schema";
import type { Script, ScriptStep } from "./schema";
import { runStep } from "./step_runner";
import { formatStepLabel } from "./step_label";
import { snapshotAfterStep } from "./snapshot";

export type {
  CustomStepHandler,
  ScriptCustomStep,
  ScriptRunnerContext,
  SnapshotRecord,
} from "./runner_types";

type RunScriptOptions = {
  artifactsDir?: string;
  updateGoldens?: boolean;
  steps?: Record<string, CustomStepHandler>;
};

export async function runScriptFile(
  scriptPath: string,
  options?: RunScriptOptions,
): Promise<{ ok: true; artifactsDir: string }> {
  return runScript(await loadJsonScriptFileWithDefaultName(scriptPath), options);
}

export async function runScript(
  script: unknown,
  options?: RunScriptOptions,
): Promise<{ ok: true; artifactsDir: string }> {
  const parsed = scriptSchema.parse(script) as Script;

  const scriptName = parsed.name ?? "script";
  const artifactsDir = resolveArtifactsDir(parsed, scriptName, options?.artifactsDir);

  mkdirSync(artifactsDir, { recursive: true });

  const { session, closeSession } = await launchScriptSession({
    launch: parsed.launch,
    scriptName,
  });

  const snapshots = new Map<string, SnapshotRecord>();
  let last: SnapshotRecord | null = null;
  let currentStepIndex = -1;
  let currentStep: ScriptStep | null = null;

  const { resolveArtifactPath, resolveGoldenPath } = createScriptPathResolvers(artifactsDir);

  const traceArtifacts = resolveScriptTraceArtifacts({
    script: parsed,
    scriptName,
    resolveArtifactPath,
  });

  const stepHandlers = options?.steps;

  // Track each step execution for full report
  const executionSteps: ScriptExecutionStep[] = [];

  try {
    for (let stepIndex = 0; stepIndex < parsed.steps.length; stepIndex += 1) {
      const step = parsed.steps[stepIndex] as ScriptStep;
      currentStepIndex = stepIndex;
      currentStep = step;

      const stepStartedAt = Date.now();
      // Capture state before step (reuse last if available)
      const before = last;

      try {
        last = await runStep({
          step,
          stepIndex,
          session,
          snapshots,
          last,
          resolveGoldenPath,
          resolveArtifactPath,
          updateGoldens: options?.updateGoldens ?? envTruthy(process.env.UPDATE_GOLDENS),
          stepHandlers,
          artifactsDir,
        });

        const stepProducedNewSnapshot = last !== before;
        const after = stepProducedNewSnapshot ? last : await snapshotAfterStep(session);
        if (!stepProducedNewSnapshot && after) {
          last = after;
        }

        executionSteps.push({
          index: stepIndex,
          step,
          before,
          after,
          durationMs: Date.now() - stepStartedAt,
          ok: true,
        });
      } catch (err) {
        // Step failed
        executionSteps.push({
          index: stepIndex,
          step,
          before,
          after: null, // Will be captured in failure block
          durationMs: Date.now() - stepStartedAt,
          ok: false,
          error: (err as Error).message,
        });
        throw err;
      }
    }

    await writeTraceArtifacts({
      session,
      artifactsDir,
      saveCast: traceArtifacts.saveCast,
      castPath: traceArtifacts.castPath,
      saveReport: traceArtifacts.saveReport,
      reportPath: traceArtifacts.reportPath,
      reportScope: traceArtifacts.reportScope,
      reportMaxFrames: traceArtifacts.reportMaxFrames,
      scriptName,
      result: { ok: true },
      executionSteps, // Pass steps to report generator
    });
    writeTestDataArtifact({
      artifactsDir,
      scriptName,
      ok: true,
      executionSteps,
      resolveArtifactPath,
    });

    closeSession();
    return { ok: true, artifactsDir };
  } catch (error) {
    try {
      writeTestDataArtifact({
        artifactsDir,
        scriptName,
        ok: false,
        error: (error as Error).message,
        executionSteps,
        resolveArtifactPath,
      });
      await writeFailureArtifacts({
        session,
        artifactsDir,
        scriptName,
        stepIndex: currentStepIndex,
        step: currentStep,
        last,
        error,
      });
      await writeTraceArtifacts({
        session,
        artifactsDir,
        saveCast: traceArtifacts.saveCast,
        castPath: traceArtifacts.castPath,
        saveReport: traceArtifacts.saveReport,
        reportPath: traceArtifacts.reportPath,
        reportScope: traceArtifacts.reportScope,
        reportMaxFrames: traceArtifacts.reportMaxFrames,
        scriptName,
        result: {
          ok: false,
          error: (error as Error).message,
          failureStep: currentStep
            ? { index: currentStepIndex + 1, type: formatStepLabel(currentStep) }
            : undefined,
        },
        executionSteps, // Pass steps so far
      });
    } catch {
      // ignore best-effort artifact writing
    } finally {
      closeSession();
    }

    throw error;
  }
}
