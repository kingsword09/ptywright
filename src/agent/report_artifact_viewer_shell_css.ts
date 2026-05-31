import { renderReportThemeCss } from "./report_theme_css";

export function renderArtifactViewerShellCss(): string {
  return `${renderReportThemeCss()}

      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: var(--canvas);
        color: var(--ink);
      }
      .viewer-page {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        width: 100%;
        height: 100dvh;
        min-width: 0;
        min-height: 0;
      }
      .viewer-toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        min-width: 0;
        border-bottom: 1px solid var(--line);
        background: var(--raised);
        padding: 10px 12px;
      }
      .viewer-title {
        min-width: min(100%, 220px);
        margin-right: auto;
        overflow-wrap: anywhere;
        font-size: 14px;
        font-weight: 640;
        color: var(--ink);
      }
      .viewer-link,
      .viewer-pill {
        display: inline-flex;
        min-height: 30px;
        align-items: center;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 0 10px;
        color: var(--muted);
        font-size: 12px;
        text-decoration: none;
        transition: all 0.12s ease;
      }
      .viewer-link {
        color: var(--accent);
        font-weight: 640;
      }
      .viewer-link:hover {
        border-color: var(--accent);
        background: var(--accent-soft);
      }
      .viewer-stage {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: minmax(0, 1fr);
        min-width: 0;
        min-height: 0;
        justify-items: center;
        align-content: start;
        overflow: hidden;
        background: var(--canvas);
        padding: 14px;
      }
      .viewer-viewport {
        width: min(var(--config-viewport-width), 100%);
        height: min(var(--config-viewport-height), 100%);
        max-width: 100%;
        max-height: 100%;
        overflow: auto;
        overscroll-behavior: contain;
        border: 0;
        border-radius: var(--radius-sm);
        background: var(--panel);
        outline: 1px solid var(--line);
        box-shadow: var(--shadow);
      }
      .viewer-viewport[data-mobile="true"] {
        width: min(var(--config-viewport-width), 100%);
      }
      .dom-viewport {
        overflow: hidden;
      }
      .dom-viewer-frame {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
        background: var(--panel);
      }
      @media (max-width: 720px) {
        .viewer-toolbar {
          padding: 8px;
        }
        .viewer-title {
          flex-basis: 100%;
          order: -1;
        }
        .viewer-stage {
          padding: 0;
        }
        .viewer-viewport {
          width: min(var(--config-viewport-width), 100%);
          height: min(var(--config-viewport-height), 100%);
          border-radius: 0;
        }
      }`;
}
