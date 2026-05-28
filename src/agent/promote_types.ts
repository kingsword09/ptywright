import type { replayAllAgentRecords } from "./replay_all";
import type { validateAgentArtifactsPath } from "./validate";

export type AgentPromoteOptions = {
  sourcePath: string;
  cassetteDir?: string;
  snapshotDir?: string;
  snapshotRoot?: string;
  artifactsRoot?: string;
  updateSnapshots?: boolean;
  headless?: boolean;
};

export type AgentPromoteResult = {
  ok: boolean;
  sourcePath: string;
  cassetteDir: string;
  targetDir: string;
  targetCassettePath: string;
  snapshotDir: string;
  artifactsRoot: string;
  summaryPath: string;
  updateSnapshots: boolean;
  validation: Awaited<ReturnType<typeof validateAgentArtifactsPath>>;
  replay: Awaited<ReturnType<typeof replayAllAgentRecords>>;
};
