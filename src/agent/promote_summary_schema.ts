import { z } from "zod";

import { sameArgv } from "../common/compare";
import { defaultAgentPromoteCommands } from "./promote_summary_commands";

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
