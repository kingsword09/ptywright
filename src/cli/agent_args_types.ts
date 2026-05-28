import type { AgentFlavor } from "../agent/presets";

export const AGENT_CLI_MODES = [
  "run",
  "replay",
  "promote",
  "replay-all",
  "rerun",
  "commands",
  "inspect",
  "exec",
  "init",
  "record",
  "validate",
  "check",
] as const;

export type AgentCliMode = (typeof AGENT_CLI_MODES)[number];

export type AgentCliArgs = {
  mode: AgentCliMode;
  path?: string;
  flavor?: AgentFlavor;
  artifactsDir?: string;
  artifactsRoot?: string;
  cassetteDir?: string;
  snapshotDir?: string;
  outPath?: string;
  durationMs?: number;
  commandName?: string;
  configPath?: string;
  updateSnapshots: boolean;
  headed: boolean;
  json: boolean;
};
