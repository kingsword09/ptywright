import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { z } from "zod";

import { readScriptRunSummaryPath, type ScriptRunSummaryCommands } from "./summary";

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

export type ScriptManifestFileDraft = {
  path?: string | null;
  kind: ScriptManifestFileKind;
  role?: string;
  ok?: boolean;
};

export type CreateScriptManifestOptions = {
  ok: boolean;
  rootDir: string;
  primaryPath: string;
  commands: ScriptRunSummaryCommands;
  totalCount: number;
  failureCount: number;
  files: ScriptManifestFileDraft[];
};

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
  const failures: string[] = [];
  const baseDir = manifestPath
    ? dirname(resolve(process.cwd(), manifestPath))
    : resolve(process.cwd(), manifest.rootDir);

  for (const file of manifest.files) {
    let current: ScriptManifestFile | null = null;
    try {
      current = readManifestFile(file, baseDir);
    } catch (error) {
      failures.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    if (current.bytes !== file.bytes) {
      failures.push(`${file.path}: bytes ${current.bytes} !== ${file.bytes}`);
    }
    if (current.sha256 !== file.sha256) {
      failures.push(`${file.path}: sha256 ${current.sha256} !== ${file.sha256}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`invalid script manifest files: ${failures.join("; ")}`);
  }
}

export function validateScriptManifestCommands(
  manifest: ScriptManifest,
  manifestPath?: string,
): void {
  const failures: string[] = [];
  const summaryPath = resolveManifestPrimaryPath(manifest, manifestPath);

  try {
    const summary = readScriptRunSummaryPath(summaryPath);
    compareCommandMaps(manifest.commands, summary.commands, failures);
  } catch (error) {
    failures.push(
      `unable to read manifest primary summary ${summaryPath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (failures.length > 0) {
    throw new Error(`invalid script manifest commands: ${failures.join("; ")}`);
  }
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

export function relocateScriptManifestCommands(
  manifest: ScriptManifest,
  manifestPath: string,
): ScriptRunSummaryCommands {
  return Object.fromEntries(
    Object.entries(manifest.commands).map(([name, command]) => [
      name,
      {
        argv: relocateScriptCommandArgv(
          command.argv,
          dirname(resolve(process.cwd(), manifestPath)),
        ),
      },
    ]),
  ) as ScriptRunSummaryCommands;
}

export function resolveManifestPrimaryPath(
  manifest: ScriptManifest,
  manifestPath?: string,
): string {
  const baseDir = manifestPath
    ? dirname(resolve(process.cwd(), manifestPath))
    : resolve(process.cwd(), manifest.rootDir);
  const primaryFile =
    manifest.files.find((file) => file.kind === "run-summary" && file.role === "summary") ??
    manifest.files.find((file) => file.kind === "run-summary");

  if (primaryFile) {
    return isAbsolute(primaryFile.path) ? primaryFile.path : join(baseDir, primaryFile.path);
  }

  return isAbsolute(manifest.primaryPath)
    ? manifest.primaryPath
    : resolve(process.cwd(), manifest.primaryPath);
}

function collectManifestFiles(
  files: readonly ScriptManifestFileDraft[],
  rootDir: string,
): ScriptManifestFile[] {
  const out: ScriptManifestFile[] = [];
  const seen = new Set<string>();
  const rootAbs = resolve(process.cwd(), rootDir);

  for (const file of files) {
    if (!file.path || seen.has(file.path)) continue;
    seen.add(file.path);

    try {
      out.push(readManifestFile(file, rootAbs, { portableRoot: true }));
    } catch {
      // Failed scripts may not produce every optional trace artifact.
    }
  }

  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function readManifestFile(
  file: ScriptManifestFileDraft,
  baseDir: string,
  options: { portableRoot?: boolean } = {},
): ScriptManifestFile {
  if (!file.path) throw new Error("missing file path");

  const absPath = isAbsolute(file.path)
    ? file.path
    : resolve(options.portableRoot ? process.cwd() : baseDir, file.path);
  const stat = statSync(absPath);
  if (!stat.isFile()) throw new Error("not a file");

  const bytes = readFileSync(absPath);
  return {
    path: options.portableRoot ? portableManifestPath(absPath, baseDir) : file.path,
    kind: file.kind,
    role: file.role,
    ok: file.ok,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function relocateScriptCommandArgv(argv: readonly string[], rootDir: string): string[] {
  if (argv[0] !== "ptywright" || argv[1] !== "run-all") return [...argv];
  return setArgvFlag([...argv], "--artifacts-root", portableCliPath(rootDir));
}

function setArgvFlag(argv: string[], flag: string, value: string): string[] {
  const index = argv.indexOf(flag);
  if (index >= 0) {
    return [...argv.slice(0, index + 1), value, ...argv.slice(index + 2)];
  }
  return [...argv, flag, value];
}

function compareCommandMaps(
  actual: Record<string, { argv: string[] }>,
  expected: Record<string, { argv: string[] }>,
  failures: string[],
): void {
  const actualNames = Object.keys(actual).sort();
  const expectedNames = Object.keys(expected).sort();
  if (!sameStringList(actualNames, expectedNames)) {
    failures.push(
      `manifest command names must match primary summary commands: ${expectedNames.join(",")}`,
    );
  }

  for (const [name, command] of Object.entries(expected)) {
    const actualCommand = actual[name];
    if (!actualCommand) continue;
    if (!sameArgv(actualCommand.argv, command.argv)) {
      failures.push(`command ${name} argv must match primary summary`);
    }
  }
}

function portableManifestPath(absPath: string, rootAbs: string): string {
  const rel = relative(rootAbs, absPath);
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel;
  return absPath;
}

function portableCliPath(path: string): string {
  const abs = resolve(process.cwd(), path);
  const rel = relative(process.cwd(), abs);
  if (rel && !rel.startsWith("..") && !isAbsolute(rel)) return rel;
  return abs;
}

function sameArgv(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function samePath(left: string, right: string): boolean {
  return resolve(process.cwd(), left) === resolve(process.cwd(), right);
}

function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "<root>";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
