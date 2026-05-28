import { z } from "zod";

export { scriptStepSchema, textMaskRuleSchema } from "./step_schemas";
import { scriptStepSchema } from "./step_schemas";

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

export const scriptSchema = z.object({
  name: z.string().optional(),
  artifactsDir: z.string().optional(),
  launch: launchConfigSchema,
  trace: scriptTraceSchema.optional(),
  steps: z.array(scriptStepSchema).min(1),
});

export type Script = z.infer<typeof scriptSchema>;
export type ScriptStep = z.infer<typeof scriptStepSchema>;
