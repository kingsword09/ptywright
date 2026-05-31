// Shared design system for ptywright browser-agent reports.
//
// One source of design tokens + primitive components, consumed by the
// replay-all overview, the per-entry report, the failed-entry page, and the
// artifact viewer toolbar. The palette is an adaptive neutral slate that
// follows `prefers-color-scheme` (and honours an explicit `[data-theme]` when a
// page sets one, e.g. the viewer shell) so the chrome frames aitty's own
// light/dark UI previews instead of fighting them. The signature accent is an
// electric azure that nods to terminal phosphor / asciinema.

const TOKENS_LIGHT = `
    --canvas: #f5f7fa;
    --panel: #ffffff;
    --raised: #fbfcfe;
    --line: #e4e8ee;
    --line-strong: #ccd3dd;
    --ink: #131822;
    --muted: #5a6473;
    --faint: #8b95a3;
    --accent: #0a7fd4;
    --accent-ink: #ffffff;
    --accent-soft: rgba(10, 127, 212, 0.12);
    --pass: #18794e;
    --pass-soft: rgba(24, 121, 78, 0.12);
    --fail: #d12d4f;
    --fail-soft: rgba(209, 45, 79, 0.1);
    --changed: #ad6800;
    --changed-soft: rgba(173, 104, 0, 0.12);
    --shadow: 0 1px 2px rgba(15, 23, 42, 0.06), 0 8px 24px -16px rgba(15, 23, 42, 0.24);`;

const TOKENS_DARK = `
    --canvas: #0a0e16;
    --panel: #111824;
    --raised: #18212f;
    --line: rgba(148, 163, 184, 0.16);
    --line-strong: rgba(148, 163, 184, 0.3);
    --ink: #e7edf6;
    --muted: #9aa7b8;
    --faint: #687486;
    --accent: #58b6ff;
    --accent-ink: #04101d;
    --accent-soft: rgba(88, 182, 255, 0.16);
    --pass: #46cd7c;
    --pass-soft: rgba(70, 205, 124, 0.16);
    --fail: #ff6b81;
    --fail-soft: rgba(255, 107, 129, 0.16);
    --changed: #f5b440;
    --changed-soft: rgba(245, 180, 64, 0.16);
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 18px 48px -22px rgba(0, 0, 0, 0.7);`;

/** Design tokens only (no component rules); reusable when a page needs just the palette. */
export function renderReportThemeTokens(): string {
  return `    :root {
    color-scheme: light dark;${TOKENS_LIGHT}
    --radius: 14px;
    --radius-sm: 9px;
    --radius-xs: 6px;
    --font-sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --font-mono: ui-monospace, "SFMono-Regular", "JetBrains Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
    }
    @media (prefers-color-scheme: dark) {
    :root {${TOKENS_DARK}
    }
    }
    :root[data-theme="light"] {${TOKENS_LIGHT}
    }
    :root[data-theme="dark"] {${TOKENS_DARK}
    }`;
}

/** Full shared sheet: tokens + reset + primitive components. */
export function renderReportThemeCss(): string {
  return `${renderReportThemeTokens()}

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--canvas);
      color: var(--ink);
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }

    /* Top status rail — a thin build-status bar coloured by the overall result. */
    .rail {
      position: sticky;
      top: 0;
      z-index: 30;
      height: 3px;
      background: var(--line-strong);
    }
    .rail.pass { background: linear-gradient(90deg, var(--pass), color-mix(in oklab, var(--pass) 55%, var(--accent))); }
    .rail.fail { background: linear-gradient(90deg, var(--fail), color-mix(in oklab, var(--fail) 60%, var(--changed))); }

    .shell {
      width: min(1140px, 100% - 40px);
      margin-inline: auto;
      padding: 30px 0 64px;
    }
    @media (max-width: 640px) {
      .shell { width: min(100% - 24px, 1140px); padding-top: 18px; }
    }

    h1 { margin: 0; font-size: 25px; line-height: 1.15; letter-spacing: -0.02em; font-weight: 680; }
    h2 { margin: 0; font-size: 14px; font-weight: 640; letter-spacing: 0.01em; color: var(--ink); }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    code, pre, .mono { font-family: var(--font-mono); }

    /* Status line: a coloured dot + bold label (replaces fat pills). */
    .statusline { display: inline-flex; align-items: center; gap: 8px; font-weight: 660; font-size: 13px; letter-spacing: 0.04em; }
    .statusline .dot { width: 9px; height: 9px; border-radius: 50%; background: var(--muted); box-shadow: 0 0 0 4px color-mix(in oklab, var(--muted) 22%, transparent); }
    .statusline.pass { color: var(--pass); }
    .statusline.pass .dot { background: var(--pass); box-shadow: 0 0 0 4px var(--pass-soft); }
    .statusline.fail { color: var(--fail); }
    .statusline.fail .dot { background: var(--fail); box-shadow: 0 0 0 4px var(--fail-soft); }

    /* Tiny inline status dot for dense rows. */
    .dot-sm { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); flex: none; }
    .dot-sm.pass { background: var(--pass); }
    .dot-sm.fail { background: var(--fail); }

    /* Chips: low-key metadata tags. */
    .chip {
      display: inline-flex; align-items: center; gap: 6px; min-height: 26px;
      padding: 0 10px; border: 1px solid var(--line); border-radius: 999px;
      background: var(--panel); color: var(--muted); font-size: 12px; white-space: nowrap;
    }
    .chip.mono { font-family: var(--font-mono); }
    .chip-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }

    /* Stat strip: compact metrics with tabular numerals + hairline dividers. */
    .statstrip {
      display: grid; grid-auto-flow: column; grid-auto-columns: 1fr;
      border: 1px solid var(--line); border-radius: var(--radius-sm); overflow: hidden; background: var(--panel);
    }
    .statstrip .stat { padding: 12px 16px; border-left: 1px solid var(--line); }
    .statstrip .stat:first-child { border-left: 0; }
    .stat .num { display: block; font-size: 21px; font-weight: 680; line-height: 1.1; font-variant-numeric: tabular-nums; letter-spacing: -0.01em; }
    .stat .lbl { display: block; margin-top: 3px; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
    .stat.pass .num { color: var(--pass); }
    .stat.fail .num { color: var(--fail); }
    @media (max-width: 560px) {
      .statstrip { grid-auto-flow: row; grid-auto-columns: auto; }
      .statstrip .stat { border-left: 0; border-top: 1px solid var(--line); }
      .statstrip .stat:first-child { border-top: 0; }
    }

    /* Pass-rate meter: a segmented progress bar. */
    .meter { height: 8px; border-radius: 999px; background: var(--line); overflow: hidden; }
    .meter > i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, var(--pass), color-mix(in oklab, var(--pass) 60%, var(--accent))); }
    .meter.has-fail > i { background: linear-gradient(90deg, var(--fail), var(--changed)); }

    /* Panel: the standard surface card. */
    .panel { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel); padding: 18px; box-shadow: var(--shadow); }
    .panel + .panel { margin-top: 16px; }
    .panel > h2 { margin-bottom: 14px; }

    /* Path display: muted parent dir (middle-ellipsis) + bright basename. */
    .path { display: inline-flex; max-width: 100%; min-width: 0; align-items: baseline; font-family: var(--font-mono); font-size: 12.5px; }
    .path .dir { min-width: 0; color: var(--faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; }
    .path .base { color: var(--muted); font-weight: 600; flex: none; }

    /* Code block with one-click copy. */
    .codeblock { position: relative; border: 1px solid var(--line); border-radius: var(--radius-sm); background: color-mix(in oklab, var(--canvas) 55%, var(--panel)); }
    .codeblock > .lbl { display: block; padding: 8px 12px 0; color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 640; }
    .codeblock > pre { margin: 0; padding: 8px 44px 12px 12px; overflow-x: auto; font-size: 12.5px; line-height: 1.55; color: var(--ink); white-space: pre-wrap; word-break: break-word; }
    .copybtn {
      position: absolute; top: 8px; right: 8px; width: 28px; height: 28px;
      display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid var(--line); border-radius: var(--radius-xs); background: var(--panel);
      color: var(--muted); cursor: pointer; font-size: 13px; line-height: 1; transition: all 0.12s ease;
    }
    .copybtn:hover { color: var(--ink); border-color: var(--line-strong); }
    .copybtn.copied { color: var(--pass); border-color: color-mix(in oklab, var(--pass) 45%, var(--line)); }

    /* Action links / buttons. */
    .btn {
      display: inline-flex; align-items: center; gap: 5px; min-height: 28px; padding: 0 11px;
      border: 1px solid var(--line); border-radius: var(--radius-xs); background: var(--panel);
      color: var(--ink); font-size: 12.5px; font-weight: 560; cursor: pointer; transition: all 0.12s ease;
    }
    .btn:hover { border-color: var(--accent); color: var(--accent); text-decoration: none; }
    .btn.primary { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
    .btn.primary:hover { color: var(--accent-ink); filter: brightness(1.05); }

    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }`;
}
