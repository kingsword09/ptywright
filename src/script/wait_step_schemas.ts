import { z } from "zod";

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

export const waitScriptStepSchemas = [
  waitForTextStepSchema,
  waitForStableScreenStepSchema,
  waitForExitStepSchema,
] as const;
