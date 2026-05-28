import { z } from "zod";

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

export const inputScriptStepSchemas = [
  sendTextStepSchema,
  pressKeyStepSchema,
  sendMouseStepSchema,
  resizeStepSchema,
  markStepSchema,
  sleepStepSchema,
] as const;
