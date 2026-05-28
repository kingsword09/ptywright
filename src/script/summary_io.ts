import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  normalizeScriptRunSummary,
  SCRIPT_RUN_SUMMARY_FILE_NAME,
  type ScriptRunSummary,
} from "./summary_schema";

export function readScriptRunSummaryPath(path: string): ScriptRunSummary {
  return normalizeScriptRunSummary(
    JSON.parse(readFileSync(resolveScriptRunSummaryPath(path), "utf8")) as unknown,
  );
}

export function writeScriptRunSummaryPath(path: string, summary: ScriptRunSummary): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(normalizeScriptRunSummary(summary), null, 2) + "\n", "utf8");
}

export function resolveScriptRunSummaryPath(path: string): string {
  const resolved = resolve(process.cwd(), path);
  const stats = statSync(resolved, { throwIfNoEntry: false });
  if (stats?.isDirectory()) {
    return join(resolved, SCRIPT_RUN_SUMMARY_FILE_NAME);
  }
  return resolved;
}
