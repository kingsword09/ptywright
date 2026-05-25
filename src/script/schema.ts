import { z } from "zod";

export const textMaskRuleSchema = z.object({
  regex: z.string().min(1),
  flags: z.string().optional(),
  replacement: z.string().optional(),
  preserveLength: z.boolean().optional(),
});

export const launchConfigSchema = z
  .object({
    backend: z.enum(["pty", "frames", "ink", "ratatui"]).optional(),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
    env: z.record(z.string()).optional(),
    cols: z.number().int().positive().optional(),
    rows: z.number().int().positive().optional(),
    name: z.string().optional(),
    frame: z.string().optional(),
    frames: z
      .array(
        z.union([
          z.string(),
          z.object({
            name: z.string().optional(),
            text: z.string().optional(),
            frame: z.string().optional(),
            snapshot: z.string().optional(),
            lastFrame: z.string().optional(),
          }),
        ]),
      )
      .optional(),
    framePath: z.string().optional(),
    frameModule: z.string().optional(),
    advanceOnInput: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const backend = value.backend ?? "pty";
    if (backend === "pty") {
      if (!value.command) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["command"],
          message: "launch.command is required when backend=pty",
        });
      }
      return;
    }

    if (!value.frame && !value.frames?.length && !value.framePath && !value.frameModule) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "framework launch requires one of frame, frames, framePath, or frameModule when backend is not pty",
      });
    }
  });

export const scriptTraceSchema = z.object({
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

const sendMouseStepSchema = z.object({
  type: z.literal("sendMouse"),
  action: z.enum(["down", "up", "move", "click", "scroll_up", "scroll_down"]),
  x: z.number().int(),
  y: z.number().int(),
  button: z.enum(["left", "middle", "right"]).optional(),
  shift: z.boolean().optional(),
  alt: z.boolean().optional(),
  ctrl: z.boolean().optional(),
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

const assertStepSchema = z
  .object({
    type: z.literal("assert"),
    scope: z.enum(["visible", "buffer"]).optional(),
    text: z.string().optional(),
    regex: z.string().optional(),
    description: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.text && !value.regex) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "assert requires text or regex",
      });
    }
  });

const assertSemanticStepSchema = z.object({
  type: z.literal("assertSemantic"),
  prompt: z.string().min(1),
  description: z.string().optional(),
});

export const scriptStepSchema = z.union([
  sendTextStepSchema,
  pressKeyStepSchema,
  sendMouseStepSchema,
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
  assertStepSchema,
  assertSemanticStepSchema,
]);

export const scriptSchema = z.object({
  name: z.string().optional(),
  artifactsDir: z.string().optional(),
  launch: launchConfigSchema,
  trace: scriptTraceSchema.optional(),
  steps: z.array(scriptStepSchema).min(1),
});

export type Script = z.infer<typeof scriptSchema>;
export type ScriptStep = z.infer<typeof scriptStepSchema>;
