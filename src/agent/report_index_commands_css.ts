export function renderAgentReportCommandsCss(): string {
  return `      .commands {
        display: grid;
        gap: 10px;
        min-width: 0;
      }
      .command {
        display: grid;
        gap: 5px;
        min-width: 0;
      }
      .command span {
        color: var(--muted);
        font-size: 13px;
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      .artifact code,
      pre {
        font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
      }
      pre {
        overflow-x: auto;
        overflow-y: hidden;
        max-width: 100%;
        min-width: 0;
        width: 100%;
        margin: 0;
        border-radius: 8px;
        background: oklch(20% 0.015 230);
        color: oklch(92% 0.012 230);
        padding: 14px;
        line-height: 1.5;
        white-space: pre;
        word-wrap: normal;
        word-break: normal;
      }`;
}
