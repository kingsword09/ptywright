export function renderAgentReportBaseCss(): string {
  return `      :root {
        color-scheme: light;
        --bg: oklch(97.5% 0.008 210);
        --ink: oklch(19% 0.018 230);
        --muted: oklch(48% 0.02 230);
        --line: oklch(86% 0.018 230);
        --panel: oklch(99% 0.006 210);
        --good: oklch(55% 0.15 155);
        --bad: oklch(58% 0.19 25);
        --focus: oklch(55% 0.14 235);
        font-family:
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
      }
      main {
        display: grid;
        gap: 24px;
        width: min(1180px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }
      header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 20px;
        align-items: start;
        border-bottom: 1px solid var(--line);
        padding-bottom: 24px;
      }
      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.15;
        letter-spacing: 0;
      }
      h2 {
        margin: 0;
        font-size: 18px;
        line-height: 1.25;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
      }
      .pill,
      .status {
        display: inline-flex;
        min-height: 32px;
        align-items: center;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 0 12px;
        color: var(--muted);
        font-size: 13px;
      }
      .status {
        font-weight: 700;
      }
      .status.pass {
        border-color: color-mix(in oklch, var(--good) 42%, var(--line));
        color: var(--good);
      }
      .status.fail {
        border-color: color-mix(in oklch, var(--bad) 44%, var(--line));
        color: var(--bad);
      }
      .panel {
        display: grid;
        gap: 16px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        padding: 18px;
      }
      @media (max-width: 720px) {
        main {
          width: min(100vw - 20px, 1180px);
          padding-top: 18px;
        }
        header {
          grid-template-columns: 1fr;
        }
        .status {
          justify-self: start;
        }
      }`;
}
