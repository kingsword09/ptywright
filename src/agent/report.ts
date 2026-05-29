import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { ResolvedPtywrightConfig } from "../config";
import { writeArtifactViewerPages } from "./report_artifact_writer";
import { renderAgentReportHtml } from "./report_index";
import type { AgentRunResult } from "./runner";

export { renderAgentReportHtml } from "./report_index";

export async function writeAgentReport(
  path: string,
  result: AgentRunResult,
  options: { config?: ResolvedPtywrightConfig } = {},
): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  await writeArtifactViewerPages(result, options);
  writeFileSync(path, renderAgentReportHtml(result), "utf8");
}
