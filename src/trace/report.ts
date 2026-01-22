import { Terminal } from "@xterm/headless";

import { writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

import type { Color, CellStyle } from "../terminal/style";
import { extractStyle, findMeaningfulEndCol, isDefaultStyle, styleKey } from "../terminal/style";
import { snapshotGrid, snapshotLines } from "../terminal/snapshot";
import type { SnapshotScope } from "../terminal/snapshot";
import type { TerminalMeta } from "../terminal/view";
import { fnv1a32 } from "../util/hash";

import type { AsciicastEvent } from "./asciicast";

type ParsedAsciicast = {
  header: Record<string, unknown>;
  events: AsciicastEvent[];
};

export type TraceReportResult = {
  ok: boolean;
  error?: string;
  failureStep?: {
    index: number;
    type: string;
  };
};

export type TraceReportArtifacts = {
  castHref?: string;
  failureErrorHref?: string;
  failureStepHref?: string;
  failureLastTextHref?: string;
  failureLastViewHref?: string;
};

type ReportFrame = {
  id: string;
  atSeconds: number;
  kind: "mark" | "resize" | "final" | "step";
  markLabel?: string;
  label: string;
  viewHtml: string;
  changedCount: number;
  stepInfo?: {
    index: number;
    type: string;
    ok: boolean;
    error?: string;
    params?: Record<string, unknown>;
    durationMs?: number;
  };
  previousViewHtml?: string;
};

export async function generateTraceReportHtml(
  cast: string,
  options?: {
    scope?: SnapshotScope;
    maxFrames?: number;
    scriptName?: string;
    result?: TraceReportResult;
    artifacts?: TraceReportArtifacts;
    steps?: unknown[]; // Should be ScriptStep execution records
  },
): Promise<string> {
  const parsed = parseAsciicast(cast);
  const termInfo = getTermInfo(parsed.header);

  const terminal = new Terminal({
    cols: termInfo.cols,
    rows: termInfo.rows,
    allowProposedApi: true,
    scrollback: 2000,
    convertEol: true,
  });

  const scope = options?.scope ?? "visible";
  const maxFrames = options?.maxFrames ?? 200;
  const scriptName = options?.scriptName?.trim() ? options.scriptName.trim() : "";
  const result = options?.result;
  const artifacts = options?.artifacts;
  const steps = options?.steps as
    | Array<{
        index: number;
        step: { type: string; [key: string]: unknown };
        ok: boolean;
        error?: string;
        durationMs?: number;
        after?: { text: string; hash: string; kind: string };
      }>
    | undefined;

  let writeChain: Promise<void> = Promise.resolve();

  const frames: ReportFrame[] = [];
  let previousRowSignatures: string[] | null = null;

  const capture = (args: {
    atSeconds: number;
    kind: ReportFrame["kind"];
    label: string;
    markLabel?: string;
    stepInfo?: ReportFrame["stepInfo"];
    overrideViewText?: { text: string; hash?: string };
  }): void => {
    if (frames.length >= maxFrames) return;

    let viewHtml: string;
    let changedCount: number;

    if (args.overrideViewText) {
      const parsedView = parseSnapshotViewText(args.overrideViewText.text);
      const headerLine =
        parsedView.headerLine ??
        (args.overrideViewText.hash?.trim()
          ? `hash=${args.overrideViewText.hash.trim()}`
          : "snapshot");

      const rowSignatures = parsedView.rows.map((r) => r.text);
      const changedLines = diffLineIndices(previousRowSignatures ?? [], rowSignatures);
      previousRowSignatures = rowSignatures;
      changedCount = changedLines.size;

      viewHtml = renderSnapshotViewTextHtml({
        headerLine,
        rows: parsedView.rows,
        changedLines,
      });
    } else {
      let lines: string[];
      let hash: string;
      let changedLines = new Set<number>();

      if (scope === "visible") {
        const grid = snapshotGrid(terminal, { trimRight: true, includeStyles: true });
        lines = grid.lines;
        hash = fnv1a32(JSON.stringify(grid));

        const rowSignatures = lines.map((line, idx) => {
          const runs = grid.styleRuns?.[idx] ?? [];
          if (line === "" && runs.length === 0) return "";
          return `${line}\n${JSON.stringify(runs)}`;
        });

        changedLines = diffLineIndices(previousRowSignatures ?? [], rowSignatures);
        previousRowSignatures = rowSignatures;
      } else {
        lines = snapshotLines(terminal, { scope, trimRight: true });
        hash = fnv1a32(lines.join("\n"));
      }

      changedCount = changedLines.size;
      viewHtml = renderSnapshotViewHtml({
        terminal,
        sessionId: "replay",
        scope,
        hash,
        lines,
        meta: getMeta(terminal),
        lineNumbers: true,
        changedLines,
        trimRight: true,
      });
    }

    const previousFrame = frames.at(-1);
    frames.push({
      id: `frame-${frames.length + 1}`,
      atSeconds: args.atSeconds,
      kind: args.kind,
      label: args.label,
      markLabel: args.markLabel,
      viewHtml,
      changedCount,
      stepInfo: args.stepInfo,
      previousViewHtml: previousFrame?.viewHtml,
    });
  };
  // Build frames. Prefer step-based snapshots when available (runner-provided).
  if (steps && steps.length > 0) {
    for (let i = 0; i < steps.length; i += 1) {
      const stepRec = steps[i];
      if (!stepRec) continue;

      const stepLabel = formatStepLabel(stepRec.step);
      const viewText = stepRec.after?.text ?? "";
      const displayIndex = (typeof stepRec.index === "number" ? stepRec.index : i) + 1;

      const stepType = stepRec.step.type;
      const kind: ReportFrame["kind"] =
        stepType === "mark" ? "mark" : stepType === "resize" ? "resize" : "step";
      const markLabel =
        kind === "mark" && typeof (stepRec.step as { label?: unknown }).label === "string"
          ? String((stepRec.step as { label?: unknown }).label)
          : undefined;

      // Extract step params for Call tab
      const stepParams: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(stepRec.step)) {
        if (key !== "type") {
          stepParams[key] = value;
        }
      }

      capture({
        atSeconds: displayIndex,
        kind,
        label: stepLabel,
        markLabel,
        stepInfo: {
          index: displayIndex,
          type: stepType,
          ok: stepRec.ok,
          error: stepRec.error,
          params: Object.keys(stepParams).length > 0 ? stepParams : undefined,
          durationMs: typeof stepRec.durationMs === "number" ? stepRec.durationMs : undefined,
        },
        overrideViewText: { text: viewText, hash: stepRec.after?.hash },
      });

      if (frames.length >= maxFrames) break;
    }
  } else {
    for (const event of parsed.events) {
      const [time, type, data] = event;
      if (type === "o") {
        writeChain = writeChain.then(() => writeTerminal(terminal, data));
      } else if (type === "r") {
        void writeChain.then(() => {
          const resized = parseResize(data);
          if (resized) {
            terminal.resize(resized.cols, resized.rows);
          }
          capture({ atSeconds: time, kind: "resize", label: `resize ${data}` });
        });
      } else if (type === "m") {
        void writeChain.then(() => {
          const markLabel = (data ?? "").trim();
          const label = markLabel ? `mark ${markLabel}` : "mark";
          capture({ atSeconds: time, kind: "mark", label, markLabel });
        });
      }
    }

    await writeChain;
    capture({
      atSeconds: parsed.events.at(-1)?.[0] ?? 0,
      kind: "final",
      label: "final",
    });
  }

  terminal.dispose();

  return renderHtml({
    cast,
    header: parsed.header,
    term: termInfo,
    scope,
    scriptName,
    result,
    artifacts,
    frames,
    eventCount: parsed.events.length,
  });
}

function formatStepLabel(step: { type: string; [key: string]: unknown }): string {
  const showText = envTruthy(process.env.PTYWRIGHT_REPORT_SHOW_STEP_TEXT);

  if (step.type === "custom" && typeof step.name === "string") return `custom(${step.name})`;

  if (step.type === "sendText") {
    const enter = typeof step.enter === "boolean" ? step.enter : undefined;
    const enterSuffix = enter !== undefined ? `enter=${enter}` : "";
    const description = typeof step.description === "string" ? step.description : "";
    const text = typeof step.text === "string" ? step.text : description;

    if (!text) {
      return enterSuffix ? `sendText (${enterSuffix})` : "sendText";
    }

    if (!showText) {
      return `sendText <redacted> (len=${text.length}${enterSuffix ? `, ${enterSuffix}` : ""})`;
    }

    return `sendText "${truncateInline(text)}"${enterSuffix ? ` (${enterSuffix})` : ""}`;
  }

  if (step.type === "waitForText") {
    const text = typeof step.text === "string" ? step.text : undefined;
    const regex = typeof step.regex === "string" ? step.regex : undefined;
    const description = typeof step.description === "string" ? step.description : undefined;

    if (!showText) {
      if (text) return "waitForText (text)";
      if (regex) return "waitForText (regex)";
      return "waitForText";
    }

    if (text) return `waitFor "${truncateInline(text)}"`;
    if (regex) return `waitFor /${truncateInline(regex)}/`;
    if (description) return `waitForText "${truncateInline(description)}"`;
    return "waitForText";
  }

  if (step.type === "assert") {
    const text = typeof step.text === "string" ? step.text : undefined;
    const regex = typeof step.regex === "string" ? step.regex : undefined;
    const description = typeof step.description === "string" ? step.description : undefined;

    if (!showText) {
      if (text) return "assert (text)";
      if (regex) return "assert (regex)";
      return "assert";
    }

    if (text) return `assert "${truncateInline(text)}"`;
    if (regex) return `assert /${truncateInline(regex)}/`;
    if (description) return `assert "${truncateInline(description)}"`;
    return "assert";
  }

  if (step.type === "pressKey" && typeof step.key === "string") return `pressKey ${step.key}`;

  if (step.type === "mark") {
    const label = typeof step.label === "string" ? step.label.trim() : "";
    return label ? `mark ${label}` : "mark";
  }

  if (step.type === "resize") {
    const cols = typeof step.cols === "number" ? step.cols : undefined;
    const rows = typeof step.rows === "number" ? step.rows : undefined;
    if (cols !== undefined && rows !== undefined) return `resize ${cols}x${rows}`;
    return "resize";
  }

  return step.type;
}

function truncateInline(text: string, maxChars: number = 60): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "\\n");
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, maxChars)}…(+${normalized.length - maxChars})`;
}

function envTruthy(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

type ParsedSnapshotViewText = {
  headerLine: string | null;
  rows: Array<{ prefix?: string; text: string }>;
};

function parseSnapshotViewText(viewText: string): ParsedSnapshotViewText {
  const normalized = viewText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const first = lines[0] ?? "";

  const hasHeader = /\bsession=/.test(first) && /\bhash=/.test(first);
  const headerLine = hasHeader ? first : null;
  const rowLines = hasHeader ? lines.slice(1) : lines;

  const rows = rowLines.map((line) => {
    const match = line.match(/^(\d+│\s)(.*)$/);
    if (!match) return { text: line };
    return { prefix: match[1], text: match[2] ?? "" };
  });

  return { headerLine, rows };
}

function renderSnapshotViewTextHtml(options: {
  headerLine: string;
  rows: Array<{ prefix?: string; text: string }>;
  changedLines: Set<number>;
}): string {
  const digits = Math.max(2, String(options.rows.length).length);
  const out: string[] = [`<span class="headerblock">${escapeHtml(options.headerLine)}</span>`];

  for (let i = 0; i < options.rows.length; i += 1) {
    const row = options.rows[i];
    const prefix = row?.prefix ?? `${String(i + 1).padStart(digits, "0")}│ `;
    const prefixHtml = `<span class="ln">${escapeHtml(prefix)}</span>`;
    const rowClass = options.changedLines.has(i) ? "row changed" : "row";
    out.push(`<span class="${rowClass}">${prefixHtml}${escapeHtml(row?.text ?? "")}</span>`);
  }

  return out.join("");
}

async function writeTerminal(terminal: Terminal, data: string): Promise<void> {
  await new Promise<void>((resolve) => {
    terminal.write(data, resolve);
  });
}

function renderHtml(input: {
  cast: string;
  header: Record<string, unknown>;
  term: { cols: number; rows: number; type: string };
  scope: SnapshotScope;
  scriptName: string;
  result?: TraceReportResult;
  artifacts?: TraceReportArtifacts;
  frames: ReportFrame[];
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
            // Use multiple CDNs to avoid regional blocks (e.g. jsdelivr).
            const CDN_BASES = [
              "https://cdn.jsdelivr.net/npm/asciinema-player@" + VERSION + "/dist/bundle/",
              "https://unpkg.com/asciinema-player@" + VERSION + "/dist/bundle/",
            ];
            const CSS_URLS = CDN_BASES.map((b) => b + "asciinema-player.css");
            const JS_URLS = CDN_BASES.map((b) => b + "asciinema-player.min.js");

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
        color-scheme: light dark;
      }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto,
          Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        line-height: 1.4;
      }
      header {
        padding: 16px;
        border-bottom: 1px solid color-mix(in oklab, currentColor 20%, transparent);
      }
      header h1 {
        margin: 0 0 8px 0;
        font-size: 18px;
      }
      header .badges {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 6px 0 10px 0;
      }
      .debug-toggle {
        position: absolute;
        left: -99999px;
        width: 1px;
        height: 1px;
        overflow: hidden;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 2px 10px;
        font-size: 12px;
        border: 1px solid color-mix(in oklab, currentColor 16%, transparent);
        background: color-mix(in oklab, currentColor 6%, transparent);
      }
      .badge.toggle {
        cursor: pointer;
        user-select: none;
      }
      #debugToggle:checked ~ header .badge.toggle {
        background: color-mix(in oklab, #0ea5e9 18%, transparent);
        border-color: color-mix(in oklab, #0ea5e9 45%, transparent);
      }
      .badge.pass {
        background: color-mix(in oklab, #16a34a 18%, transparent);
        border-color: color-mix(in oklab, #16a34a 45%, transparent);
      }
      .badge.fail {
        background: color-mix(in oklab, #ef4444 18%, transparent);
        border-color: color-mix(in oklab, #ef4444 45%, transparent);
      }
      .badge.unknown {
        background: color-mix(in oklab, #64748b 18%, transparent);
        border-color: color-mix(in oklab, #64748b 45%, transparent);
      }
      header .meta {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
        opacity: 0.8;
        white-space: pre-wrap;
      }
      main {
        padding: 16px;
      }
      .trace {
        display: grid;
        grid-template-columns: 360px 1fr;
        gap: 12px;
      }
      .trace aside {
        border: 1px solid color-mix(in oklab, currentColor 14%, transparent);
        border-radius: 10px;
        padding: 10px;
        background: color-mix(in oklab, currentColor 2%, transparent);
      }
      .trace .viewer {
        border: 1px solid color-mix(in oklab, currentColor 14%, transparent);
        border-radius: 10px;
        overflow: hidden;
      }
      .viewer-header {
        padding: 10px 12px;
        border-bottom: 1px solid color-mix(in oklab, currentColor 14%, transparent);
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
        background: color-mix(in oklab, currentColor 4%, transparent);
      }
      .viewer-title {
        font-weight: 600;
      }
      .viewer-sub {
        opacity: 0.75;
      }
      .controls {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
        margin-bottom: 10px;
      }
      .input {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid color-mix(in oklab, currentColor 16%, transparent);
        background: color-mix(in oklab, currentColor 4%, transparent);
        color: inherit;
      }
      .chip {
        cursor: pointer;
        user-select: none;
      }
      .chip[aria-pressed="true"] {
        background: color-mix(in oklab, #0ea5e9 18%, transparent);
        border-color: color-mix(in oklab, #0ea5e9 45%, transparent);
      }
      .frame-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 8px;
        max-height: 70vh;
        overflow: auto;
      }
      .frame-btn {
        width: 100%;
        text-align: left;
        border: 1px solid color-mix(in oklab, currentColor 14%, transparent);
        border-radius: 10px;
        padding: 10px;
        background: color-mix(in oklab, currentColor 2%, transparent);
        color: inherit;
        cursor: pointer;
      }
      .frame-btn:hover {
        background: color-mix(in oklab, currentColor 6%, transparent);
      }
      .frame-btn[aria-selected="true"] {
        border-color: color-mix(in oklab, #0ea5e9 55%, transparent);
        background: color-mix(in oklab, #0ea5e9 10%, transparent);
      }
      .frame-btn-top {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        align-items: center;
      }
      .frame-btn-time {
        opacity: 0.8;
      }
      .frame-btn-label {
        margin-top: 6px;
        opacity: 0.9;
      }
      @media (max-width: 920px) {
        .trace {
          grid-template-columns: 1fr;
        }
        .frame-list {
          max-height: 38vh;
        }
      }
      details {
        margin: 12px 0;
      }
      .section {
        margin: 0 0 18px 0;
      }
      pre {
        margin: 8px 0 0 0;
        padding: 12px;
        overflow: auto;
        border-radius: 8px;
        background: color-mix(in oklab, currentColor 6%, transparent);
        border: 1px solid color-mix(in oklab, currentColor 14%, transparent);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
        line-height: 1.35;
      }
      pre.terminal {
        background: #0b0f14;
        border-color: color-mix(in oklab, #0b0f14 55%, currentColor);
        color: #e6edf3;
      }
      #debugToggle:not(:checked) ~ main pre.terminal .headerblock {
        display: none;
      }
      #debugToggle:not(:checked) ~ main pre.terminal .ln {
        display: none;
      }
      #debugToggle:not(:checked) ~ main pre.terminal .row.changed {
        background: transparent;
      }
      .terminal .headerblock {
        display: block;
        opacity: 0.75;
        margin-bottom: 6px;
      }
      .terminal .row {
        display: block;
      }
      .terminal .row.changed {
        background: color-mix(in oklab, #f59e0b 18%, transparent);
      }
      .terminal .ln {
        color: color-mix(in oklab, currentColor 55%, transparent);
        user-select: none;
      }
      .marks {
        margin: 8px 0 0 18px;
        padding: 0;
      }
      .artifacts {
        margin: 8px 0 0 18px;
        padding: 0;
      }
      .artifacts li {
        margin: 4px 0;
      }
      /* asciinema-player defaults to centering in .ap-wrapper; align left in reports. */
      .cast-player .ap-wrapper {
        justify-content: flex-start;
      }
      .cast-player {
        height: 320px;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid color-mix(in oklab, currentColor 14%, transparent);
        background: color-mix(in oklab, currentColor 6%, transparent);
      }
      .cast-player.expanded {
        height: 70vh;
      }
      .cast-controls {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 8px 0 10px 0;
      }
      a {
        color: inherit;
      }
      .muted {
        opacity: 0.75;
      }
      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
      }
      .summary {
        margin-top: 18px;
        padding-top: 18px;
        border-top: 1px solid color-mix(in oklab, currentColor 20%, transparent);
      }
      /* Timeline styles */
      .timeline {
        margin: 12px 0;
        padding: 12px;
        border: 1px solid color-mix(in oklab, currentColor 14%, transparent);
        border-radius: 10px;
        background: color-mix(in oklab, currentColor 2%, transparent);
      }
      .timeline-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;
        font-size: 12px;
      }
      .timeline-track {
        position: relative;
        height: 40px;
        background: color-mix(in oklab, currentColor 6%, transparent);
        border-radius: 6px;
        cursor: pointer;
        overflow: hidden;
      }
      .timeline-bar {
        position: absolute;
        top: 0;
        height: 100%;
        min-width: 2px;
        border-radius: 3px;
        transition: opacity 0.15s;
      }
      .timeline-bar.pass {
        background: color-mix(in oklab, #16a34a 50%, transparent);
      }
      .timeline-bar.fail {
        background: color-mix(in oklab, #ef4444 70%, transparent);
      }
      .timeline-bar.info {
        background: color-mix(in oklab, #0ea5e9 40%, transparent);
      }
      .timeline-bar:hover {
        opacity: 0.8;
      }
      .timeline-bar.selected {
        box-shadow: 0 0 0 2px #0ea5e9;
      }
      .timeline-marker {
        position: absolute;
        top: 0;
        width: 2px;
        height: 100%;
        background: #f59e0b;
        z-index: 2;
      }
      .timeline-marker.error {
        background: #ef4444;
        width: 3px;
      }
      .timeline-playhead {
        position: absolute;
        top: -4px;
        width: 10px;
        height: calc(100% + 8px);
        background: #0ea5e9;
        border-radius: 2px;
        cursor: ew-resize;
        z-index: 3;
        transform: translateX(-50%);
        display: none;
      }
      /* Viewer tabs */
      .viewer-tabs {
        display: flex;
        gap: 0;
        border-bottom: 1px solid color-mix(in oklab, currentColor 14%, transparent);
        background: color-mix(in oklab, currentColor 4%, transparent);
      }
      .viewer-tab {
        padding: 8px 16px;
        border: none;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 13px;
        border-bottom: 2px solid transparent;
        opacity: 0.7;
        transition: opacity 0.15s, border-color 0.15s;
      }
      .viewer-tab:hover {
        opacity: 1;
        background: color-mix(in oklab, currentColor 4%, transparent);
      }
      .viewer-tab[aria-selected="true"] {
        opacity: 1;
        border-bottom-color: #0ea5e9;
      }
      .viewer-tab.has-error {
        color: #ef4444;
      }
      .viewer-content {
        display: none;
      }
      .viewer-content.active {
        display: block;
      }
      .viewer-content pre.terminal {
        margin: 0;
        border: none;
        border-radius: 0;
      }
      /* Call tab */
      .call-details {
        padding: 12px;
        font-size: 13px;
      }
      .call-row {
        display: grid;
        grid-template-columns: 100px 1fr;
        gap: 8px;
        margin: 4px 0;
      }
      .call-key {
        opacity: 0.7;
      }
      .call-value {
        word-break: break-all;
      }
      /* Error display */
      .error-box {
        padding: 12px;
        background: color-mix(in oklab, #ef4444 12%, transparent);
        border-left: 3px solid #ef4444;
        margin: 12px;
        border-radius: 0 6px 6px 0;
      }
      .error-title {
        font-weight: 600;
        color: #ef4444;
        margin-bottom: 8px;
      }
      .error-message {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 12px;
        white-space: pre-wrap;
        word-break: break-word;
      }
      /* Diff view */
      .diff-view {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1px;
        background: color-mix(in oklab, currentColor 14%, transparent);
      }
      .diff-pane {
        background: #0b0f14;
      }
      .diff-pane-header {
        padding: 8px 12px;
        background: color-mix(in oklab, currentColor 8%, transparent);
        font-size: 12px;
        font-weight: 600;
      }
      .diff-pane pre {
        margin: 0;
        padding: 12px;
        font-size: 11px;
        max-height: 400px;
        overflow: auto;
      }
      /* Built-in player */
      .builtin-player {
        background: #0b0f14;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid color-mix(in oklab, currentColor 14%, transparent);
      }
      .builtin-player-screen {
        padding: 12px;
        min-height: 200px;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        font-size: 13px;
        line-height: 1.4;
        color: #e6edf3;
        white-space: pre;
        overflow: auto;
      }
      .builtin-player-controls {
        display: flex;
        gap: 8px;
        align-items: center;
        padding: 10px 12px;
        background: color-mix(in oklab, #0b0f14 80%, #fff);
        border-top: 1px solid color-mix(in oklab, currentColor 14%, transparent);
      }
      .player-btn {
        padding: 6px 12px;
        border: 1px solid color-mix(in oklab, currentColor 20%, transparent);
        border-radius: 6px;
        background: color-mix(in oklab, currentColor 8%, transparent);
        color: inherit;
        cursor: pointer;
        font-size: 12px;
      }
      .player-btn:hover {
        background: color-mix(in oklab, currentColor 14%, transparent);
      }
      .player-progress {
        flex: 1;
        height: 6px;
        background: color-mix(in oklab, currentColor 14%, transparent);
        border-radius: 3px;
        cursor: pointer;
        position: relative;
      }
      .player-progress-fill {
        height: 100%;
        background: #0ea5e9;
        border-radius: 3px;
        width: 0%;
        transition: width 0.1s linear;
      }
      .player-time {
        font-size: 12px;
        min-width: 80px;
        text-align: right;
      }
      .player-speed {
        font-size: 11px;
        padding: 4px 8px;
        border-radius: 4px;
        background: color-mix(in oklab, currentColor 8%, transparent);
        cursor: pointer;
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

function jsonForHtml(data: unknown): string {
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}

function renderSnapshotViewHtml(options: {
  terminal: Terminal;
  sessionId: string;
  scope: SnapshotScope;
  hash: string;
  lines: string[];
  meta: TerminalMeta;
  lineNumbers: boolean;
  changedLines: Set<number>;
  trimRight: boolean;
}): string {
  const headerLine = formatHeaderLine({
    sessionId: options.sessionId,
    scope: options.scope,
    hash: options.hash,
    meta: options.meta,
    changedCount: options.changedLines.size,
  });

  const digits = Math.max(2, String(options.lines.length).length);
  const out: string[] = [`<span class="headerblock">${escapeHtml(headerLine)}</span>`];

  if (options.scope === "visible") {
    for (let i = 0; i < options.lines.length; i += 1) {
      const n = i + 1;
      const prefix = options.lineNumbers ? `${String(n).padStart(digits, "0")}│ ` : "";
      const prefixHtml = options.lineNumbers ? `<span class="ln">${escapeHtml(prefix)}</span>` : "";

      const contentHtml = renderVisibleRowHtml(options.terminal, i, options.trimRight);
      const rowClass = options.changedLines.has(i) ? "row changed" : "row";
      out.push(`<span class="${rowClass}">${prefixHtml}${contentHtml}</span>`);
    }

    return out.join("");
  }

  // buffer scope: currently renders plain text only
  for (let i = 0; i < options.lines.length; i += 1) {
    const n = i + 1;
    const prefix = options.lineNumbers ? `${String(n).padStart(digits, "0")}│ ` : "";
    const prefixHtml = options.lineNumbers ? `<span class="ln">${escapeHtml(prefix)}</span>` : "";
    out.push(`<span class="row">${prefixHtml}${escapeHtml(options.lines[i] ?? "")}</span>`);
  }

  return out.join("");
}

function renderVisibleRowHtml(terminal: Terminal, rowIndex: number, trimRight: boolean): string {
  const buffer = terminal.buffer.active;
  const nullCell = buffer.getNullCell();

  const startY = buffer.viewportY;
  const line = buffer.getLine(startY + rowIndex);
  const endCol = trimRight ? findMeaningfulEndCol(line, terminal.cols, nullCell) : terminal.cols;

  type Segment = { key: string; style: CellStyle; text: string };

  const segments: Segment[] = [];

  let currentKey: string | null = null;
  let currentStyle: CellStyle | null = null;
  let currentText = "";

  const flush = () => {
    if (!currentStyle) return;
    if (currentText.length === 0) return;
    segments.push({
      key: currentKey ?? styleKey(currentStyle),
      style: currentStyle,
      text: currentText,
    });
    currentText = "";
  };

  for (let x = 0; x < endCol; x += 1) {
    const cell = line?.getCell(x, nullCell);
    if (!cell) {
      if (currentStyle) {
        flush();
        currentStyle = null;
        currentKey = null;
      }
      continue;
    }

    const width = cell.getWidth();
    if (width === 0) {
      continue;
    }

    const chars = cell.getChars() || " ";
    const style = extractStyle(cell);
    const key = styleKey(style);

    if (!currentStyle) {
      currentStyle = style;
      currentKey = key;
      currentText = chars;
      continue;
    }

    if (key === currentKey) {
      currentText += chars;
      continue;
    }

    flush();
    currentStyle = style;
    currentKey = key;
    currentText = chars;
  }

  if (currentStyle) {
    flush();
  }

  return segments.map((segment) => renderSegmentHtml(segment.text, segment.style)).join("");
}

function renderSegmentHtml(text: string, style: CellStyle): string {
  const safeText = escapeHtml(text);

  if (isDefaultStyle(style)) {
    return safeText;
  }

  const css = styleToCss(style);
  if (!css) {
    return `<span class="seg">${safeText}</span>`;
  }

  return `<span class="seg" style="${css}">${safeText}</span>`;
}

function styleToCss(style: CellStyle): string {
  let fg = colorToCss(style.fg);
  let bg = colorToCss(style.bg);

  if (style.inverse) {
    const tmp = fg;
    fg = bg;
    bg = tmp;
  }

  const decls: string[] = [];

  if (fg) decls.push(`color: ${fg}`);
  if (bg) decls.push(`background-color: ${bg}`);

  if (style.bold) decls.push("font-weight: 600");
  if (style.italic) decls.push("font-style: italic");
  if (style.dim) decls.push("opacity: 0.75");

  const decorations: string[] = [];
  if (style.underline) decorations.push("underline");
  if (style.strikethrough) decorations.push("line-through");
  if (decorations.length > 0) {
    decls.push(`text-decoration: ${decorations.join(" ")}`);
  }

  return decls.join("; ");
}

function colorToCss(color: Color): string | null {
  if (color.mode === "default") return null;

  if (color.mode === "rgb") {
    const value = color.value & 0xffffff;
    return `#${value.toString(16).padStart(6, "0")}`;
  }

  const idx = clampInt(color.value, 0, 255);
  return xterm256Color(idx);
}

function xterm256Color(idx: number): string {
  const table16 = [
    "#000000",
    "#800000",
    "#008000",
    "#808000",
    "#000080",
    "#800080",
    "#008080",
    "#c0c0c0",
    "#808080",
    "#ff0000",
    "#00ff00",
    "#ffff00",
    "#0000ff",
    "#ff00ff",
    "#00ffff",
    "#ffffff",
  ];

  if (idx < 16) return table16[idx] ?? "#000000";

  if (idx >= 16 && idx <= 231) {
    const c = [0, 95, 135, 175, 215, 255];
    const n = idx - 16;

    const r = c[Math.trunc(n / 36) % 6] ?? 0;
    const g = c[Math.trunc(n / 6) % 6] ?? 0;
    const b = c[n % 6] ?? 0;

    return `rgb(${r} ${g} ${b})`;
  }

  const gray = 8 + (idx - 232) * 10;
  const v = clampInt(gray, 0, 255);
  return `rgb(${v} ${v} ${v})`;
}

function diffLineIndices(previous: string[], next: string[]): Set<number> {
  const out = new Set<number>();
  const max = Math.max(previous.length, next.length);

  for (let i = 0; i < max; i += 1) {
    const a = previous[i] ?? "";
    const b = next[i] ?? "";
    if (a !== b) out.add(i);
  }

  return out;
}

function formatHeaderLine(input: {
  sessionId: string;
  scope: SnapshotScope;
  hash: string;
  meta: TerminalMeta;
  changedCount: number;
}): string {
  const cursorAbsY = input.meta.baseY + input.meta.cursorY;
  const cursorViewportRow = cursorAbsY - input.meta.viewportY;
  const cursorViewportCol = input.meta.cursorX;

  return [
    `session=${input.sessionId}`,
    `scope=${input.scope}`,
    `size=${input.meta.cols}x${input.meta.rows}`,
    `buffer=${input.meta.bufferType}`,
    `cursor=${cursorViewportCol + 1},${cursorViewportRow + 1}`,
    `hash=${input.hash}`,
    `changed=${input.changedCount}`,
  ].join(" ");
}

function coerceDisplayString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getMeta(terminal: Terminal): TerminalMeta {
  const buffer = terminal.buffer.active;
  return {
    cols: terminal.cols,
    rows: terminal.rows,
    bufferType: buffer.type,
    viewportY: buffer.viewportY,
    baseY: buffer.baseY,
    length: buffer.length,
    cursorX: buffer.cursorX,
    cursorY: buffer.cursorY,
  };
}

function parseAsciicast(cast: string): ParsedAsciicast {
  const lines = cast.trimEnd().split("\n");
  const header = safeJsonObject(lines[0]);

  const events: AsciicastEvent[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const value = JSON.parse(line) as unknown;
    if (!Array.isArray(value) || value.length < 3) continue;

    const time = Number(value[0]);
    const type = String(value[1]);
    const data = String(value[2]);

    if (!Number.isFinite(time)) continue;

    if (type === "o" || type === "i" || type === "r" || type === "m") {
      events.push([time, type, data] as AsciicastEvent);
    }
  }

  return { header, events };
}

function safeJsonObject(line: string | undefined): Record<string, unknown> {
  if (!line) return {};
  try {
    const value = JSON.parse(line) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function getTermInfo(header: Record<string, unknown>): {
  cols: number;
  rows: number;
  type: string;
} {
  const version = Number(header.version ?? 2);

  if (version === 3) {
    const term = header.term as { cols?: unknown; rows?: unknown; type?: unknown } | undefined;
    const cols = clampInt(Number(term?.cols ?? 80), 1, 500);
    const rows = clampInt(Number(term?.rows ?? 24), 1, 300);
    const type = typeof term?.type === "string" ? term.type : "xterm-256color";
    return { cols, rows, type };
  }

  const cols = clampInt(Number(header.width ?? 80), 1, 500);
  const rows = clampInt(Number(header.height ?? 24), 1, 300);
  const type = typeof header.term === "string" ? header.term : "xterm-256color";
  return { cols, rows, type };
}

function parseResize(value: string): { cols: number; rows: number } | null {
  const match = /^\s*(\d+)x(\d+)\s*$/.exec(value);
  if (!match) return null;

  const cols = clampInt(Number(match[1] ?? 0), 1, 500);
  const rows = clampInt(Number(match[2] ?? 0), 1, 300);
  return { cols, rows };
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const int = Math.trunc(value);
  if (int < min) return min;
  if (int > max) return max;
  return int;
}

if (import.meta.main) {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: bun run src/trace/report.ts <path/to/cast>");
    process.exit(2);
  }

  const cast = await Bun.file(inputPath).text();
  const html = await generateTraceReportHtml(cast);

  const dir = dirname(inputPath);
  const base = basename(inputPath, extname(inputPath));
  const outPath = join(dir, `${base}.report.html`);

  writeFileSync(outPath, html);
  // eslint-disable-next-line no-console
  console.log(outPath);
}
