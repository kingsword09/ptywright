export function renderArtifactViewerShellCss(): string {
  return `      :root {
        color-scheme: dark;
        --bg: #080d16;
        --panel: #0c111d;
        --line: rgba(148, 163, 184, 0.26);
        --ink: #e6edf7;
        --muted: #91a0b8;
        --focus: #79c0ff;
        font-family:
          ui-sans-serif,
          system-ui,
          -apple-system,
          BlinkMacSystemFont,
          "Segoe UI",
          sans-serif;
      }
      * {
        box-sizing: border-box;
      }
      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background: var(--bg);
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
        background: color-mix(in srgb, var(--panel) 88%, black);
        padding: 10px 12px;
      }
      .viewer-title {
        min-width: min(100%, 220px);
        margin-right: auto;
        overflow-wrap: anywhere;
        font-size: 14px;
        font-weight: 700;
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
      }
      .viewer-link {
        color: var(--focus);
        font-weight: 700;
      }
      .viewer-stage {
        display: grid;
        grid-template-columns: max-content;
        grid-template-rows: max-content;
        min-width: 0;
        min-height: 0;
        justify-content: start;
        align-content: start;
        overflow: auto;
        background:
          radial-gradient(circle at top left, rgba(121, 192, 255, 0.1), transparent 32%),
          #060a13;
        padding: 14px;
      }
      .viewer-viewport {
        width: var(--config-viewport-width);
        height: var(--config-viewport-height);
        max-width: none;
        max-height: none;
        overflow: auto;
        overscroll-behavior: contain;
        border: 0;
        border-radius: 8px;
        background: #0c111d;
        outline: 1px solid var(--line);
        box-shadow: 0 18px 52px rgba(0, 0, 0, 0.34);
      }
      .viewer-viewport[data-mobile="true"] {
        width: var(--config-viewport-width);
      }
      .dom-viewport {
        overflow: hidden;
      }
      .dom-viewer-frame {
        display: block;
        width: 100%;
        height: 100%;
        border: 0;
        background: #0c111d;
      }
      .viewer-page[data-theme="light"] {
        --bg: #f8fafc;
        --panel: #ffffff;
        --line: rgba(15, 23, 42, 0.14);
        --ink: #0f172a;
        --muted: #64748b;
        --focus: #1e66f5;
      }
      .viewer-page[data-theme="light"] .viewer-stage {
        background: #f8fafc;
      }
      .viewer-page[data-theme="light"] .viewer-viewport,
      .viewer-page[data-theme="light"] .dom-viewer-frame {
        background: #ffffff;
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
          width: var(--config-viewport-width);
          height: var(--config-viewport-height);
          border-radius: 0;
        }
      }`;
}
