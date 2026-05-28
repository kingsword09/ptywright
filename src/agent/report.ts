import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { writeArtifactViewerPages } from "./report_artifact_writer";
import { renderAgentReportHtml } from "./report_index";
import type { AgentRunResult } from "./runner";

export { renderAgentReportHtml } from "./report_index";

export function writeAgentReport(path: string, result: AgentRunResult): void {
  mkdirSync(dirname(path), { recursive: true });
  writeArtifactViewerPages(result);
  writeFileSync(path, renderAgentReportHtml(result), "utf8");
}
