import { renderAgentReportArtifactsCss } from "./report_index_artifacts_css";
import { renderAgentReportBaseCss } from "./report_index_base_css";
import { renderAgentReportCommandsCss } from "./report_index_commands_css";
import { renderAgentReportSummaryCss } from "./report_index_summary_css";

export function renderAgentReportCss(): string {
  return [
    renderAgentReportBaseCss(),
    renderAgentReportSummaryCss(),
    renderAgentReportArtifactsCss(),
    renderAgentReportCommandsCss(),
  ].join("\n");
}
