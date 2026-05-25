import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { z } from "zod";

export const AGENT_CHECK_SCHEMA_URL =
  "https://ptywright.local/schemas/ptywright-agent-check.schema.json";

export type AgentCheckJsonSummary = {
  $schema: string;
  version: 1;
  ok: boolean;
  cassetteDir: string;
  artifactsRoot: string;
  summaryPath: string;
  commands: {
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
  inputs: {
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
  outputs: {
    totalCount: number;
    failureCount: number;
  };
  failures: Array<{
    stage: "input" | "replay" | "output";
    filePath: string;
    kind?: string;
    errors: string[];
  }>;
};

const countSummarySchema = z
  .object({
    totalCount: z.number().int().nonnegative(),
    failureCount: z.number().int().nonnegative(),
  })
  .strict();

const agentCommandSchema = z
  .object({
    argv: z.array(z.string().min(1)).min(1),
  })
  .strict();

const agentCheckCommandsSchema = z
  .object({
    check: agentCommandSchema,
    updateSnapshots: agentCommandSchema,
    rerun: agentCommandSchema,
  })
  .strict();

export const agentCheckJsonSummarySchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    ok: z.boolean(),
    cassetteDir: z.string().min(1),
    artifactsRoot: z.string().min(1),
    summaryPath: z.string().min(1),
    commands: agentCheckCommandsSchema,
    inputs: countSummarySchema,
    replay: z
      .object({
        ok: z.boolean(),
        totalCount: z.number().int().nonnegative(),
        failureCount: z.number().int().nonnegative(),
        reportPath: z.string(),
        summaryPath: z.string(),
      })
      .strict(),
    outputs: countSummarySchema,
    failures: z.array(
      z
        .object({
          stage: z.enum(["input", "replay", "output"]),
          filePath: z.string().min(1),
          kind: z.string().optional(),
          errors: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((summary, ctx) => {
    const failureCount =
      summary.inputs.failureCount + summary.replay.failureCount + summary.outputs.failureCount;
    if (summary.ok !== (failureCount === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ok"],
        message: "ok must be true only when all stages have zero failures",
      });
    }

    if (summary.failures.length !== failureCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["failures"],
        message: "failures.length must equal the sum of stage failure counts",
      });
    }

    const expected = defaultAgentCheckCommands(summary);
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

export function normalizeAgentCheckJsonSummary(input: unknown): AgentCheckJsonSummary {
  try {
    const parsed = agentCheckJsonSummarySchema.parse(input);
    return {
      ...parsed,
      $schema: parsed.$schema ?? AGENT_CHECK_SCHEMA_URL,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`invalid agent check summary: ${formatZodIssues(error)}`);
    }
    throw error;
  }
}

export function readAgentCheckSummaryPath(path: string): AgentCheckJsonSummary {
  return normalizeAgentCheckJsonSummary(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

export function writeAgentCheckSummaryPath(path: string, summary: AgentCheckJsonSummary): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(normalizeAgentCheckJsonSummary(summary), null, 2) + "\n",
    "utf8",
  );
}

function defaultAgentCheckCommands(summary: {
  cassetteDir: string;
  artifactsRoot: string;
  summaryPath: string;
}): AgentCheckJsonSummary["commands"] {
  const check = [
    "ptywright",
    "agent",
    "check",
    summary.cassetteDir,
    "--artifacts-root",
    summary.artifactsRoot,
  ];
  return {
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
