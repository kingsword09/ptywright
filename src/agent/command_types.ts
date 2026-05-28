import type { AgentCommandRecord } from "./run_record";

export type AgentCommandArtifactKind =
  | "flow"
  | "cassette"
  | "run-record"
  | "replay-summary"
  | "promote-summary"
  | "check-summary"
  | "manifest";

export type AgentCommandMap = Record<string, AgentCommandRecord>;

export type AgentArtifactCommands = {
  path: string;
  kind: AgentCommandArtifactKind;
  manifestPath?: string;
  cwd: string;
  shell: Record<string, string>;
  commands: AgentCommandMap;
};

export type SelectedAgentArtifactCommand = {
  path: string;
  kind: AgentCommandArtifactKind;
  manifestPath?: string;
  cwd: string;
  name: string;
  command: AgentCommandRecord;
  shell: string;
};
