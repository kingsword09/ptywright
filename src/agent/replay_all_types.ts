import type { AgentRunResult } from "./runner";

export type AgentReplayAllOptions = {
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
