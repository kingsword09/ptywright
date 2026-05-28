export type AgentValidationKind =
  | "flow"
  | "cassette"
  | "run-record"
  | "replay-summary"
  | "promote-summary"
  | "check-summary"
  | "manifest";

export type AgentValidationEntry = {
  filePath: string;
  kind: AgentValidationKind | "unknown";
  ok: boolean;
  error?: string;
};

export type AgentValidationResult = {
  ok: boolean;
  path: string;
  totalCount: number;
  failureCount: number;
  entries: AgentValidationEntry[];
};

export type AgentValidationOptions = {
  preferManifestBundle?: boolean;
};
