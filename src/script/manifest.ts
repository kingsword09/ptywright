import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { z } from "zod";

import { collectManifestFiles, validateManifestFiles } from "../common/manifest_files";
import { samePath } from "../common/path";
import { formatZodIssues } from "../common/zod";
import { resolveManifestPrimaryPath, validateScriptManifestCommands } from "./manifest_commands";
import {
  SCRIPT_MANIFEST_FILE_NAME,
  SCRIPT_MANIFEST_SCHEMA_URL,
  scriptManifestSchema,
  type CreateScriptManifestOptions,
  type ScriptManifest,
} from "./manifest_types";
export {
  SCRIPT_MANIFEST_FILE_NAME,
  SCRIPT_MANIFEST_SCHEMA_URL,
  scriptManifestFileSchema,
  scriptManifestSchema,
  type CreateScriptManifestOptions,
  type ScriptManifest,
  type ScriptManifestFile,
  type ScriptManifestFileDraft,
  type ScriptManifestFileKind,
} from "./manifest_types";
export {
  relocateScriptManifestCommands,
  resolveManifestPrimaryPath,
  validateScriptManifestCommands,
} from "./manifest_commands";

export function scriptManifestPath(rootDir: string): string {
  return join(rootDir, SCRIPT_MANIFEST_FILE_NAME);
}

export function resolveScriptManifestPath(path: string): string {
  const resolved = resolve(process.cwd(), path);
  const stats = statSync(resolved, { throwIfNoEntry: false });
  if (stats?.isDirectory()) return scriptManifestPath(resolved);
  return resolved;
}

export function createScriptManifest(options: CreateScriptManifestOptions): ScriptManifest {
  return normalizeScriptManifest({
    $schema: SCRIPT_MANIFEST_SCHEMA_URL,
    version: 1,
    kind: "run-suite",
    ok: options.ok,
    generatedAt: new Date().toISOString(),
    rootDir: options.rootDir,
    primaryPath: options.primaryPath,
    commands: options.commands,
    totalCount: options.totalCount,
    failureCount: options.failureCount,
    files: collectManifestFiles(options.files, options.rootDir),
  });
}

export function writeScriptManifestPath(
  path: string,
  options: CreateScriptManifestOptions,
): ScriptManifest {
  const manifest = createScriptManifest(options);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return manifest;
}

export function readScriptManifestPath(path: string): ScriptManifest {
  return normalizeScriptManifest(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

export function normalizeScriptManifest(input: unknown): ScriptManifest {
  try {
    const parsed = scriptManifestSchema.parse(input);
    return {
      ...parsed,
      $schema: parsed.$schema ?? SCRIPT_MANIFEST_SCHEMA_URL,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`invalid script manifest: ${formatZodIssues(error)}`);
    }
    throw error;
  }
}

export function validateScriptManifest(manifest: ScriptManifest, manifestPath?: string): void {
  validateScriptManifestFiles(manifest, manifestPath);
  validateScriptManifestCommands(manifest, manifestPath);
}

export function validateScriptManifestFiles(manifest: ScriptManifest, manifestPath?: string): void {
  validateManifestFiles({
    files: manifest.files,
    manifestPath,
    rootDir: manifest.rootDir,
    label: "script",
  });
}

export function findScriptSummaryManifest(summaryPath: string): {
  manifest: ScriptManifest;
  manifestPath: string;
} | null {
  const resolvedSummaryPath = resolve(process.cwd(), summaryPath);
  const manifestPath = scriptManifestPath(dirname(resolvedSummaryPath));
  if (!existsSync(manifestPath)) return null;

  let manifest: ScriptManifest;
  try {
    manifest = readScriptManifestPath(manifestPath);
  } catch {
    return null;
  }

  if (samePath(resolveManifestPrimaryPath(manifest, manifestPath), resolvedSummaryPath)) {
    return { manifest, manifestPath };
  }

  return null;
}
