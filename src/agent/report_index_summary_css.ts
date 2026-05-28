export function renderAgentReportSummaryCss(): string {
  return `      .summary {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
      }
      .metric {
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 14px;
        background: color-mix(in oklch, var(--panel) 82%, var(--bg));
      }
      .metric strong {
        display: block;
        font-size: 24px;
        line-height: 1.1;
      }
      .metric span {
        display: block;
        margin-top: 4px;
        color: var(--muted);
        font-size: 13px;
      }`;
}
