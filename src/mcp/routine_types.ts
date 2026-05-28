import { z } from "zod";

export const routineStepSchema = z.object({
  action: z.enum(["sendText", "pressKey", "wait", "assert", "snapshot"]),
  text: z.string().optional(),
  enter: z.boolean().optional(),
  key: z.string().optional(),
  waitFor: z.string().optional(),
  regex: z.string().optional(),
  timeoutMs: z.number().int().optional(),
  description: z.string().optional(),
});

export type RoutineStep = z.infer<typeof routineStepSchema>;

export type RoutineStepResult = {
  index: number;
  action: string;
  description?: string;
  ok: boolean;
  error?: string;
  snapshot?: string;
  hash?: string;
};
