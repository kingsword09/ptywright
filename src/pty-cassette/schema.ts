import { z } from "zod";

export const PTY_CASSETTE_SCHEMA_URL =
  "https://ptywright.local/schemas/ptywright-pty-cassette.schema.json";

const base64Schema = z
  .string()
  .refine((value) => value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value), {
    message: "expected base64-encoded data",
  });

export const ptyCassetteDataEventSchema = z.object({
  atMs: z.number().int().nonnegative(),
  type: z.enum(["output", "input"]),
  dataBase64: base64Schema,
});

export const ptyCassetteResizeEventSchema = z.object({
  atMs: z.number().int().nonnegative(),
  type: z.literal("resize"),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

export const ptyCassetteExitEventSchema = z.object({
  atMs: z.number().int().nonnegative(),
  type: z.literal("exit"),
  exitCode: z.number().int(),
  signal: z.union([z.number().int(), z.string(), z.null()]).optional(),
});

export const ptyCassetteEventSchema = z.union([
  ptyCassetteDataEventSchema,
  ptyCassetteResizeEventSchema,
  ptyCassetteExitEventSchema,
]);

export const ptyCassetteSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    createdAt: z.string().min(1),
    durationMs: z.number().int().nonnegative(),
    terminal: z.object({
      cols: z.number().int().positive(),
      rows: z.number().int().positive(),
      term: z.string().min(1).optional(),
    }),
    command: z
      .object({
        file: z.string().min(1),
        args: z.array(z.string()).optional(),
        cwd: z.string().optional(),
        env: z.record(z.string()).optional(),
      })
      .optional(),
    metadata: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
    events: z.array(ptyCassetteEventSchema),
  })
  .superRefine((value, ctx) => {
    let last = -1;
    for (let i = 0; i < value.events.length; i += 1) {
      const event = value.events[i]!;
      if (event.atMs < last) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["events", i, "atMs"],
          message: "events must be ordered by atMs",
        });
      }
      last = event.atMs;
    }
  });

export type PtyCassetteDataEvent = z.infer<typeof ptyCassetteDataEventSchema>;
export type PtyCassetteResizeEvent = z.infer<typeof ptyCassetteResizeEventSchema>;
export type PtyCassetteExitEvent = z.infer<typeof ptyCassetteExitEventSchema>;
export type PtyCassetteEvent = z.infer<typeof ptyCassetteEventSchema>;
export type PtyCassette = z.infer<typeof ptyCassetteSchema>;

export type PtyCassetteValidationResult =
  | { ok: true; cassette: PtyCassette }
  | { ok: false; errors: string[] };

export function normalizePtyCassette(input: unknown): PtyCassette {
  return ptyCassetteSchema.parse(input) as PtyCassette;
}

export function validatePtyCassette(input: unknown): PtyCassetteValidationResult {
  const result = ptyCassetteSchema.safeParse(input);
  if (result.success) {
    return { ok: true, cassette: result.data as PtyCassette };
  }

  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    }),
  };
}
