import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

export type SpawnSyncLike = (args: {
  cmd: string[];
  stdout: "pipe";
  stderr: "pipe";
}) => {
  success: boolean;
  stdout: Uint8Array;
};

export function listTestFiles(options: { spawnSync?: SpawnSyncLike } = {}): string[] {
  const spawnSync = options.spawnSync ?? Bun.spawnSync;
  const rgFiles = tryListWithRipgrep(spawnSync);
  if (rgFiles) return rgFiles;

  return walk("tests")
    .filter((file) => file.endsWith(".test.ts"))
    .sort((a, b) => a.localeCompare(b));
}

function tryListWithRipgrep(spawnSync: SpawnSyncLike): string[] | null {
  let rg: ReturnType<SpawnSyncLike>;
  try {
    rg = spawnSync({
      cmd: ["rg", "--files", "tests", "-g", "*.test.ts"],
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch {
    return null;
  }

  if (!rg.success) return null;

  return new TextDecoder()
    .decode(rg.stdout)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      out.push(...walk(path));
      continue;
    }
    out.push(path);
  }
  return out;
}
