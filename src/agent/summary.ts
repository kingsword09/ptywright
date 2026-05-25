import { readFileSync, writeFileSync } from "node:fs";

import { z } from "zod";

import { agentRunModeSchema } from "./run_record";

export const AGENT_REPLAY_SUMMARY_SCHEMA_URL =
  "https://ptywright.local/schemas/ptywright-agent-replay-summary.schema.json";

const agentCommandSchema = z
  .object({
    argv: z.array(z.string().min(1)).min(1),
  })
  .strict();

const agentReplaySummaryCommandsSchema = z
  .object({
    replayAll: agentCommandSchema,
    updateSnapshots: agentCommandSchema,
    rerun: agentCommandSchema,
  })
  .strict();

export const agentReplayFailedArtifactSchema = z
  .object({
    name: z.string().min(1),
    viewport: z.string().min(1),
    kind: z.enum(["terminal", "dom", "screenshot"]),
    path: z.string().min(1),
    baselinePath: z.string().min(1).optional(),
    diffPath: z.string().min(1).optional(),
    error: z.string().optional(),
  })
  .strict();

export const agentReplaySummaryEntrySchema = z
  .object({
    filePath: z.string().min(1),
    durationMs: z.number().int().nonnegative(),
    ok: z.boolean(),
    mode: agentRunModeSchema,
    frames: z.number().int().nonnegative(),
    reportPath: z.string().min(1),
    recordPath: z.string().min(1),
    cassettePath: z.string().min(1),
    failedArtifacts: z.array(agentReplayFailedArtifactSchema),
    errors: z.array(z.string()),
  })
  .strict();

export const agentReplaySummarySchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    ok: z.boolean(),
    dir: z.string().min(1),
    suiteDir: z.string().min(1),
    durationMs: z.number().int().nonnegative(),
    reportPath: z.string().min(1),
    summaryPath: z.string().min(1),
    commands: agentReplaySummaryCommandsSchema,
    updateSnapshots: z.boolean(),
    totalCount: z.number().int().nonnegative(),
    failureCount: z.number().int().nonnegative(),
    entries: z.array(agentReplaySummaryEntrySchema),
  })
  .strict()
  .superRefine((summary, ctx) => {
    if (summary.totalCount !== summary.entries.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalCount"],
        message: "totalCount must equal entries.length",
      });
    }

    const failureCount = summary.entries.filter((entry) => !entry.ok).length;
    if (summary.failureCount !== failureCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["failureCount"],
        message: "failureCount must equal failed entries",
      });
    }

    if (summary.ok !== (failureCount === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ok"],
        message: "ok must be true only when failureCount is zero",
      });
    }

    const expected = defaultAgentReplaySummaryCommands(summary);
    if (!sameArgv(summary.commands.replayAll.argv, expected.replayAll.argv)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commands", "replayAll", "argv"],
        message: "replayAll argv must match dir and suiteDir",
      });
    }

    if (!sameArgv(summary.commands.updateSnapshots.argv, expected.updateSnapshots.argv)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commands", "updateSnapshots", "argv"],
        message: "updateSnapshots argv must match dir and suiteDir",
      });
    }

    if (!sameArgv(summary.commands.rerun.argv, expected.rerun.argv)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commands", "rerun", "argv"],
        message: "rerun argv must match summaryPath",
      });
    }
  });

export type AgentReplayFailedArtifact = z.infer<typeof agentReplayFailedArtifactSchema>;
export type AgentReplaySummaryEntry = z.infer<typeof agentReplaySummaryEntrySchema>;
export type AgentReplaySummary = z.infer<typeof agentReplaySummarySchema>;

export function normalizeAgentReplaySummary(input: unknown): AgentReplaySummary {
  try {
    const parsed = agentReplaySummarySchema.parse(input);
    return {
      ...parsed,
      $schema: parsed.$schema ?? AGENT_REPLAY_SUMMARY_SCHEMA_URL,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`invalid agent replay summary: ${formatZodIssues(error)}`);
    }
    throw error;
  }
}

export function readAgentReplaySummaryPath(path: string): AgentReplaySummary {
  return normalizeAgentReplaySummary(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

export function writeAgentReplaySummaryPath(path: string, summary: AgentReplaySummary): void {
  const normalized = normalizeAgentReplaySummary({
    ...summary,
    $schema: summary.$schema ?? AGENT_REPLAY_SUMMARY_SCHEMA_URL,
  });
  writeFileSync(path, JSON.stringify(normalized, null, 2) + "\n", "utf8");
}

function defaultAgentReplaySummaryCommands(summary: {
  dir: string;
  suiteDir: string;
  summaryPath: string;
}): z.infer<typeof agentReplaySummaryCommandsSchema> {
  const replayAll = [
    "ptywright",
    "agent",
    "replay-all",
    summary.dir,
    "--artifacts-root",
    summary.suiteDir,
  ];
  return {
    replayAll: { argv: replayAll },
    updateSnapshots: { argv: [...replayAll, "--update-snapshots"] },
    rerun: { argv: ["ptywright", "agent", "rerun", summary.summaryPath] },
  };
}

function sameArgv(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
