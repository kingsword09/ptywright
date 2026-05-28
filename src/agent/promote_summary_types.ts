export const AGENT_PROMOTE_SCHEMA_URL =
  "https://ptywright.local/schemas/ptywright-agent-promote.schema.json";

export type AgentPromoteSummary = {
  $schema: string;
  version: 1;
  ok: boolean;
  sourcePath: string;
  cassetteDir: string;
  targetDir: string;
  targetCassettePath: string;
  snapshotDir: string;
  artifactsRoot: string;
  summaryPath: string;
  updateSnapshots: boolean;
  commands: {
    promote: {
      argv: string[];
    };
    check: {
      argv: string[];
    };
    updateSnapshots: {
      argv: string[];
    };
    rerun: {
      argv: string[];
    };
  };
  validation: {
    ok: boolean;
    totalCount: number;
    failureCount: number;
  };
  replay: {
    ok: boolean;
    totalCount: number;
    failureCount: number;
    reportPath: string;
    summaryPath: string;
  };
  failures: Array<{
    stage: "validation" | "replay";
    filePath: string;
    kind?: string;
    errors: string[];
  }>;
};

export type AgentPromoteCommandSource = {
  sourcePath: string;
  cassetteDir: string;
  snapshotDir: string;
  artifactsRoot: string;
  summaryPath: string;
  updateSnapshots: boolean;
};
