import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export function safeArtifactsDirName(relPath: string): string {
  return relPath.replace(/[/\\]/g, "__");
}

export function listScriptFiles(dir: string): string[] {
  const out: string[] = [];

  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      out.push(...listScriptFiles(abs));
      continue;
    }

    if (entry.endsWith(".json")) {
      if (shouldIncludeJsonScript(abs)) out.push(abs);
      continue;
    }

    if (!entry.endsWith(".ts")) continue;
    if (entry.endsWith(".d.ts")) continue;
    if (entry.endsWith("_steps.ts") || entry.endsWith(".steps.ts")) continue;

    out.push(abs);
  }

  return out.sort((a, b) => a.localeCompare(b));
}

function shouldIncludeJsonScript(filePath: string): boolean {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;

    const obj = parsed as { launch?: unknown; steps?: unknown };
    if (!obj.launch || typeof obj.launch !== "object" || Array.isArray(obj.launch)) return false;

    const launch = obj.launch as { command?: unknown };
    if (typeof launch.command !== "string" || !launch.command.trim()) return false;

    return Array.isArray(obj.steps) && obj.steps.length > 0;
  } catch {
    // If a .json file is invalid JSON, keep legacy behavior: let it fail as a script.
    return true;
  }
}
