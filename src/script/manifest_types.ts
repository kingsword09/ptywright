import { z } from "zod";

import type { ManifestFileDraft } from "../common/manifest_files";
import type { ScriptRunSummaryCommands } from "./summary";

export const SCRIPT_MANIFEST_SCHEMA_URL =
  "https://ptywright.local/schemas/ptywright-script-manifest.schema.json";
export const SCRIPT_MANIFEST_FILE_NAME = "ptywright-script.manifest.json";

const scriptManifestFileKindSchema = z.enum(["run-summary", "report", "cast", "data", "failure"]);

const scriptManifestCommandSchema = z
  .object({
    argv: z.array(z.string().min(1)).min(1),
  })
  .strict();

export const scriptManifestFileSchema = z
  .object({
    path: z.string().min(1),
    kind: scriptManifestFileKindSchema,
    role: z.string().min(1).optional(),
    ok: z.boolean().optional(),
    bytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const scriptManifestSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    kind: z.literal("run-suite"),
    ok: z.boolean(),
    generatedAt: z.string().min(1),
    rootDir: z.string().min(1),
    primaryPath: z.string().min(1),
    commands: z.record(scriptManifestCommandSchema),
    totalCount: z.number().int().nonnegative(),
    failureCount: z.number().int().nonnegative(),
    files: z.array(scriptManifestFileSchema),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const seen = new Set<string>();
    for (const file of manifest.files) {
      if (seen.has(file.path)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["files"],
          message: `duplicate manifest file path: ${file.path}`,
        });
      }
      seen.add(file.path);
    }
  });

export type ScriptManifestFileKind = z.infer<typeof scriptManifestFileKindSchema>;
export type ScriptManifestFile = z.infer<typeof scriptManifestFileSchema>;
export type ScriptManifest = z.infer<typeof scriptManifestSchema> & { $schema: string };

export type ScriptManifestFileDraft = ManifestFileDraft<ScriptManifestFileKind>;

export type CreateScriptManifestOptions = {
  ok: boolean;
  rootDir: string;
  primaryPath: string;
  commands: ScriptRunSummaryCommands;
  totalCount: number;
  failureCount: number;
  files: ScriptManifestFileDraft[];
};
