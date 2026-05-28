import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { z } from "zod";

import {
  collectManifestFiles,
  validateManifestFiles,
  type ManifestFileDraft,
} from "../common/manifest_files";
import { formatZodIssues } from "../common/zod";
import type { AgentCommandRecord } from "./run_record";

export const AGENT_MANIFEST_SCHEMA_URL =
  "https://ptywright.local/schemas/ptywright-agent-manifest.schema.json";

export const AGENT_MANIFEST_FILE_NAME = "ptywright-agent.manifest.json";

const agentManifestKindSchema = z.enum(["run", "replay-suite", "check", "promote"]);

const agentManifestFileKindSchema = z.enum([
  "flow",
  "cassette",
  "run-record",
  "replay-summary",
  "check-summary",
  "promote-summary",
  "report",
  "terminal",
  "dom",
  "screenshot",
  "diff",
]);

const agentManifestCommandSchema = z
  .object({
    argv: z.array(z.string().min(1)).min(1),
  })
  .strict();

const agentManifestValidationStageSchema = z
  .object({
    name: z.string().min(1),
    ok: z.boolean(),
    totalCount: z.number().int().nonnegative(),
    failureCount: z.number().int().nonnegative(),
  })
  .strict();

const agentManifestValidationSchema = z
  .object({
    ok: z.boolean(),
    stages: z.array(agentManifestValidationStageSchema),
  })
  .strict()
  .superRefine((validation, ctx) => {
    const ok = validation.stages.every((stage) => stage.ok && stage.failureCount === 0);
    if (validation.ok !== ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ok"],
        message: "validation ok must match validation stages",
      });
    }
  });

export const agentManifestFileSchema = z
  .object({
    path: z.string().min(1),
    kind: agentManifestFileKindSchema,
    role: z.string().min(1).optional(),
    ok: z.boolean().optional(),
    bytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const agentManifestSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1),
    kind: agentManifestKindSchema,
    ok: z.boolean(),
    generatedAt: z.string().min(1),
    rootDir: z.string().min(1),
    primaryPath: z.string().min(1),
    commands: z.record(agentManifestCommandSchema),
    validation: agentManifestValidationSchema.optional(),
    files: z.array(agentManifestFileSchema),
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

export type AgentManifestKind = z.infer<typeof agentManifestKindSchema>;
export type AgentManifestFileKind = z.infer<typeof agentManifestFileKindSchema>;
export type AgentManifestFile = z.infer<typeof agentManifestFileSchema>;
export type AgentManifestValidation = z.infer<typeof agentManifestValidationSchema>;
export type AgentManifest = z.infer<typeof agentManifestSchema>;
export type AgentManifestCommandMap = Record<string, AgentCommandRecord>;

export type AgentManifestFileDraft = ManifestFileDraft<AgentManifestFileKind>;

export type CreateAgentManifestOptions = {
  kind: AgentManifestKind;
  ok: boolean;
  rootDir: string;
  primaryPath: string;
  commands: AgentManifestCommandMap;
  validation?: AgentManifestValidation;
  files: AgentManifestFileDraft[];
};

export function agentManifestPath(rootDir: string): string {
  return join(rootDir, AGENT_MANIFEST_FILE_NAME);
}

export function removeAgentManifestPath(rootDir: string): void {
  rmSync(agentManifestPath(rootDir), { force: true });
}

export function createAgentManifest(options: CreateAgentManifestOptions): AgentManifest {
  return normalizeAgentManifest({
    $schema: AGENT_MANIFEST_SCHEMA_URL,
    version: 1,
    kind: options.kind,
    ok: options.ok,
    generatedAt: new Date().toISOString(),
    rootDir: options.rootDir,
    primaryPath: options.primaryPath,
    commands: options.commands,
    validation: options.validation,
    files: collectManifestFiles(options.files, options.rootDir),
  });
}

export function readAgentManifestPath(path: string): AgentManifest {
  return normalizeAgentManifest(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

export function writeAgentManifestPath(
  path: string,
  options: CreateAgentManifestOptions,
): AgentManifest {
  const manifest = createAgentManifest(options);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}

export function normalizeAgentManifest(input: unknown): AgentManifest {
  try {
    const parsed = agentManifestSchema.parse(input);
    return {
      ...parsed,
      $schema: parsed.$schema ?? AGENT_MANIFEST_SCHEMA_URL,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`invalid agent manifest: ${formatZodIssues(error)}`);
    }
    throw error;
  }
}

export function validateAgentManifestFiles(manifest: AgentManifest, manifestPath?: string): void {
  validateManifestFiles({
    files: manifest.files,
    manifestPath,
    rootDir: manifest.rootDir,
    label: "agent",
  });
}

export function isAgentManifestLike(input: unknown): boolean {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as { version?: unknown }).version === 1 &&
    typeof (input as { kind?: unknown }).kind === "string" &&
    Array.isArray((input as { files?: unknown }).files) &&
    typeof (input as { commands?: unknown }).commands === "object"
  );
}
