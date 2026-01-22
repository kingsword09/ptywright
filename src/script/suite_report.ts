import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";

import type { RunScriptPathResult } from "./path";

export type SuiteReportEntry = {
  filePath: string;
  durationMs: number;
  result: RunScriptPathResult;
};

export type SuiteRunFailureArtifacts = {
  lastTextPath: string;
  lastViewPath: string;
  stepPath: string;
  errorPath: string;
};

export type SuiteRunSummary = {
  version: 1;
  ok: boolean;
  dir: string;
  suiteDir: string;
  totalCount: number;
  failureCount: number;
  durationMs: number;
  reportPath: string;
  summaryPath: string;
  entries: Array<{
    filePath: string;
    filePathRel: string;
    scriptName: string;
    ok: boolean;
    durationMs: number;
    artifactsDir?: string;
    reportPath?: string;
    castPath?: string;
    error?: string;
    failureArtifacts?: SuiteRunFailureArtifacts;
  }>;
};

export function writeSuiteReportArtifacts(args: {
  dir: string;
  suiteDir: string;
  durationMs: number;
  entries: SuiteReportEntry[];
}): { reportPath: string; summaryPath: string } {
  mkdirSync(args.suiteDir, { recursive: true });

  const reportPath = join(args.suiteDir, "index.html");
  const summaryPath = join(args.suiteDir, "run.summary.json");

  const failures = args.entries.filter((e) => !e.result.ok);

  const summary: SuiteRunSummary = {
    version: 1,
    ok: failures.length === 0,
    dir: args.dir,
    suiteDir: args.suiteDir,
    totalCount: args.entries.length,
    failureCount: failures.length,
    durationMs: args.durationMs,
    reportPath,
    summaryPath,
    entries: args.entries.map((entry) => {
      const filePathRel = normalizePath(relative(process.cwd(), entry.filePath));
      const scriptName =
        entry.result.scriptName ?? basename(entry.filePath).replace(/\.(json|ts)$/i, "");

      const common = {
        filePath: entry.filePath,
        filePathRel,
        scriptName,
        ok: entry.result.ok,
        durationMs: entry.durationMs,
        artifactsDir: entry.result.artifactsDir,
        reportPath: entry.result.reportPath,
        castPath: entry.result.castPath,
      };

      if (entry.result.ok) return common;

      return {
        ...common,
        ok: false,
        error: entry.result.error,
        failureArtifacts: entry.result.failureArtifacts as SuiteRunFailureArtifacts | undefined,
      };
    }),
  };

  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  const html = renderSuiteReportHtml({ reportPath, summaryPath, summary });
  writeFileSync(reportPath, html, "utf8");

  return { reportPath, summaryPath };
}

function renderSuiteReportHtml(args: {
  reportPath: string;
  summaryPath: string;
  summary: SuiteRunSummary;
}): string {
  const title = "ptywright script report";

  const resultLabel = args.summary.ok ? "PASS" : "FAIL";
  const resultClass = args.summary.ok ? "pass" : "fail";

  const summaryHref = relativeHref(args.reportPath, args.summaryPath);

  const uiData = {
    version: 1,
    summary: {
      ok: args.summary.ok,
      dir: args.summary.dir,
      suiteDir: args.summary.suiteDir,
      totalCount: args.summary.totalCount,
      failureCount: args.summary.failureCount,
      durationMs: args.summary.durationMs,
      summaryHref,
    },
    entries: args.summary.entries.map((entry) => {
      const reportHref = entry.reportPath ? relativeHref(args.reportPath, entry.reportPath) : null;
      const castHref = entry.castPath ? relativeHref(args.reportPath, entry.castPath) : null;
      const playHref = reportHref ? `${reportHref}#cast-playback` : null;
      const lastHref =
        !entry.ok && entry.failureArtifacts?.lastViewPath
          ? relativeHref(args.reportPath, entry.failureArtifacts.lastViewPath)
          : null;
      const errorHref =
        !entry.ok && entry.failureArtifacts?.errorPath
          ? relativeHref(args.reportPath, entry.failureArtifacts.errorPath)
          : null;
      const dataKey = entry.artifactsDir ? basename(entry.artifactsDir) : null;
      const dataHref =
        entry.artifactsDir && dataKey
          ? relativeHref(args.reportPath, join(entry.artifactsDir, "test.data.js"))
          : null;

      return {
        id: entry.filePathRel,
        ok: entry.ok,
        scriptName: entry.scriptName,
        filePathRel: entry.filePathRel,
        durationMs: entry.durationMs,
        error: entry.ok ? null : (entry.error ?? null),
        artifactsDir: entry.artifactsDir ?? null,
        dataKey,
        hrefs: {
          report: reportHref,
          play: playHref,
          cast: castHref,
          last: lastHref,
          error: errorHref,
          data: dataHref,
        },
      };
    }),
  };

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
      a {
        color: inherit;
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
      .badge {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 2px 10px;
        font-size: 12px;
        border: 1px solid color-mix(in oklab, currentColor 16%, transparent);
        background: color-mix(in oklab, currentColor 6%, transparent);
      }
      .badge.pass {
        background: color-mix(in oklab, #16a34a 18%, transparent);
        border-color: color-mix(in oklab, #16a34a 45%, transparent);
      }
      .badge.fail {
        background: color-mix(in oklab, #ef4444 18%, transparent);
        border-color: color-mix(in oklab, #ef4444 45%, transparent);
      }
      header .meta {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
        opacity: 0.8;
        white-space: pre-wrap;
      }
      main {
        display: grid;
        grid-template-columns: 360px 1fr;
        min-height: calc(100vh - 110px);
      }
      aside {
        border-right: 1px solid color-mix(in oklab, currentColor 14%, transparent);
        padding: 12px;
      }
      section {
        padding: 16px;
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
      .list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .item {
        border: 1px solid color-mix(in oklab, currentColor 14%, transparent);
        border-radius: 12px;
        padding: 10px;
        cursor: pointer;
        background: color-mix(in oklab, currentColor 2%, transparent);
      }
      .item:hover {
        background: color-mix(in oklab, currentColor 6%, transparent);
      }
      .item[aria-selected="true"] {
        border-color: color-mix(in oklab, #0ea5e9 55%, transparent);
        background: color-mix(in oklab, #0ea5e9 10%, transparent);
      }
      .item .top {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .item .name {
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .item .sub {
        margin-top: 6px;
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
        opacity: 0.8;
      }
      .mono {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
          "Liberation Mono", "Courier New", monospace;
        font-size: 12px;
      }
      .error {
        color: color-mix(in oklab, #ef4444 70%, currentColor);
      }
      .kv {
        display: grid;
        grid-template-columns: 110px 1fr;
        gap: 8px 12px;
        margin-top: 12px;
      }
      .kv .k {
        opacity: 0.75;
      }
      .links {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 10px;
      }
      .muted {
        opacity: 0.75;
      }
      @media (max-width: 920px) {
        main {
          grid-template-columns: 1fr;
        }
        aside {
          border-right: none;
          border-bottom: 1px solid color-mix(in oklab, currentColor 14%, transparent);
        }
      }
    </style>
  </head>
  <body>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <div class="badges">
        <span class="badge ${resultClass}">result=${escapeHtml(resultLabel)}</span>
        <span class="badge">count=${args.summary.totalCount}</span>
        <span class="badge">failures=${args.summary.failureCount}</span>
        <span class="badge">duration=${escapeHtml(formatDuration(args.summary.durationMs))}</span>
      </div>
      <div class="meta">dir=${escapeHtml(args.summary.dir)}
summary=<a href="${escapeHtml(summaryHref)}">run.summary.json</a></div>
    </header>
    <main>
      <aside>
        <div class="controls">
          <input id="search" class="input mono" placeholder="Search…" autocomplete="off" />
          <button id="filterAll" class="badge chip" type="button" aria-pressed="true">all</button>
          <button id="filterPass" class="badge chip pass" type="button" aria-pressed="false">pass</button>
          <button id="filterFail" class="badge chip fail" type="button" aria-pressed="false">fail</button>
          <span id="visibleCount" class="badge">visible=0</span>
        </div>
        <ol id="list" class="list"></ol>
      </aside>
      <section>
        <div id="details">
          <div class="muted">Select a test from the left.</div>
        </div>
      </section>
    </main>
    <script id="suiteData" type="application/json">${jsonForHtml(uiData)}</script>
    <script>
      (function () {
        const dataEl = document.getElementById("suiteData");
        const listEl = document.getElementById("list");
        const detailsEl = document.getElementById("details");
        const searchEl = document.getElementById("search");
        const visibleCountEl = document.getElementById("visibleCount");
        const filterAllEl = document.getElementById("filterAll");
        const filterPassEl = document.getElementById("filterPass");
        const filterFailEl = document.getElementById("filterFail");
        if (!dataEl || !listEl || !detailsEl || !searchEl) return;

        /** @type {{entries: any[]}} */
        const raw = JSON.parse(dataEl.textContent || "{}");
        const entries = Array.isArray(raw.entries) ? raw.entries : [];
        let filter = "all";
        let selectedId = null;
        const dataLoaders = Object.create(null);

        function setPressed(el, on) {
          el.setAttribute("aria-pressed", on ? "true" : "false");
        }

        function applyFilter() {
          const q = (searchEl.value || "").trim().toLowerCase();
          const out = [];
          for (const e of entries) {
            if (!e) continue;
            if (filter === "pass" && !e.ok) continue;
            if (filter === "fail" && e.ok) continue;
            if (q) {
              const hay = (e.scriptName + " " + e.filePathRel).toLowerCase();
              if (!hay.includes(q)) continue;
            }
            out.push(e);
          }
          renderList(out);
          if (visibleCountEl) visibleCountEl.textContent = "visible=" + out.length;
        }

        function renderList(items) {
          listEl.textContent = "";
          for (const e of items) {
            const li = document.createElement("li");
            li.className = "item";
            li.setAttribute("role", "option");
            li.dataset.id = e.id;
            li.setAttribute("aria-selected", e.id === selectedId ? "true" : "false");

            const top = document.createElement("div");
            top.className = "top";
            const badge = document.createElement("span");
            badge.className = "badge " + (e.ok ? "pass" : "fail");
            badge.textContent = e.ok ? "PASS" : "FAIL";
            const name = document.createElement("div");
            name.className = "name";
            name.textContent = e.scriptName;
            top.appendChild(badge);
            top.appendChild(name);

            const sub = document.createElement("div");
            sub.className = "sub";
            const file = document.createElement("span");
            file.textContent = e.filePathRel;
            const dur = document.createElement("span");
            dur.textContent = "dur=" + (e.durationMs < 1000 ? e.durationMs + "ms" : (e.durationMs / 1000).toFixed(2) + "s");
            sub.appendChild(file);
            sub.appendChild(dur);

            li.appendChild(top);
            li.appendChild(sub);
            li.addEventListener("click", function () {
              selectedId = e.id;
              applyFilter();
              renderDetails(e);
            });
            listEl.appendChild(li);
          }
        }

        function linkHtml(href, label) {
          if (!href) return "";
          return '<a class="mono" href="' + href.replaceAll('"', "&quot;") + '">' + label + "</a>";
        }

        function escapeText(s) {
          return (s || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;");
        }

        function getTestData(e) {
          const store = globalThis.__ptywright && globalThis.__ptywright.tests;
          if (!store || !e || !e.dataKey) return null;
          return store[e.dataKey] || null;
        }

        function ensureTestDataLoaded(e, cb) {
          if (!e || !e.hrefs || !e.hrefs.data || !e.dataKey) return cb(null);
          const existing = getTestData(e);
          if (existing) return cb(existing);

          if (dataLoaders[e.dataKey]) {
            dataLoaders[e.dataKey].push(cb);
            return;
          }
          dataLoaders[e.dataKey] = [cb];

          const script = document.createElement("script");
          script.src = e.hrefs.data;
          script.async = true;
          script.onload = function () {
            const loaded = getTestData(e);
            const cbs = dataLoaders[e.dataKey] || [];
            delete dataLoaders[e.dataKey];
            for (const fn of cbs) fn(loaded);
          };
          script.onerror = function () {
            const cbs = dataLoaders[e.dataKey] || [];
            delete dataLoaders[e.dataKey];
            for (const fn of cbs) fn(null);
          };
          document.head.appendChild(script);
        }

        function renderDetails(e) {
          const links = [
            linkHtml(e.hrefs && e.hrefs.report, "report"),
            linkHtml(e.hrefs && e.hrefs.play, "play"),
            linkHtml(e.hrefs && e.hrefs.cast, "cast"),
            linkHtml(e.hrefs && e.hrefs.last, "last"),
            linkHtml(e.hrefs && e.hrefs.error, "error"),
          ].filter(Boolean);

          const data = getTestData(e);
          const stepsHtml = (() => {
            if (data && Array.isArray(data.steps)) {
              const rows = data.steps
                .map(function (s) {
                  const badge = '<span class="badge ' + (s.ok ? "pass" : "fail") + '">' + (s.ok ? "PASS" : "FAIL") + "</span>";
                  const dur = typeof s.durationMs === "number"
                    ? (s.durationMs < 1000 ? s.durationMs + "ms" : (s.durationMs / 1000).toFixed(2) + "s")
                    : "";
                  const err = !s.ok && s.error ? '<div class="mono error" style="margin-top: 4px;">' + escapeText(s.error) + "</div>" : "";
                  return '<div class="item" style="cursor: default;">' +
                    '<div class="top">' + badge +
                    '<div class="name mono" style="font-weight: 600;">' + escapeText(s.label || s.type || "") + "</div>" +
                    "</div>" +
                    '<div class="sub"><span>step=' + escapeText(String(s.index)) + "</span><span>dur=" + escapeText(dur) + "</span></div>" +
                    err +
                    "</div>";
                })
                .join("");
              return '<h3 style="margin: 16px 0 8px 0;">Steps</h3>' +
                '<div class="muted mono">count=' + escapeText(String(data.stepCount || data.steps.length)) + "</div>" +
                '<div style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">' + rows + "</div>";
            }

            if (e.hrefs && e.hrefs.data && e.dataKey) {
              return '<h3 style="margin: 16px 0 8px 0;">Steps</h3>' +
                '<div class="muted">Step details are available. Click to load.</div>' +
                '<div style="margin-top: 10px;">' +
                  '<button id="loadSteps" class="badge chip" type="button">load steps</button>' +
                "</div>";
            }

            return "";
          })();

          detailsEl.innerHTML =
            '<div class="badges">' +
              '<span class="badge ' + (e.ok ? "pass" : "fail") + '">status=' + (e.ok ? "PASS" : "FAIL") + "</span>" +
              '<span class="badge">duration=' + (e.durationMs < 1000 ? e.durationMs + "ms" : (e.durationMs / 1000).toFixed(2) + "s") + "</span>" +
            "</div>" +
            '<h2 style="margin: 10px 0 6px 0;">' + escapeText(e.scriptName) + "</h2>" +
            '<div class="kv mono">' +
              '<div class="k">file</div><div class="v">' + escapeText(e.filePathRel) + "</div>" +
              '<div class="k">artifacts</div><div class="v">' +
                (e.artifactsDir
                  ? escapeText(e.artifactsDir)
                  : '<span class="muted">(none)</span>') +
              "</div>" +
            "</div>" +
            (links.length ? '<div class="links">' + links.join(" ") + "</div>" : "") +
            (!e.ok && e.error ? '<pre class="mono error" style="margin-top: 12px; white-space: pre-wrap;">' + escapeText(e.error) + "</pre>" : "") +
            stepsHtml;

          const loadBtn = document.getElementById("loadSteps");
          if (loadBtn) {
            loadBtn.addEventListener("click", function () {
              ensureTestDataLoaded(e, function () {
                renderDetails(e);
              });
            });
          }
        }

        filterAllEl.addEventListener("click", function () {
          filter = "all";
          setPressed(filterAllEl, true);
          setPressed(filterPassEl, false);
          setPressed(filterFailEl, false);
          applyFilter();
        });
        filterPassEl.addEventListener("click", function () {
          filter = "pass";
          setPressed(filterAllEl, false);
          setPressed(filterPassEl, true);
          setPressed(filterFailEl, false);
          applyFilter();
        });
        filterFailEl.addEventListener("click", function () {
          filter = "fail";
          setPressed(filterAllEl, false);
          setPressed(filterPassEl, false);
          setPressed(filterFailEl, true);
          applyFilter();
        });
        searchEl.addEventListener("input", applyFilter);

        applyFilter();
        if (entries[0]) {
          selectedId = entries[0].id;
          renderDetails(entries[0]);
          applyFilter();
        }
      })();
    </script>
  </body>
</html>`;
}

function jsonForHtml(data: unknown): string {
  return JSON.stringify(data).replaceAll("<", "\\u003c");
}

function formatDuration(ms: number): string {
  const safe = Math.max(0, Math.trunc(ms));
  if (safe < 1000) return `${safe}ms`;
  return `${(safe / 1000).toFixed(2)}s`;
}

function relativeHref(fromFile: string, toFile: string): string {
  const rel = relative(dirname(fromFile), toFile);
  const normalized = normalizePath(rel);
  return normalized.startsWith(".") ? normalized : `./${normalized}`;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
