import type { AgentRunResult } from "./runner";
import type { ResolvedPtywrightConfig } from "../config";

export type AgentReplayAllOptions = {
  config?: ResolvedPtywrightConfig;
  dir?: string;
  artifactsRoot?: string;
  headless?: boolean;
  updateSnapshots?: boolean;
};

export type AgentReplayAllEntry = {
  filePath: string;
  durationMs: number;
  result: AgentRunResult;
};

export type AgentReplayAllResult = {
  ok: boolean;
  dir: string;
  suiteDir: string;
  durationMs: number;
  reportPath: string;
  summaryPath: string;
  updateSnapshots: boolean;
  entries: AgentReplayAllEntry[];
};
