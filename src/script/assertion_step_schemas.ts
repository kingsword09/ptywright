import { z } from "zod";

import { textMaskRuleSchema } from "./text_mask_schema";

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

export const assertionScriptStepSchemas = [
  expectMetaStepSchema,
  snapshotStepSchema,
  expectStepSchema,
  expectGoldenStepSchema,
  customStepSchema,
  assertStepSchema,
  assertSemanticStepSchema,
] as const;
