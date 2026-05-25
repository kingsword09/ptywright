import { readFileSync, writeFileSync } from "node:fs";

import { z } from "zod";

import { formatArgv } from "../common/argv";
import { agentFlowSpecSchema, normalizeAgentFlowSpec, type AgentFlowSpec } from "./schema";

export const AGENT_RUN_RECORD_SCHEMA_URL =
  "https://ptywright.local/schemas/ptywright-agent-run.schema.json";

export const agentRunModeSchema = z.enum(["live", "replay"]);

export const agentRecordedStepSchema = z
  .object({
    index: z.number().int().nonnegative(),
    type: z.string().min(1),
    label: z.string(),
    durationMs: z.number().int().nonnegative(),
    ok: z.boolean(),
    error: z.string().optional(),
  })
  .strict();

export const agentRunArtifactSchema = z
  .object({
    name: z.string().min(1),
    viewport: z.string().min(1),
    kind: z.enum(["terminal", "dom", "screenshot"]),
    path: z.string().min(1),
    baselinePath: z.string().min(1).optional(),
    diffPath: z.string().min(1).optional(),
    hash: z.string().min(1).optional(),
    ok: z.boolean(),
    error: z.string().optional(),
  })
  .strict();

const agentCommandSchema = z
  .object({
    argv: z.array(z.string().min(1)).min(1),
  })
  .strict();

const agentRunRecordCommandsSchema = z
  .object({
    replay: agentCommandSchema,
    updateSnapshots: agentCommandSchema,
  })
  .strict();

export const agentRunRecordSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    name: z.string().min(1),
    ok: z.boolean(),
    startedAt: z.string().min(1),
    durationMs: z.number().int().nonnegative(),
    mode: agentRunModeSchema,
    spec: agentFlowSpecSchema.optional(),
    flowPath: z.string().min(1).optional(),
    artifactsDir: z.string().min(1),
    snapshotDir: z.string().min(1),
    reportPath: z.string().min(1),
    cassettePath: z.string().min(1).optional(),
    cassetteFrameCount: z.number().int().nonnegative(),
    replayCommand: z.string().min(1),
    commands: agentRunRecordCommandsSchema,
    steps: z.array(agentRecordedStepSchema),
    artifacts: z.array(agentRunArtifactSchema),
    errors: z.array(z.string()),
  })
  .strict()
  .superRefine((record, ctx) => {
    if (!record.cassettePath && !record.flowPath && !record.spec) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "agent run record requires cassettePath, flowPath, or spec",
      });
    }

    const replayCommand = formatArgv(record.commands.replay.argv);
    if (record.replayCommand !== replayCommand) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["replayCommand"],
        message: "replayCommand must match commands.replay.argv",
      });
    }

    if (!isReplayArgv(record.commands.replay.argv)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commands", "replay", "argv"],
        message: "replay argv must be a ptywright agent replay command",
      });
    }

    const expectedUpdateSnapshots = [...record.commands.replay.argv, "--update-snapshots"];
    if (!sameArgv(record.commands.updateSnapshots.argv, expectedUpdateSnapshots)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commands", "updateSnapshots", "argv"],
        message: "updateSnapshots argv must extend commands.replay.argv",
      });
    }
  });

export type AgentCommandRecord = z.infer<typeof agentCommandSchema>;
export type AgentRunRecordMode = z.infer<typeof agentRunModeSchema>;
export type AgentRecordedStepRecord = z.infer<typeof agentRecordedStepSchema>;
export type AgentRunArtifactRecord = z.infer<typeof agentRunArtifactSchema>;
export type AgentRunRecord = Omit<z.infer<typeof agentRunRecordSchema>, "spec"> & {
  spec?: AgentFlowSpec;
};

export function normalizeAgentRunRecord(input: unknown): AgentRunRecord {
  try {
    const parsed = agentRunRecordSchema.parse(input);
    return {
      ...parsed,
      $schema: parsed.$schema ?? AGENT_RUN_RECORD_SCHEMA_URL,
      spec: parsed.spec ? normalizeAgentFlowSpec(parsed.spec) : undefined,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`invalid agent run record: ${formatZodIssues(error)}`);
    }
    throw error;
  }
}

export function formatAgentArgv(argv: readonly string[]): string {
  return formatArgv(argv);
}

function sameArgv(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isReplayArgv(argv: readonly string[]): boolean {
  return argv.length >= 4 && argv[0] === "ptywright" && argv[1] === "agent" && argv[2] === "replay";
}

export function readAgentRunRecordPath(path: string): AgentRunRecord {
  return normalizeAgentRunRecord(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

export function writeAgentRunRecordPath(path: string, record: AgentRunRecord): void {
  const normalized = normalizeAgentRunRecord({
    ...record,
    $schema: record.$schema ?? AGENT_RUN_RECORD_SCHEMA_URL,
  });
  writeFileSync(path, JSON.stringify(normalized, null, 2) + "\n", "utf8");
}

export function isAgentRunRecordLike(input: unknown): boolean {
  if (typeof input !== "object" || input === null) return false;
  const candidate = input as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    ("cassettePath" in candidate || "flowPath" in candidate || "spec" in candidate)
  );
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
