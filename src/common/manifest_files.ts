import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import { portablePath } from "./path";

export type ManifestFileDraft<TKind extends string> = {
  path?: string | null;
  kind: TKind;
  role?: string;
  ok?: boolean;
};

export type ManifestFile<TKind extends string> = {
  path: string;
  kind: TKind;
  role?: string;
  ok?: boolean;
  bytes: number;
  sha256: string;
};

export function collectManifestFiles<TKind extends string>(
  files: readonly ManifestFileDraft<TKind>[],
  rootDir: string,
): ManifestFile<TKind>[] {
  const out: ManifestFile<TKind>[] = [];
  const seen = new Set<string>();
  const rootAbs = resolve(process.cwd(), rootDir);

  for (const file of files) {
    if (!file.path || seen.has(file.path)) continue;
    seen.add(file.path);

    try {
      out.push(readManifestFile(file, rootAbs, { portableRoot: true }));
    } catch {
      // Manifests index produced files only; optional failure artifacts and
      // missing baselines can legitimately be absent.
    }
  }

  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function validateManifestFiles<TKind extends string>(args: {
  files: readonly ManifestFile<TKind>[];
  manifestPath?: string;
  rootDir: string;
  label: string;
}): void {
  const failures: string[] = [];
  const baseDir = args.manifestPath
    ? dirname(resolve(process.cwd(), args.manifestPath))
    : resolve(process.cwd(), args.rootDir);

  for (const file of args.files) {
    let current: ManifestFile<TKind> | null = null;
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
    throw new Error(`invalid ${args.label} manifest files: ${failures.join("; ")}`);
  }
}

function readManifestFile<TKind extends string>(
  file: ManifestFileDraft<TKind>,
  baseDir: string,
  options: { portableRoot?: boolean } = {},
): ManifestFile<TKind> {
  if (!file.path) {
    throw new Error("missing file path");
  }

  const absPath = isAbsolute(file.path)
    ? file.path
    : resolve(options.portableRoot ? process.cwd() : baseDir, file.path);
  const stat = statSync(absPath);
  if (!stat.isFile()) {
    throw new Error("not a file");
  }

  const bytes = readFileSync(absPath);
  return {
    path: options.portableRoot ? portablePath(absPath, baseDir) : file.path,
    kind: file.kind,
    role: file.role,
    ok: file.ok,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
