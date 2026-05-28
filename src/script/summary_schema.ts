import { z } from "zod";

import { sameArgv } from "../common/compare";
import { formatZodIssues } from "../common/zod";

export const SCRIPT_RUN_SUMMARY_SCHEMA_URL =
  "https://ptywright.local/schemas/ptywright-script-run-summary.schema.json";
export const SCRIPT_RUN_SUMMARY_FILE_NAME = "run.summary.json";

const scriptCommandSchema = z
  .object({
    argv: z.array(z.string().min(1)).min(1),
  })
  .strict();

const scriptRunSummaryCommandsSchema = z
  .object({
    runAll: scriptCommandSchema,
    updateGoldens: scriptCommandSchema,
  })
  .strict();

export const scriptRunFailureArtifactsSchema = z
  .object({
    lastTextPath: z.string().min(1),
    lastViewPath: z.string().min(1),
    stepPath: z.string().min(1),
    errorPath: z.string().min(1),
  })
  .strict();

export const scriptRunSummaryEntrySchema = z
  .object({
    filePath: z.string().min(1),
    filePathRel: z.string().min(1),
    scriptName: z.string().min(1),
    ok: z.boolean(),
    durationMs: z.number().int().nonnegative(),
    artifactsDir: z.string().min(1).optional(),
    reportPath: z.string().min(1).optional(),
    castPath: z.string().min(1).optional(),
    error: z.string().optional(),
    failureArtifacts: scriptRunFailureArtifactsSchema.optional(),
  })
  .strict();

export const scriptRunSummarySchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    ok: z.boolean(),
    dir: z.string().min(1),
    suiteDir: z.string().min(1),
    commands: scriptRunSummaryCommandsSchema,
    totalCount: z.number().int().nonnegative(),
    failureCount: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative(),
    reportPath: z.string().min(1),
    summaryPath: z.string().min(1),
    entries: z.array(scriptRunSummaryEntrySchema),
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

    validateRunAllCommand(summary.commands.runAll.argv, summary, ctx);
    if (
      !sameArgv(summary.commands.updateGoldens.argv, [
        ...summary.commands.runAll.argv,
        "--update-goldens",
      ])
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["commands", "updateGoldens", "argv"],
        message: "updateGoldens argv must match runAll argv plus --update-goldens",
      });
    }
  });

export type ScriptRunFailureArtifacts = z.infer<typeof scriptRunFailureArtifactsSchema>;
export type ScriptRunSummaryEntry = z.infer<typeof scriptRunSummaryEntrySchema>;
export type ScriptRunSummary = z.infer<typeof scriptRunSummarySchema> & { $schema: string };
export type ScriptRunSummaryCommands = z.infer<typeof scriptRunSummaryCommandsSchema>;

export function normalizeScriptRunSummary(input: unknown): ScriptRunSummary {
  try {
    const parsed = scriptRunSummarySchema.parse(input);
    return {
      ...parsed,
      $schema: parsed.$schema ?? SCRIPT_RUN_SUMMARY_SCHEMA_URL,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`invalid script run summary: ${formatZodIssues(error)}`);
    }
    throw error;
  }
}

function validateRunAllCommand(
  argv: readonly string[],
  summary: { dir: string; suiteDir: string },
  ctx: z.RefinementCtx,
): void {
  if (argv[0] !== "ptywright" || argv[1] !== "run-all") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["commands", "runAll", "argv"],
      message: "runAll argv must start with ptywright run-all",
    });
    return;
  }

  if (argv[2] !== summary.dir) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["commands", "runAll", "argv"],
      message: "runAll argv must target summary dir",
    });
  }

  const artifactsRootIndex = argv.indexOf("--artifacts-root");
  if (artifactsRootIndex < 0 || argv[artifactsRootIndex + 1] !== summary.suiteDir) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["commands", "runAll", "argv"],
      message: "runAll argv must target summary suiteDir",
    });
  }
}
