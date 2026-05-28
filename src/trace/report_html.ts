import { coerceDisplayString, escapeHtml, jsonForHtml } from "../common/html";
import type { SnapshotScope } from "../terminal/snapshot";
import type { TraceReportArtifacts, TraceReportFrame, TraceReportResult } from "./report_types";

export function renderTraceReportHtml(input: {
  cast: string;
  header: Record<string, unknown>;
  term: { cols: number; rows: number; type: string };
  scope: SnapshotScope;
  scriptName: string;
  result?: TraceReportResult;
  artifacts?: TraceReportArtifacts;
  frames: TraceReportFrame[];
  eventCount: number;
}): string {
  const title =
    input.scriptName || coerceDisplayString(input.header.title) || "ptywright trace report";
  const command = coerceDisplayString(input.header.command);
  const timestamp = input.header.timestamp;

  const headerJson = JSON.stringify(input.header, null, 2);

  const durationSeconds = input.frames.at(-1)?.atSeconds ?? 0;
  const markFrames = input.frames.filter((f) => f.kind === "mark");

  const resultLabel =
    input.result?.ok === true ? "PASS" : input.result?.ok === false ? "FAIL" : "UNKNOWN";
  const resultClass =
    input.result?.ok === true ? "pass" : input.result?.ok === false ? "fail" : "unknown";

  const artifactsRows: { label: string; href: string }[] = [];
  if (input.artifacts?.castHref?.trim()) {
    artifactsRows.push({ label: "cast", href: input.artifacts.castHref.trim() });
  }
  if (input.artifacts?.failureErrorHref?.trim()) {
    artifactsRows.push({
      label: "failure.error.txt",
      href: input.artifacts.failureErrorHref.trim(),
    });
  }
  if (input.artifacts?.failureStepHref?.trim()) {
    artifactsRows.push({
      label: "failure.step.json",
      href: input.artifacts.failureStepHref.trim(),
    });
  }
  if (input.artifacts?.failureLastTextHref?.trim()) {
    artifactsRows.push({
      label: "failure.last.txt",
      href: input.artifacts.failureLastTextHref.trim(),
    });
  }
  if (input.artifacts?.failureLastViewHref?.trim()) {
    artifactsRows.push({
      label: "failure.last.view.txt",
      href: input.artifacts.failureLastViewHref.trim(),
    });
  }

  const artifactsHtml =
    artifactsRows.length === 0
      ? `<p class="muted">No artifacts linked.</p>`
      : `<ul class="artifacts">
${artifactsRows
  .map(
    (a) =>
      `<li><a href="${escapeHtml(a.href)}">${escapeHtml(a.label)}</a><span class="muted"> (${escapeHtml(a.href)})</span></li>`,
  )
  .join("\n")}
</ul>`;

  const castPlayerHtml = `
        <p class="muted">Render the full recording using <span class="mono">asciinema-player</span>.</p>
        <div class="cast-controls">
          <button id="castToggleSize" class="badge chip" type="button">expand</button>
          <span id="castPlayerStatus" class="muted mono"></span>
        </div>
        <div id="castPlayer" class="cast-player"></div>
        <script id="castData" type="application/json">${jsonForHtml(input.cast)}</script>
        <script>
          (function () {
            const statusEl = document.getElementById("castPlayerStatus");
            const container = document.getElementById("castPlayer");
            const castEl = document.getElementById("castData");
            const toggleBtn = document.getElementById("castToggleSize");
            if (!container || !castEl) return;

            // Load external assets automatically (no extra click).
            const VERSION = "3.9.0";
            const LOCAL_CSS = "./asciinema-player.css";
            const LOCAL_JS = "./asciinema-player.min.js";
            // Use multiple CDNs to avoid regional blocks (e.g. jsdelivr).
            const CDN_BASES = [
              "https://cdn.jsdelivr.net/npm/asciinema-player@" + VERSION + "/dist/bundle/",
              "https://unpkg.com/asciinema-player@" + VERSION + "/dist/bundle/",
            ];
            const CSS_URLS = [LOCAL_CSS, ...CDN_BASES.map((b) => b + "asciinema-player.css")];
            const JS_URLS = [LOCAL_JS, ...CDN_BASES.map((b) => b + "asciinema-player.min.js")];

            function setStatus(text) {
              if (statusEl) statusEl.textContent = text ? " " + text : "";
            }

            async function loadCssOnce() {
              if (document.getElementById("asciinemaPlayerCss")) return;

              for (const href of CSS_URLS) {
                try {
                  await new Promise((resolve, reject) => {
                    const link = document.createElement("link");
                    link.id = "asciinemaPlayerCss";
                    link.rel = "stylesheet";
                    link.href = href;
                    link.onload = resolve;
                    link.onerror = reject;
                    document.head.appendChild(link);
                  });
                  return;
                } catch {
                  const el = document.getElementById("asciinemaPlayerCss");
                  if (el) el.remove();
                }
              }
            }

            function loadScriptOnce() {
              return new Promise((resolve, reject) => {
                if (window.AsciinemaPlayer) return resolve(window.AsciinemaPlayer);
                const existing = document.getElementById("asciinemaPlayerJs");
                if (existing) {
                  // If another instance is loading, poll until available.
                  const startedAt = Date.now();
                  const poll = setInterval(() => {
                    if (window.AsciinemaPlayer) {
                      clearInterval(poll);
                      resolve(window.AsciinemaPlayer);
                    } else if (Date.now() - startedAt > 15000) {
                      clearInterval(poll);
                      reject(new Error("timeout loading asciinema-player"));
                    }
                  }, 100);
                  return;
                }

                let idx = 0;
                const tryNext = () => {
                  const src = JS_URLS[idx++];
                  if (!src) {
                    reject(new Error("failed to load asciinema-player"));
                    return;
                  }

                  const script = document.createElement("script");
                  script.id = "asciinemaPlayerJs";
                  script.src = src;
                  script.async = true;
                  script.onload = () => resolve(window.AsciinemaPlayer);
                  script.onerror = () => {
                    script.remove();
                    if (window.AsciinemaPlayer) {
                      resolve(window.AsciinemaPlayer);
                      return;
                    }
                    tryNext();
                  };
                  document.head.appendChild(script);
                };
                tryNext();
              });
            }

            function computeMarkers(castText) {
              try {
                const lines = String(castText || "").trimEnd().split("\\n");
                const out = [];
                for (let i = 1; i < lines.length; i++) {
                  const line = (lines[i] || "").trim();
                  if (!line) continue;
                  const value = JSON.parse(line);
                  if (!Array.isArray(value) || value.length < 3) continue;
                  const t = Number(value[0]);
                  const type = String(value[1]);
                  const data = String(value[2]);
                  if (!Number.isFinite(t)) continue;

                  // Prefer explicit marks when present.
                  if (type === "m") out.push(t);

                  // Also mark "Enter" submissions (helps jump between commands).
                  if (type === "i" && data.indexOf("\\r") >= 0) out.push(t);
                }

                out.sort((a, b) => a - b);
                // Deduplicate with a tiny epsilon to keep the marker list sane.
                const uniq = [];
                let last = -1e9;
                for (const t of out) {
                  if (t - last > 0.001) {
                    uniq.push(t);
                    last = t;
                  }
                }
                // Cap to avoid pathological UIs (e.g. every keypress).
                return uniq.slice(0, 200);
              } catch {
                return [];
              }
            }

            function toggleSize(player) {
              container.classList.toggle("expanded");
              if (toggleBtn) {
                toggleBtn.textContent = container.classList.contains("expanded")
                  ? "collapse"
                  : "expand";
              }
              // Nudge the player to re-render after resize.
              try {
                if (player && typeof player.getCurrentTime === "function" && typeof player.seek === "function") {
                  const t = player.getCurrentTime();
                  player.seek(t);
                }
              } catch {
                // ignore
              }
            }

            async function mountPlayer() {
              setStatus("loading…");
              await loadCssOnce();
              const AsciinemaPlayer = await loadScriptOnce();
              if (!AsciinemaPlayer || !AsciinemaPlayer.create) {
                throw new Error("AsciinemaPlayer API missing");
              }

              const castText = JSON.parse(castEl.textContent || '""');
              const markers = computeMarkers(castText);

              const player = AsciinemaPlayer.create({ data: () => castText }, container, {
                // Keep it compact inside the report; user can expand if needed.
                fit: "both",
                controls: true,
                preload: true,
                autoPlay: false,
                markers: markers.length ? markers : undefined,
              });

              if (toggleBtn) toggleBtn.addEventListener("click", () => toggleSize(player));

              setStatus("ready");
            }

            mountPlayer().catch((err) => {
              setStatus("failed: " + (err && err.message ? err.message : String(err)));
            });
          })();
        </script>
  `;

  const markListHtml =
    markFrames.length === 0
      ? `<p class="muted">No marks recorded.</p>`
      : `<ol class="marks">
${markFrames
  .map((f) => {
    const label = f.markLabel?.trim() || "(unnamed)";
    return `<li><a href="#${escapeHtml(f.id)}">t=${f.atSeconds.toFixed(3)}s — ${escapeHtml(label)}</a></li>`;
  })
  .join("\n")}
</ol>`;

  const traceData = {
    version: 2,
    durationSeconds,
    frames: input.frames.map((f, idx) => ({
      index: idx + 1,
      id: f.id,
      atSeconds: f.atSeconds,
      kind: f.kind,
      label: f.label,
      markLabel: f.markLabel ?? null,
      changedCount: f.changedCount,
      stepInfo: f.stepInfo ?? null,
    })),
  };

  const frameListHtml = input.frames
    .map((frame, idx) => {
      const statusBadge =
        frame.stepInfo && frame.stepInfo.ok
          ? `<span class="badge pass">PASS</span>`
          : frame.stepInfo && !frame.stepInfo.ok
            ? `<span class="badge fail">FAIL</span>`
            : `<span class="badge">INFO</span>`;

      const changedBadge =
        frame.changedCount > 0 ? `<span class="badge">changed=${frame.changedCount}</span>` : "";

      return `<li>
  <button
    type="button"
    class="frame-btn"
    data-idx="${idx}"
    data-id="${escapeHtml(frame.id)}"
    data-kind="${escapeHtml(frame.kind)}"
    data-ok="${frame.stepInfo ? String(frame.stepInfo.ok) : ""}"
    data-changed="${String(frame.changedCount)}"
  >
    <div class="frame-btn-top">
      ${statusBadge}
      ${changedBadge}
      <span class="mono frame-btn-time">t=${frame.atSeconds.toFixed(3)}s</span>
    </div>
    <div class="frame-btn-label mono">${escapeHtml(frame.label)}</div>
  </button>
</li>`;
    })
    .join("\n");

  const templatesHtml = input.frames
    .map((frame) => {
      const prevTpl = frame.previousViewHtml
        ? `<template id="prev-${escapeHtml(frame.id)}">${frame.previousViewHtml}</template>`
        : "";
      return `<template id="tpl-${escapeHtml(frame.id)}">${frame.viewHtml}</template>${prevTpl}`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
        <style>
      :root {
        /* Base Colors - Slate/Zinc inspired */
        --bg-body: #f8fafc;
        --bg-card: #ffffff;
        --bg-subtle: #f1f5f9;
        --bg-hover: #e2e8f0;
        --bg-active: #cbd5e1;
        
        --border-subtle: #e2e8f0;
        --border-default: #cbd5e1;
        --border-active: #94a3b8;

        --text-main: #0f172a;
        --text-muted: #64748b;
        --text-faint: #94a3b8;

        /* Accents */
        --accent-primary: #0f172a; /* Slate 900 */
        --accent-primary-fg: #f8fafc;
        --accent-brand: #3b82f6; /* Blue 500 */
        
        /* Status Colors */
        --status-pass-bg: #dcfce7;
        --status-pass-text: #166534;
        --status-pass-border: #86efac;
        
        --status-fail-bg: #fee2e2;
        --status-fail-text: #991b1b;
        --status-fail-border: #fca5a5;
        
        --status-info-bg: #e0f2fe;
        --status-info-text: #075985;
        --status-info-border: #7dd3fc;
        
        --status-changed-bg: #fef3c7;
        --status-changed-text: #92400e;

        /* Fonts */
        --font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;

        /* Shadows */
        --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
        --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
      }

      @media (prefers-color-scheme: dark) {
        :root {
          /* Dark Mode Base */
          --bg-body: #0f172a;
          --bg-card: #1e293b;
          --bg-subtle: #334155;
          --bg-hover: #475569;
          --bg-active: #64748b;

          --border-subtle: #334155;
          --border-default: #475569;
          --border-active: #64748b;

          --text-main: #f8fafc;
          --text-muted: #94a3b8;
          --text-faint: #64748b;

          --accent-primary: #f8fafc;
          --accent-primary-fg: #0f172a;
          --accent-brand: #60a5fa; /* Blue 400 */

          /* Dark Mode Status */
          --status-pass-bg: #052e16;
          --status-pass-text: #4ade80;
          --status-pass-border: #166534;

          --status-fail-bg: #450a0a;
          --status-fail-text: #f87171;
          --status-fail-border: #991b1b;

          --status-info-bg: #082f49;
          --status-info-text: #38bdf8;
          --status-info-border: #075985;
          
          --status-changed-bg: #451a03;
          --status-changed-text: #fbbf24;
        }
      }

      body {
        margin: 0;
        background-color: var(--bg-body);
        color: var(--text-main);
        font-family: var(--font-sans);
        line-height: 1.5;
        font-size: 14px;
        -webkit-font-smoothing: antialiased;
      }
      
      * {
        box-sizing: border-box;
      }

      /* Layout & Containers */
      header {
        background-color: var(--bg-card);
        padding: 16px 24px;
        border-bottom: 1px solid var(--border-subtle);
        box-shadow: var(--shadow-sm);
        position: sticky;
        top: 0;
        z-index: 50;
      }

      main {
        max-width: 1600px;
        margin: 0 auto;
        padding: 24px;
      }

      .section {
        margin-bottom: 24px;
        background-color: var(--bg-card);
        border: 1px solid var(--border-subtle);
        border-radius: 12px;
        padding: 20px;
        box-shadow: var(--shadow-sm);
      }
      
      h1, h2, h3 {
        margin: 0;
        font-weight: 600;
        letter-spacing: -0.025em;
      }
      
      header h1 {
        font-size: 20px;
        margin-bottom: 8px;
        color: var(--text-main);
      }
      
      h2 {
        font-size: 16px;
        margin-bottom: 16px;
        padding-bottom: 8px;
        border-bottom: 1px solid var(--border-subtle);
        color: var(--text-main);
      }

      /* Typography & Utility */
      .mono { font-family: var(--font-mono); }
      .muted { color: var(--text-muted); }
      
      a {
        color: var(--accent-brand);
        text-decoration: none;
      }
      a:hover { text-decoration: underline; }

      pre {
        margin: 0;
        font-family: var(--font-mono);
        font-size: 13px;
        line-height: normal;
        white-space: pre;
        overflow: auto;
      }

      /* Badges */
      .badges {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-top: 8px;
      }
      
      .badge {
        display: inline-flex;
        align-items: center;
        padding: 2px 10px;
        border-radius: 9999px;
        font-size: 12px;
        font-weight: 500;
        border: 1px solid var(--border-default);
        background-color: var(--bg-subtle);
        color: var(--text-muted);
      }
      
      .badge.pass {
        background-color: var(--status-pass-bg);
        color: var(--status-pass-text);
        border-color: var(--status-pass-border);
      }
      
      .badge.fail {
        background-color: var(--status-fail-bg);
        color: var(--status-fail-text);
        border-color: var(--status-fail-border);
      }
      
      .badge.chip {
        cursor: pointer;
        transition: all 0.2s;
      }
      .badge.chip:hover {
        background-color: var(--bg-hover);
      }
      .badge.chip[aria-pressed="true"] {
        background-color: var(--accent-primary);
        color: var(--accent-primary-fg);
        border-color: var(--accent-primary);
      }
      /* Special case: toggle badge in header */
      .badge.toggle { cursor: pointer; user-select: none; }
      #debugToggle:checked ~ header .badge.toggle {
        background-color: var(--accent-brand);
        color: white;
        border-color: var(--accent-brand);
      }

      /* Trace Layout */
      .trace {
        display: grid;
        grid-template-columns: 320px 1fr;
        gap: 24px;
        height: 70vh;
        min-height: 500px;
      }
      
      .trace aside {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      /* Frame List in Sidebar */
      .controls {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border-subtle);
      }
      
      .input {
        width: 100%;
        font-family: var(--font-mono);
        font-size: 13px;
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid var(--border-default);
        background-color: var(--bg-body);
        color: var(--text-main);
        transition: border-color 0.2s;
      }
      .input:focus {
        outline: none;
        border-color: var(--accent-brand);
        box-shadow: 0 0 0 2px var(--bg-body), 0 0 0 4px var(--accent-brand);
      }
      
      .frame-list {
        list-style: none;
        padding: 0;
        margin: 0;
        overflow-y: auto;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      
      .frame-btn {
        width: 100%;
        text-align: left;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--text-main);
        cursor: pointer;
        transition: all 0.1s;
      }
      
      .frame-btn:hover {
        background-color: var(--bg-hover);
      }
      
      .frame-btn[aria-selected="true"] {
        background-color: var(--bg-active);
        border-color: var(--border-active);
        font-weight: 500;
      }
      
      .frame-btn-top {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
        font-size: 11px;
      }
      
      .frame-btn-label {
        font-family: var(--font-mono);
        font-size: 12px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      /* Main Viewer */
      .viewer {
        display: flex;
        flex-direction: column;
        height: 100%;
        border: 1px solid var(--border-default);
        border-radius: 8px;
        overflow: hidden;
        background-color: var(--bg-body);
      }
      
      .viewer-tabs {
        display: flex;
        background-color: var(--bg-subtle);
        border-bottom: 1px solid var(--border-default);
      }
      
      .viewer-tab {
        padding: 10px 16px;
        font-size: 13px;
        font-weight: 500;
        color: var(--text-muted);
        background: transparent;
        border: none;
        border-right: 1px solid var(--border-subtle);
        cursor: pointer;
        transition: background 0.2s;
      }
      
      .viewer-tab:hover {
        background-color: var(--bg-hover);
        color: var(--text-main);
      }
      
      .viewer-tab[aria-selected="true"] {
        background-color: var(--bg-body);
        color: var(--accent-brand);
        box-shadow: inset 0 -2px 0 0 var(--accent-brand);
      }
      
      .viewer-tab.has-error {
        color: var(--status-fail-text);
      }

      .viewer-header {
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-subtle);
        background-color: var(--bg-card);
        font-size: 13px;
        display: flex;
        gap: 12px;
        align-items: baseline;
      }
      .viewer-title { font-weight: 600; color: var(--text-main); }
      .viewer-sub { color: var(--text-faint); font-size: 12px; }

      .viewer-content {
        flex: 1;
        overflow: auto;
        position: relative;
        display: none;
      }
      .viewer-content.active { display: block; }

      /* Terminal Render */
      .terminal {
        background-color: #0d1117; /* GitHub Dark dim */
        color: #c9d1d9;
        font-family: var(--font-mono);
        font-size: 13px;
        line-height: normal;
        padding: 16px;
        min-height: 100%;
      }
      .terminal .headerblock {
        color: #8b949e;
        margin-bottom: 8px;
        display: block;
        font-size: 11px;
      }
      .terminal .row {
        display: block;
      }
      .terminal .ln {
        display: inline-block;
        width: 3ch;
        margin-right: 1ch;
        color: #484f58;
        user-select: none;
        text-align: right;
        vertical-align: top;
      }
      .terminal .row.changed {
        background: rgba(187, 128, 9, 0.15); /* Yellow marking */
      }
      .terminal .seg { display: inline; }

      /* Hide debug lines if toggle off */
      #debugToggle:not(:checked) ~ main .terminal .headerblock,
      #debugToggle:not(:checked) ~ main .terminal .ln {
        display: none;
      }
      #debugToggle:not(:checked) ~ main .terminal .row.changed {
        background: transparent;
      }
      .debug-toggle {
        position: absolute;
        width: 0; height: 0; opacity: 0;
      }

      /* Timeline */
      .timeline {
        padding: 6px 0;
        margin-bottom: 16px;
      }
      .timeline-header {
        display: flex;
        justify-content: space-between;
        margin-bottom: 8px;
        font-size: 12px;
        color: var(--text-muted);
        font-family: var(--font-mono);
      }
      .timeline-track {
        height: 32px;
        background-color: var(--bg-subtle);
        border: 1px solid var(--border-default);
        border-radius: 4px;
        position: relative;
        cursor: pointer;
        overflow: hidden;
      }
      .timeline-bar {
        position: absolute;
        top: 4px; bottom: 4px;
        background-color: var(--border-active);
        border-radius: 1px;
        min-width: 2px;
      }
      .timeline-bar.pass { background-color: var(--status-pass-border); }
      .timeline-bar.fail { background-color: var(--status-fail-text); }
      .timeline-bar.info { background-color: var(--status-info-border); }
      .timeline-bar.selected {
        background-color: var(--accent-brand);
        z-index: 10;
        top: 0; bottom: 0;
        box-shadow: 0 0 0 1px white;
      }
      
      /* Other Components */
      .call-row {
        display: grid;
        grid-template-columns: 100px 1fr;
        gap: 16px;
        padding: 8px 16px;
        border-bottom: 1px solid var(--border-subtle);
        font-size: 13px;
      }
      .call-key { color: var(--text-muted); font-weight: 500; text-align: right; }
      .call-value { color: var(--text-main); font-family: var(--font-mono); }
      
      .error-box {
        margin: 16px;
        padding: 16px;
        background-color: var(--status-fail-bg);
        border: 1px solid var(--status-fail-border);
        border-radius: 6px;
        color: var(--status-fail-text);
      }
      .error-title { font-weight: 700; margin-bottom: 8px; }

      .diff-view {
        display: grid;
        grid-template-columns: 1fr 1fr;
        height: 100%;
      }
      .diff-pane {
        overflow: auto;
        border-right: 1px solid #30363d;
        background-color: #0d1117;
      }
      .diff-pane-header {
        background: #161b22;
        color: #8b949e;
        padding: 8px 16px;
        font-size: 11px;
        font-weight: 600;
        border-bottom: 1px solid #30363d;
        position: sticky;
        top: 0;
      }
      /* Built-in player */
      .builtin-player {
        background: #0b0f14;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid color-mix(in oklab, currentColor 14%, transparent);
      }
      /* Cast player styles */
      .cast-player {
        height: 450px;
        min-height: 200px;
        max-height: 450px;
        overflow: hidden;
        background: transparent;
        margin-top: 16px;
        margin-bottom: 20px;
        border-bottom: 1px solid var(--border-subtle);
      }
      
      /* Force left alignment of the player */
      .cast-player .ap-wrapper {
        display: flex;
        justify-content: flex-start !important;
        text-align: left;
      }
      
      /* Style the inner player terminal box */
      .cast-player .ap-player {
        border-radius: 8px;
        box-shadow: var(--shadow-md);
        border: 1px solid var(--border-subtle);
      }

      .cast-player.expanded {
        height: 80vh;
      }
      
      .cast-controls {
        display: flex;
        align-items: center;
        gap: 12px;
        margin: 12px 0;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--border-subtle);
      }
      
      @media (max-width: 1024px) {
        .trace { grid-template-columns: 1fr; height: auto; }
        .viewer { height: 500px; }
        .frame-list { max-height: 300px; }
      }
    </style>
  </head>
  <body>
    <input id="debugToggle" class="debug-toggle" type="checkbox" checked />
    <header>
      <h1>${escapeHtml(title)}</h1>
      <div class="badges">
        <span class="badge ${resultClass}">result=${escapeHtml(resultLabel)}</span>
        <span class="badge">marks=${markFrames.length}</span>
        <span class="badge">duration=${durationSeconds.toFixed(3)}s</span>
        <label class="badge toggle" for="debugToggle">debug</label>
      </div>
      <div class="meta">term=${escapeHtml(input.term.type)} ${input.term.cols}x${input.term.rows} scope=${escapeHtml(input.scope)} events=${input.eventCount}
command=${escapeHtml(command)}
timestamp=${escapeHtml(coerceDisplayString(timestamp))}</div>
      <details>
        <summary>Raw header JSON</summary>
        <pre>${escapeHtml(headerJson)}</pre>
      </details>
    </header>
    <main>
      <section class="section">
        <h2>Task</h2>
        <pre>${escapeHtml(
          [
            input.scriptName ? `script=${input.scriptName}` : null,
            command ? `command=${command}` : null,
            `term=${input.term.type} ${input.term.cols}x${input.term.rows}`,
            `scope=${input.scope}`,
          ]
            .filter(Boolean)
            .join("\n"),
        )}</pre>
      </section>
      <section class="section">
        <h2>Artifacts</h2>
        ${artifactsHtml}
      </section>
      <section class="section" id="cast-playback">
        <h2>Cast Playback</h2>
        ${castPlayerHtml}
      </section>
      <section class="section">
        <h2>Marks</h2>
        ${markListHtml}
      </section>
      <section class="section">
        <h2>Trace</h2>
        <!-- Timeline -->
        <div class="timeline" id="timeline">
          <div class="timeline-header">
            <span class="mono">Timeline</span>
            <span class="mono muted" id="timelineInfo">0 steps · 0.000s</span>
          </div>
          <div class="timeline-track" id="timelineTrack"></div>
        </div>
        <div class="trace">
          <aside>
            <div class="controls">
              <input id="frameSearch" class="input mono" placeholder="Search frames…" autocomplete="off" />
              <button id="modeAll" class="badge chip" type="button" aria-pressed="true">all</button>
              <button id="modeChanged" class="badge chip" type="button" aria-pressed="false">changed</button>
              <button id="modeMarks" class="badge chip" type="button" aria-pressed="false">marks</button>
              <button id="modeFailed" class="badge chip fail" type="button" aria-pressed="false">failed</button>
              <span id="visibleFrames" class="badge">visible=0</span>
            </div>
            <ol id="frameList" class="frame-list">
              ${frameListHtml}
            </ol>
          </aside>
          <div class="viewer">
            <div class="viewer-tabs" id="viewerTabs">
              <button class="viewer-tab" data-tab="snapshot" aria-selected="true">Snapshot</button>
              <button class="viewer-tab" data-tab="call">Call</button>
              <button class="viewer-tab" data-tab="errors" id="errorsTab">Errors</button>
              <button class="viewer-tab" data-tab="diff">Diff</button>
            </div>
            <div class="viewer-header">
              <span id="viewerTitle" class="viewer-title mono"></span>
              <span id="viewerSub" class="viewer-sub mono muted"></span>
            </div>
            <div id="viewerSnapshot" class="viewer-content active">
              <pre id="viewer" class="terminal"></pre>
            </div>
            <div id="viewerCall" class="viewer-content">
              <div class="call-details" id="callDetails"></div>
            </div>
            <div id="viewerErrors" class="viewer-content">
              <div id="errorContent"></div>
            </div>
            <div id="viewerDiff" class="viewer-content">
              <div class="diff-view" id="diffView">
                <div class="diff-pane">
                  <div class="diff-pane-header">Previous</div>
                  <pre id="diffPrev" class="terminal"></pre>
                </div>
                <div class="diff-pane">
                  <div class="diff-pane-header">Current</div>
                  <pre id="diffCurr" class="terminal"></pre>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="muted mono" style="margin-top: 10px;">Tips: click a frame or timeline bar, use ↑/↓ (j/k) to navigate, 1-4 to switch tabs.</div>
        <script id="traceData" type="application/json">${jsonForHtml(traceData)}</script>
        ${templatesHtml}
        <script>
          (function () {
            const dataEl = document.getElementById("traceData");
            const listEl = document.getElementById("frameList");
            const viewerEl = document.getElementById("viewer");
            const titleEl = document.getElementById("viewerTitle");
            const subEl = document.getElementById("viewerSub");
            const searchEl = document.getElementById("frameSearch");
            const visibleEl = document.getElementById("visibleFrames");
            const modeAll = document.getElementById("modeAll");
            const modeChanged = document.getElementById("modeChanged");
            const modeMarks = document.getElementById("modeMarks");
            const modeFailed = document.getElementById("modeFailed");
            const timelineTrack = document.getElementById("timelineTrack");
            const timelineInfo = document.getElementById("timelineInfo");
            const viewerTabs = document.getElementById("viewerTabs");
            const callDetails = document.getElementById("callDetails");
            const errorContent = document.getElementById("errorContent");
            const diffPrev = document.getElementById("diffPrev");
            const diffCurr = document.getElementById("diffCurr");
            const errorsTab = document.getElementById("errorsTab");
            if (!dataEl || !listEl || !viewerEl || !titleEl || !subEl || !searchEl) return;

            const raw = JSON.parse(dataEl.textContent || "{}");
            const frames = Array.isArray(raw.frames) ? raw.frames : [];
            const durationSeconds = raw.durationSeconds || 0;
            const buttons = Array.from(listEl.querySelectorAll("button.frame-btn"));
            const idToIndex = new Map();
            for (const f of frames) idToIndex.set(f.id, f.index - 1);

            let mode = "all";
            let current = 0;
            let activeTab = "snapshot";

            // Timeline setup
            if (timelineTrack && frames.length > 0) {
              const maxTime = Math.max(durationSeconds, frames[frames.length - 1]?.atSeconds || 1);
              timelineInfo.textContent = frames.length + " steps · " + maxTime.toFixed(3) + "s";

              frames.forEach((f, idx) => {
                const bar = document.createElement("div");
                bar.className = "timeline-bar";
                const left = (f.atSeconds / maxTime) * 100;
                const width = Math.max(2, (1 / frames.length) * 100);
                bar.style.left = left + "%";
                bar.style.width = width + "%";

                if (f.stepInfo) {
                  bar.classList.add(f.stepInfo.ok ? "pass" : "fail");
                } else {
                  bar.classList.add("info");
                }

                bar.dataset.idx = idx;
                bar.title = f.label;
                bar.addEventListener("click", () => select(idx, true));
                timelineTrack.appendChild(bar);

                // Add error markers
                if (f.stepInfo && !f.stepInfo.ok) {
                  const marker = document.createElement("div");
                  marker.className = "timeline-marker error";
                  marker.style.left = left + "%";
                  timelineTrack.appendChild(marker);
                }

                // Add mark markers
                if (f.kind === "mark") {
                  const marker = document.createElement("div");
                  marker.className = "timeline-marker";
                  marker.style.left = left + "%";
                  timelineTrack.appendChild(marker);
                }
              });
            }

            // Tab switching
            const tabs = viewerTabs ? Array.from(viewerTabs.querySelectorAll(".viewer-tab")) : [];
            const contents = {
              snapshot: document.getElementById("viewerSnapshot"),
              call: document.getElementById("viewerCall"),
              errors: document.getElementById("viewerErrors"),
              diff: document.getElementById("viewerDiff"),
            };

            function switchTab(tabName) {
              activeTab = tabName;
              tabs.forEach(t => t.setAttribute("aria-selected", t.dataset.tab === tabName ? "true" : "false"));
              Object.entries(contents).forEach(([name, el]) => {
                if (el) el.classList.toggle("active", name === tabName);
              });
            }

            tabs.forEach(tab => {
              tab.addEventListener("click", () => switchTab(tab.dataset.tab));
            });

            function setPressed(el, on) {
              el.setAttribute("aria-pressed", on ? "true" : "false");
            }

            function setMode(next) {
              mode = next;
              setPressed(modeAll, mode === "all");
              setPressed(modeChanged, mode === "changed");
              setPressed(modeMarks, mode === "marks");
              setPressed(modeFailed, mode === "failed");
              applyFilter();
            }

            function applyFilter() {
              const q = (searchEl.value || "").trim().toLowerCase();
              let visible = 0;
              for (const btn of buttons) {
                const idx = Number(btn.dataset.idx || "0");
                let show = true;
                if (mode === "changed") show = Number(btn.dataset.changed || "0") > 0;
                else if (mode === "marks") show = btn.dataset.kind === "mark";
                else if (mode === "failed") show = btn.dataset.ok === "false";
                if (show && q) {
                  const label = (btn.querySelector(".frame-btn-label")?.textContent || "").toLowerCase();
                  if (!label.includes(q)) show = false;
                }
                btn.parentElement.style.display = show ? "" : "none";
                if (show) visible += 1;
              }
              if (visibleEl) visibleEl.textContent = "visible=" + visible;

              if (buttons[current] && buttons[current].parentElement.style.display === "none") {
                const firstVisible = buttons.findIndex((b) => b.parentElement.style.display !== "none");
                if (firstVisible >= 0) select(firstVisible, false);
              } else {
                updateSelected();
              }
            }

            function updateSelected() {
              for (const btn of buttons) {
                const idx = Number(btn.dataset.idx || "0");
                btn.setAttribute("aria-selected", idx === current ? "true" : "false");
              }
              // Update timeline selection
              if (timelineTrack) {
                const bars = timelineTrack.querySelectorAll(".timeline-bar");
                bars.forEach((bar, idx) => bar.classList.toggle("selected", idx === current));
              }
            }

            function escapeHtml(s) {
              return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            }

            function renderFrame(idx) {
              const f = frames[idx];
              if (!f) return;

              // Render snapshot tab
              const tpl = document.getElementById("tpl-" + f.id);
              if (tpl && tpl.content) {
                viewerEl.innerHTML = "";
                viewerEl.appendChild(tpl.content.cloneNode(true));
              } else if (tpl) {
                viewerEl.innerHTML = tpl.innerHTML || "";
              } else {
                viewerEl.textContent = "(missing template)";
              }

              // Render call tab
              if (callDetails) {
                let html = '<div class="call-row"><span class="call-key">type</span><span class="call-value mono">' + escapeHtml(f.stepInfo?.type || f.kind) + '</span></div>';
                html += '<div class="call-row"><span class="call-key">index</span><span class="call-value mono">' + (idx + 1) + '</span></div>';
                html += '<div class="call-row"><span class="call-key">time</span><span class="call-value mono">' + f.atSeconds.toFixed(3) + 's</span></div>';
                if (f.stepInfo?.durationMs !== undefined) {
                  html += '<div class="call-row"><span class="call-key">duration</span><span class="call-value mono">' + f.stepInfo.durationMs + 'ms</span></div>';
                }
                if (f.stepInfo?.params) {
                  Object.entries(f.stepInfo.params).forEach(([key, value]) => {
                    const val = typeof value === "string" ? value : JSON.stringify(value);
                    html += '<div class="call-row"><span class="call-key">' + escapeHtml(key) + '</span><span class="call-value mono">' + escapeHtml(val) + '</span></div>';
                  });
                }
                callDetails.innerHTML = html;
              }

              // Render errors tab
              if (errorContent) {
                if (f.stepInfo && !f.stepInfo.ok && f.stepInfo.error) {
                  errorContent.innerHTML = '<div class="error-box"><div class="error-title">Step ' + (idx + 1) + ' Failed</div><div class="error-message">' + escapeHtml(f.stepInfo.error) + '</div></div>';
                  if (errorsTab) errorsTab.classList.add("has-error");
                } else {
                  errorContent.innerHTML = '<div class="muted" style="padding: 12px;">No errors for this step.</div>';
                  if (errorsTab) errorsTab.classList.remove("has-error");
                }
              }

              // Render diff tab
              if (diffPrev && diffCurr) {
                const prevTpl = document.getElementById("prev-" + f.id);
                if (prevTpl && prevTpl.content) {
                  diffPrev.innerHTML = "";
                  diffPrev.appendChild(prevTpl.content.cloneNode(true));
                } else if (prevTpl) {
                  diffPrev.innerHTML = prevTpl.innerHTML || "";
                } else {
                  diffPrev.textContent = "(first frame - no previous)";
                }
                if (tpl && tpl.content) {
                  diffCurr.innerHTML = "";
                  diffCurr.appendChild(tpl.content.cloneNode(true));
                } else if (tpl) {
                  diffCurr.innerHTML = tpl.innerHTML || "";
                }
              }

              titleEl.textContent = (idx + 1) + ". t=" + f.atSeconds.toFixed(3) + "s — " + f.label;
              const bits = [];
              if (f.kind) bits.push("kind=" + f.kind);
              if (typeof f.changedCount === "number") bits.push("changed=" + f.changedCount);
              if (f.stepInfo && typeof f.stepInfo.ok === "boolean") bits.push("ok=" + String(f.stepInfo.ok));
              subEl.textContent = bits.join(" ");

              // Auto-switch to errors tab if step failed
              if (f.stepInfo && !f.stepInfo.ok && activeTab === "snapshot") {
                switchTab("errors");
              }
            }

            function select(idx, updateHash) {
              current = Math.max(0, Math.min(buttons.length - 1, idx));
              updateSelected();
              renderFrame(current);
              if (updateHash) location.hash = frames[current]?.id ? "#" + frames[current].id : "";
              // Scroll button into view
              if (buttons[current]) buttons[current].scrollIntoView({ block: "nearest" });
            }

            function selectById(id) {
              const idx = idToIndex.get(id);
              if (typeof idx === "number") select(idx, false);
            }

            for (const btn of buttons) {
              btn.addEventListener("click", function () {
                select(Number(btn.dataset.idx || "0"), true);
              });
            }

            modeAll.addEventListener("click", () => setMode("all"));
            modeChanged.addEventListener("click", () => setMode("changed"));
            modeMarks.addEventListener("click", () => setMode("marks"));
            modeFailed.addEventListener("click", () => setMode("failed"));
            searchEl.addEventListener("input", applyFilter);

            window.addEventListener("hashchange", function () {
              const id = (location.hash || "").replace(/^#/, "");
              if (id) selectById(id);
            });

            document.addEventListener("keydown", function (e) {
              const tag = (document.activeElement && document.activeElement.tagName) || "";
              if (tag === "INPUT" || tag === "TEXTAREA") return;

              // Navigation
              if (e.key === "ArrowDown" || e.key === "j") {
                e.preventDefault();
                let next = current + 1;
                while (next < buttons.length && buttons[next].parentElement.style.display === "none") next += 1;
                if (next < buttons.length) select(next, true);
              } else if (e.key === "ArrowUp" || e.key === "k") {
                e.preventDefault();
                let next = current - 1;
                while (next >= 0 && buttons[next].parentElement.style.display === "none") next -= 1;
                if (next >= 0) select(next, true);
              }

              // Tab switching with number keys
              if (e.key === "1") switchTab("snapshot");
              if (e.key === "2") switchTab("call");
              if (e.key === "3") switchTab("errors");
              if (e.key === "4") switchTab("diff");
            });

            // Initial frame: prefer hash, otherwise first failing, otherwise final.
            const hashId = (location.hash || "").replace(/^#/, "");
            if (hashId) {
              selectById(hashId);
            } else {
              const firstFail = buttons.findIndex((b) => b.dataset.ok === "false");
              if (firstFail >= 0) select(firstFail, false);
              else select(buttons.length - 1, false);
            }

            applyFilter();
          })();
        </script>
      </section>
      <section class="summary">
        <h2>Summary</h2>
        <pre>${escapeHtml(
          [
            `result=${resultLabel}`,
            `marks=${markFrames.length}`,
            `frames=${input.frames.length}`,
            `duration=${durationSeconds.toFixed(3)}s`,
            input.result?.ok === false && input.result.error ? `error=${input.result.error}` : null,
            input.result?.ok === false && input.result.failureStep
              ? `failedStep=${input.result.failureStep.index} ${input.result.failureStep.type}`
              : null,
          ]
            .filter(Boolean)
            .join("\n"),
        )}</pre>
      </section>
    </main>
	  </body>
	</html>`;
}
