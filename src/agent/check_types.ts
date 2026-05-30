import type { replayAllAgentRecords } from "./replay_all";
import type { validateAgentArtifactsPath } from "./validate";
import type { ResolvedPtywrightConfig } from "../config";

export type AgentCheckOptions = {
  config?: ResolvedPtywrightConfig;
  cassetteDir?: string;
  artifactsRoot?: string;
  updateSnapshots?: boolean;
  headless?: boolean;
  json?: boolean;
};

export type AgentCheckResult = {
  ok: boolean;
  cassetteDir: string;
  artifactsRoot: string;
  summaryPath: string;
  validationBefore: Awaited<ReturnType<typeof validateAgentArtifactsPath>>;
  replay: Awaited<ReturnType<typeof replayAllAgentRecords>>;
  validationAfter: Awaited<ReturnType<typeof validateAgentArtifactsPath>>;
};
