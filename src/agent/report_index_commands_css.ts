export function renderAgentReportCommandsCss(): string {
  return `      .commands {
        display: grid;
        gap: 10px;
      }
      .command {
        display: grid;
        gap: 5px;
      }
      .command span {
        color: var(--muted);
        font-size: 13px;
        font-weight: 700;
      }
      .artifact code,
      pre {
        font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
      }
      pre {
        overflow: auto;
        margin: 0;
        border-radius: 8px;
        background: oklch(20% 0.015 230);
        color: oklch(92% 0.012 230);
        padding: 14px;
        line-height: 1.5;
      }`;
}
