import type { ScriptSession } from "./frame_session_types";
import type { ScriptStep } from "./schema";

export type SnapshotRecord = {
  kind: string;
  hash: string;
  text: string;
};

export type ScriptCustomStep<Name extends string = string, Payload = unknown> = {
  type: "custom";
  name: Name;
  payload?: Payload;
};

export type ScriptRunnerContext = {
  session: ScriptSession;
  stepIndex: number;
  last: SnapshotRecord | null;
  snapshots: Map<string, SnapshotRecord>;
  artifactsDir: string;
  resolveArtifactPath: (path: string) => string;
  resolveGoldenPath: (path: string) => string;
  updateGoldens: boolean;
  captureSnapshot: (
    step: Omit<Extract<ScriptStep, { type: "snapshot" }>, "type">,
  ) => Promise<SnapshotRecord>;
  getSnapshot: (from?: string) => SnapshotRecord;
  writeArtifactText: (path: string, text: string) => void;
  assertGoldenText: (path: string, text: string) => void;
};

type CustomStepHandlerImpl<Payload> = {
  bivarianceHack(
    ctx: ScriptRunnerContext,
    step: ScriptCustomStep<string, Payload>,
  ): Promise<SnapshotRecord | void> | SnapshotRecord | void;
}["bivarianceHack"];

export type CustomStepHandler<Payload = unknown> = CustomStepHandlerImpl<Payload>;

export type ScriptExecutionStep = {
  index: number;
  step: ScriptStep;
  before: SnapshotRecord | null;
  after: SnapshotRecord | null;
  durationMs: number;
  ok: boolean;
  error?: string;
};
