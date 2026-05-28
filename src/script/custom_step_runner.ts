import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { ScriptSession } from "./frame_session_types";
import type {
  CustomStepHandler,
  ScriptCustomStep,
  ScriptRunnerContext,
  SnapshotRecord,
} from "./runner_types";
import type { ScriptStep } from "./schema";
import { assertGoldenText, persistSnapshotRecord, selectSnapshot, snapshotStep } from "./snapshot";

export async function runCustomStep(args: {
  step: Extract<ScriptStep, { type: "custom" }>;
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
  const handler = args.stepHandlers?.[args.step.name];
  if (!handler) {
    throw new Error(`custom handler not found: ${args.step.name}`);
  }

  const ctx: ScriptRunnerContext = {
    session: args.session,
    stepIndex: args.stepIndex,
    last: args.last,
    snapshots: args.snapshots,
    artifactsDir: args.artifactsDir,
    resolveArtifactPath: args.resolveArtifactPath,
    resolveGoldenPath: args.resolveGoldenPath,
    updateGoldens: args.updateGoldens,
    captureSnapshot: async (
      snapshotConfig: Omit<Extract<ScriptStep, { type: "snapshot" }>, "type">,
    ) => {
      const record = await snapshotStep(args.session, {
        type: "snapshot",
        ...snapshotConfig,
      } as Extract<ScriptStep, { type: "snapshot" }>);

      persistSnapshotRecord({
        record,
        saveAs: snapshotConfig.saveAs,
        saveTo: snapshotConfig.saveTo,
        snapshots: args.snapshots,
        resolveArtifactPath: args.resolveArtifactPath,
      });

      return record;
    },
    getSnapshot: (from?: string) => selectSnapshot(args.last, args.snapshots, from),
    writeArtifactText: (path: string, text: string) => {
      const resolved = args.resolveArtifactPath(path);
      mkdirSync(dirname(resolved), { recursive: true });
      writeFileSync(resolved, text, "utf8");
    },
    assertGoldenText: (path: string, text: string) => {
      const goldenPath = args.resolveGoldenPath(path);
      assertGoldenText(goldenPath, text, args.updateGoldens);
    },
  };

  const result = await handler(ctx, args.step as ScriptCustomStep);
  return result ?? args.last;
}
