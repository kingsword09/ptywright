import { readdirSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { samePath } from "../common/path";
import { AGENT_MANIFEST_FILE_NAME, readAgentManifestPath } from "./manifest";

export function listAgentReplayFiles(
  dir: string,
  options: { artifactsRoot?: string } = {},
): string[] {
  const resolvedDir = resolve(process.cwd(), dir);
  const suiteDir = options.artifactsRoot?.trim()
    ? resolve(process.cwd(), options.artifactsRoot)
    : null;

  return collectReplayFiles(resolvedDir, {
    skipGeneratedOutputDirs: suiteDir ? isSubpath(resolvedDir, suiteDir) : false,
  });
}

export function safeArtifactsDirName(relPath: string): string {
  return relPath.replace(/[/\\]/g, "__");
}

function collectReplayFiles(
  dir: string,
  options: { skipGeneratedOutputDirs?: boolean } = {},
): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir);
  const hasRunRecord = entries.some((entry) => entry.endsWith(".agent-run.json"));

  for (const entry of entries) {
    const abs = join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      if (entry === "replay") continue;
      if (options.skipGeneratedOutputDirs && isGeneratedReplayOutputDir(abs)) continue;
      out.push(...collectReplayFiles(abs, options));
      continue;
    }

    if (hasRunRecord && entry.endsWith(".cassette.json")) {
      continue;
    }

    if (entry.endsWith(".cassette.json") || entry.endsWith(".agent-run.json")) {
      out.push(abs);
    }
  }

  return out.sort((a, b) => a.localeCompare(b));
}

function isGeneratedReplayOutputDir(dir: string): boolean {
  const manifestPath = join(dir, AGENT_MANIFEST_FILE_NAME);
  try {
    const manifest = readAgentManifestPath(manifestPath);
    if (samePath(manifest.rootDir, dir)) {
      return true;
    }
  } catch {
    // Fall back to legacy run-record detection below.
  }

  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".agent-run.json")) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(dir, entry), "utf8")) as {
        artifactsDir?: unknown;
      };
      if (typeof parsed.artifactsDir === "string" && samePath(parsed.artifactsDir, dir)) {
        return true;
      }
    } catch {
      // Invalid records should still be discovered and reported by replayRecordEntry.
    }
  }
  return false;
}

function isSubpath(path: string, maybeParent: string): boolean {
  const child = resolve(process.cwd(), path);
  const parent = resolve(process.cwd(), maybeParent);
  const rel = relative(parent, child);
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}
