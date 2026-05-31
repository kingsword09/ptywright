import { renderReportThemeCss } from "./report_theme_css";

export function renderAgentReportBaseCss(): string {
  return `${renderReportThemeCss()}

      main {
        display: grid;
        gap: 24px;
        width: min(1180px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
        min-width: 0;
      }
      main > * {
        min-width: 0;
      }
      header {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 20px;
        align-items: start;
        border-bottom: 1px solid var(--line);
        padding-bottom: 24px;
        min-width: 0;
      }
      header > * {
        min-width: 0;
      }
      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.15;
        letter-spacing: 0;
        max-width: 100%;
        overflow-wrap: anywhere;
      }
      h2 {
        margin: 0;
        font-size: 18px;
        line-height: 1.25;
        overflow-wrap: anywhere;
      }
      h3 {
        margin: 0;
        font-size: 16px;
        line-height: 1.3;
        overflow-wrap: anywhere;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
        min-width: 0;
      }
      .pill,
      .status {
        display: inline-flex;
        max-width: 100%;
        min-width: 0;
        min-height: 32px;
        align-items: center;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 0 12px;
        color: var(--muted);
        font-size: 13px;
        overflow-wrap: anywhere;
      }
      .status {
        font-weight: 700;
      }
      .status.pass {
        border-color: var(--pass);
        background: var(--pass-soft);
        color: var(--pass);
      }
      .status.fail {
        border-color: var(--fail);
        background: var(--fail-soft);
        color: var(--fail);
      }
      .panel {
        display: grid;
        gap: 16px;
        border: 1px solid var(--line);
        border-radius: var(--radius);
        background: var(--panel);
        padding: 18px;
        min-width: 0;
        box-shadow: var(--shadow);
      }
      .panel > * {
        min-width: 0;
      }
      .panel p {
        margin: 0;
        max-width: 100%;
        overflow-wrap: break-word;
        word-break: break-word;
      }
      code {
        font-family: var(--font-mono);
        overflow-wrap: break-word;
        word-break: break-all;
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
