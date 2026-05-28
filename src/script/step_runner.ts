import { sleep } from "../util/sleep";
import type { ScriptSession } from "./frame_session_types";
import type { CustomStepHandler, SnapshotRecord } from "./runner_types";
import type { ScriptStep } from "./schema";
import {
  assertGoldenText,
  assertRecordMatches,
  persistSnapshotRecord,
  selectSnapshot,
  snapshotStep,
} from "./snapshot";
import {
  expectSessionMeta,
  runAssertStep,
  runCustomStep,
  runMouseStep,
  waitForExitStep,
  waitForStableScreenStep,
  waitForTextStep,
} from "./step_runner_helpers";

export async function runStep(args: {
  step: ScriptStep;
  stepIndex: number;
  session: ScriptSession;
  snapshots: Map<string, SnapshotRecord>;
  last: SnapshotRecord | null;
  resolveGoldenPath: (path: string) => string;
  resolveArtifactPath: (path: string) => string;
  updateGoldens: boolean;
  stepHandlers?: Record<string, CustomStepHandler>;
  artifactsDir: string;
}): Promise<SnapshotRecord | null> {
  const { step } = args;

  try {
    if (step.type === "sendText") {
      args.session.sendText(step.text, { enter: step.enter });
      return args.last;
    }

    if (step.type === "pressKey") {
      args.session.pressKey(step.key);
      return args.last;
    }

    if (step.type === "sendMouse") {
      runMouseStep(args.session, step);
      return args.last;
    }

    if (step.type === "resize") {
      args.session.resize(step.cols, step.rows);
      return args.last;
    }

    if (step.type === "mark") {
      args.session.mark(step.label);
      return args.last;
    }

    if (step.type === "sleep") {
      await sleep(step.ms);
      return args.last;
    }

    if (step.type === "waitForText") {
      await waitForTextStep(args.session, step, args.stepIndex);
      return args.last;
    }

    if (step.type === "waitForStableScreen") {
      await waitForStableScreenStep(args.session, step, args.stepIndex);
      return args.last;
    }

    if (step.type === "waitForExit") {
      await waitForExitStep(args.session, step);
      return args.last;
    }

    if (step.type === "expectMeta") {
      await expectSessionMeta(args.session, step);
      return args.last;
    }

    if (step.type === "snapshot") {
      const record = await snapshotStep(args.session, step);
      persistSnapshotRecord({
        record,
        saveAs: step.saveAs,
        saveTo: step.saveTo,
        snapshots: args.snapshots,
        resolveArtifactPath: args.resolveArtifactPath,
      });
      return record;
    }

    if (step.type === "expect") {
      const record = selectSnapshot(args.last, args.snapshots, step.from);
      assertRecordMatches(record, step, args.stepIndex);
      return args.last;
    }

    if (step.type === "assert") {
      await runAssertStep(args.session, step, args.stepIndex);
      return args.last;
    }

    if (step.type === "assertSemantic") {
      return args.last;
    }

    if (step.type === "expectGolden") {
      const record = selectSnapshot(args.last, args.snapshots, step.from);
      const goldenPath = args.resolveGoldenPath(step.path);
      assertGoldenText(goldenPath, `${record.text}\n`, args.updateGoldens);
      return args.last;
    }

    if (step.type === "custom") {
      return await runCustomStep({
        step,
        stepIndex: args.stepIndex,
        session: args.session,
        snapshots: args.snapshots,
        last: args.last,
        resolveGoldenPath: args.resolveGoldenPath,
        resolveArtifactPath: args.resolveArtifactPath,
        updateGoldens: args.updateGoldens,
        stepHandlers: args.stepHandlers,
        artifactsDir: args.artifactsDir,
      });
    }

    throw new Error(`unknown type: ${(step as ScriptStep).type}`);
  } catch (error) {
    throw annotateStepError(error, args.stepIndex, step);
  }
}

function annotateStepError(error: unknown, stepIndex: number, step: ScriptStep): Error {
  const label =
    step.type === "custom"
      ? `custom(${(step as Extract<ScriptStep, { type: "custom" }>).name})`
      : step.type;
  const prefix = `step ${stepIndex + 1} ${label}`;

  if (error instanceof Error) {
    if (!error.message.startsWith("step ")) {
      error.message = `${prefix}: ${error.message}`;
    }
    return error;
  }

  return new Error(`${prefix}: ${String(error)}`);
}
