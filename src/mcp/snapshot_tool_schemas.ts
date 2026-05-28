import { z } from "zod";

import { textMaskRuleSchema } from "./tool_schemas";

export const snapshotArgsShape = {
  sessionId: z.string().min(1).optional(),
  scope: z.enum(["visible", "buffer"]).optional(),
  trimRight: z.boolean().optional(),
  trimBottom: z.boolean().optional(),
  maxLines: z.number().int().positive().optional(),
  tailLines: z.number().int().positive().optional(),
  mask: z.array(textMaskRuleSchema).optional(),
};

export const snapshotViewArgsShape = {
  ...snapshotArgsShape,
  lineNumbers: z.boolean().optional(),
};
