export function renderAgentReportSummaryCss(): string {
  return `      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
        gap: 12px;
        min-width: 0;
      }
      .metric {
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 14px;
        background: color-mix(in oklch, var(--panel) 82%, var(--bg));
        min-width: 0;
      }
      .metric strong {
        display: block;
        font-size: 24px;
        line-height: 1.1;
        overflow-wrap: anywhere;
      }
      .metric span {
        display: block;
        margin-top: 4px;
        color: var(--muted);
        font-size: 13px;
        overflow-wrap: anywhere;
      }`;
}
