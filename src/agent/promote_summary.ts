import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { z } from "zod";

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

const countSummarySchema = z
  .object({
    ok: z.boolean(),
    totalCount: z.number().int().nonnegative(),
    failureCount: z.number().int().nonnegative(),
  })
  .strict();

const agentCommandSchema = z
  .object({
    argv: z.array(z.string().min(1)).min(1),
  })
  .strict();

const agentPromoteCommandsSchema = z
  .object({
    promote: agentCommandSchema,
    check: agentCommandSchema,
    updateSnapshots: agentCommandSchema,
    rerun: agentCommandSchema,
  })
  .strict();

export const agentPromoteSummarySchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    ok: z.boolean(),
    sourcePath: z.string().min(1),
    cassetteDir: z.string().min(1),
    targetDir: z.string().min(1),
    targetCassettePath: z.string().min(1),
    snapshotDir: z.string().min(1),
    artifactsRoot: z.string().min(1),
    summaryPath: z.string().min(1),
    updateSnapshots: z.boolean(),
    commands: agentPromoteCommandsSchema,
    validation: countSummarySchema,
    replay: z
      .object({
        ok: z.boolean(),
        totalCount: z.number().int().nonnegative(),
        failureCount: z.number().int().nonnegative(),
        reportPath: z.string(),
        summaryPath: z.string(),
      })
      .strict(),
    failures: z.array(
      z
        .object({
          stage: z.enum(["validation", "replay"]),
          filePath: z.string().min(1),
          kind: z.string().optional(),
          errors: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((summary, ctx) => {
    const failureCount = summary.validation.failureCount + summary.replay.failureCount;
    if (summary.ok !== (summary.validation.ok && summary.replay.ok && failureCount === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ok"],
        message: "ok must be true only when validation and replay have zero failures",
      });
    }

    if (summary.failures.length !== failureCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["failures"],
        message: "failures.length must equal validation plus replay failure counts",
      });
    }

    const expected = defaultAgentPromoteCommands(summary);
    if (!sameArgv(summary.commands.promote.argv, expected.promote.argv)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commands", "promote", "argv"],
        message: "promote argv must match sourcePath, cassetteDir, snapshotDir, and artifactsRoot",
      });
    }

    if (!sameArgv(summary.commands.check.argv, expected.check.argv)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commands", "check", "argv"],
        message: "check argv must match cassetteDir and artifactsRoot",
      });
    }

    if (!sameArgv(summary.commands.updateSnapshots.argv, expected.updateSnapshots.argv)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commands", "updateSnapshots", "argv"],
        message: "updateSnapshots argv must match cassetteDir and artifactsRoot",
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

export function normalizeAgentPromoteSummary(input: unknown): AgentPromoteSummary {
  try {
    const parsed = agentPromoteSummarySchema.parse(input);
    return {
      ...parsed,
      $schema: parsed.$schema ?? AGENT_PROMOTE_SCHEMA_URL,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`invalid agent promote summary: ${formatZodIssues(error)}`);
    }
    throw error;
  }
}

export function readAgentPromoteSummaryPath(path: string): AgentPromoteSummary {
  return normalizeAgentPromoteSummary(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

export function writeAgentPromoteSummaryPath(path: string, summary: AgentPromoteSummary): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(normalizeAgentPromoteSummary(summary), null, 2) + "\n",
    "utf8",
  );
}

function defaultAgentPromoteCommands(summary: {
  sourcePath: string;
  cassetteDir: string;
  snapshotDir: string;
  artifactsRoot: string;
  summaryPath: string;
  updateSnapshots: boolean;
}): AgentPromoteSummary["commands"] {
  const promote = [
    "ptywright",
    "agent",
    "promote",
    summary.sourcePath,
    "--cassette-dir",
    summary.cassetteDir,
    "--snapshot-dir",
    summary.snapshotDir,
    "--artifacts-root",
    summary.artifactsRoot,
  ];
  if (summary.updateSnapshots) {
    promote.push("--update-snapshots");
  }

  const check = [
    "ptywright",
    "agent",
    "check",
    summary.cassetteDir,
    "--artifacts-root",
    summary.artifactsRoot,
  ];

  return {
    promote: { argv: promote },
    check: { argv: check },
    updateSnapshots: { argv: [...check, "--update-snapshots"] },
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
