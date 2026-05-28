import { escapeHtml } from "./html_escape";
import { formatAgentArgv } from "./run_record";

export function renderAgentReportCommandBlock(label: string, argv: readonly string[]): string {
  return `<div class="command">
    <span>${escapeHtml(label)}</span>
    <pre>${escapeHtml(formatAgentArgv(argv))}</pre>
  </div>`;
}
