import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { normalizeAgentCheckJsonSummary, type AgentCheckJsonSummary } from "./check_summary_schema";

export function readAgentCheckSummaryPath(path: string): AgentCheckJsonSummary {
  return normalizeAgentCheckJsonSummary(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

export function writeAgentCheckSummaryPath(path: string, summary: AgentCheckJsonSummary): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(normalizeAgentCheckJsonSummary(summary), null, 2) + "\n",
    "utf8",
  );
}
