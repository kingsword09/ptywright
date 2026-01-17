import { z } from "zod";

export const textMaskRuleSchema = z.object({
  regex: z.string().min(1),
  flags: z.string().optional(),
  replacement: z.string().optional(),
  preserveLength: z.boolean().optional(),
});

export const launchConfigSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  cols: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional(),
  name: z.string().optional(),
});

export const scenarioTraceSchema = z.object({
  saveCast: z.boolean().optional(),
  saveReport: z.boolean().optional(),
  castPath: z.string().optional(),
  reportPath: z.string().optional(),
  reportScope: z.enum(["visible", "buffer"]).optional(),
  reportMaxFrames: z.number().int().positive().optional(),
});

const sendTextStepSchema = z.object({
  type: z.literal("sendText"),
  text: z.string(),
  enter: z.boolean().optional(),
});

const pressKeyStepSchema = z.object({
  type: z.literal("pressKey"),
  key: z.string().min(1),
});

const resizeStepSchema = z.object({
  type: z.literal("resize"),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

const markStepSchema = z.object({
  type: z.literal("mark"),
  label: z.string().optional(),
});

const sleepStepSchema = z.object({
  type: z.literal("sleep"),
  ms: z.number().int().nonnegative(),
});

const waitForTextStepSchema = z
  .object({
    type: z.literal("waitForText"),
    scope: z.enum(["visible", "buffer"]).optional(),
    text: z.string().optional(),
    regex: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
    intervalMs: z.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.text && !value.regex) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "waitForText requires text or regex",
      });
    }
  });

const waitForStableScreenStepSchema = z.object({
  type: z.literal("waitForStableScreen"),
  timeoutMs: z.number().int().positive().optional(),
  quietMs: z.number().int().positive().optional(),
  intervalMs: z.number().int().positive().optional(),
});

const waitForExitStepSchema = z.object({
  type: z.literal("waitForExit"),
  timeoutMs: z.number().int().positive().optional(),
  intervalMs: z.number().int().positive().optional(),
  exitCode: z.number().int().optional(),
  signal: z.union([z.number().int(), z.string()]).optional(),
});

const expectMetaStepSchema = z
  .object({
    type: z.literal("expectMeta"),
    bufferType: z.enum(["normal", "alternate"]).optional(),
    cols: z.number().int().positive().optional(),
    rows: z.number().int().positive().optional(),
    cursor: z
      .object({
        x: z.number().int().positive(),
        y: z.number().int().positive(),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.bufferType === undefined &&
      value.cols === undefined &&
      value.rows === undefined &&
      value.cursor === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expectMeta requires at least one assertion (bufferType/cols/rows/cursor)",
      });
    }
  });

const snapshotStepSchema = z
  .object({
    type: z.literal("snapshot"),
    kind: z.enum(["text", "view", "ansi", "view_ansi", "grid"]),
    scope: z.enum(["visible", "buffer"]).optional(),
    trimRight: z.boolean().optional(),
    trimBottom: z.boolean().optional(),
    maxLines: z.number().int().positive().optional(),
    tailLines: z.number().int().positive().optional(),
    lineNumbers: z.boolean().optional(),
    includeStyles: z.boolean().optional(),
    mask: z.array(textMaskRuleSchema).optional(),
    saveAs: z.string().optional(),
    saveTo: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.maxLines !== undefined && value.tailLines !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "snapshot: maxLines and tailLines are mutually exclusive",
      });
    }
  });

const expectStepSchema = z
  .object({
    type: z.literal("expect"),
    from: z.string().optional(),
    equals: z.string().optional(),
    contains: z.array(z.string()).optional(),
    notContains: z.array(z.string()).optional(),
    regex: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (
      value.equals === undefined &&
      !value.contains?.length &&
      !value.notContains?.length &&
      !value.regex
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "expect requires at least one matcher (equals/contains/notContains/regex)",
      });
    }
  });

const expectGoldenStepSchema = z.object({
  type: z.literal("expectGolden"),
  from: z.string().optional(),
  path: z.string().min(1),
});

const customStepSchema = z.object({
  type: z.literal("custom"),
  name: z.string().min(1),
  payload: z.unknown().optional(),
});

export const scenarioStepSchema = z.union([
  sendTextStepSchema,
  pressKeyStepSchema,
  resizeStepSchema,
  markStepSchema,
  sleepStepSchema,
  waitForTextStepSchema,
  waitForStableScreenStepSchema,
  waitForExitStepSchema,
  expectMetaStepSchema,
  snapshotStepSchema,
  expectStepSchema,
  expectGoldenStepSchema,
  customStepSchema,
]);

export const scenarioSchema = z.object({
  name: z.string().optional(),
  artifactsDir: z.string().optional(),
  launch: launchConfigSchema,
  trace: scenarioTraceSchema.optional(),
  steps: z.array(scenarioStepSchema).min(1),
});

export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioStep = z.infer<typeof scenarioStepSchema>;
