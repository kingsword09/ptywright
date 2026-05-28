import type { ResolvedPtywrightConfig } from "../config";
import type {
  AgentCommandRecord,
  AgentRunArtifactRecord,
  AgentRunRecordMode,
  AgentRecordedStepRecord,
} from "./run_record";
import type { AgentCassette } from "./cassette";
import type { AgentViewport } from "./schema";

export type AgentRunnerOptions = {
  artifactsDir?: string;
  updateSnapshots?: boolean;
  headless?: boolean;
  rootDir?: string;
  config?: ResolvedPtywrightConfig;
  replayCassette?: AgentCassette;
  replaySourceCassettePath?: string;
};

export type AgentRunArtifact = AgentRunArtifactRecord;

export type AgentRecordedStep = AgentRecordedStepRecord;

export type AgentRunMode = AgentRunRecordMode;

export type AgentRunResult = {
  ok: boolean;
  name: string;
  mode: AgentRunMode;
  agentFlavor: string;
  startedAt: number;
  durationMs: number;
  artifactsDir: string;
  snapshotDir: string;
  reportPath: string;
  recordPath: string;
  flowPath: string;
  cassettePath: string;
  replaySourceCassettePath?: string;
  replayCommand: string;
  commands: {
    replay: AgentCommandRecord;
    updateSnapshots: AgentCommandRecord;
  };
  viewports: AgentViewport[];
  cassetteFrameCount: number;
  steps: AgentRecordedStep[];
  artifacts: AgentRunArtifact[];
  errors: string[];
};
