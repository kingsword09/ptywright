import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { expect, test } from "bun:test";
import { chromium } from "playwright";

import { writeAgentReport } from "../src/agent/report";
import type { AgentRunResult } from "../src/agent/runner";

type AittyReportFixture = {
  artifactsDir: string;
  distDir: string;
  frontendDir: string;
  packageDir: string;
  runnerDir: string;
};

function createAittyReportFixture(name: string): AittyReportFixture {
  const projectDir = resolve(".tmp", "tests", `${name}-project`);
  const runnerDir = resolve(".tmp", "tests", `${name}-runner-cwd`);
  const artifactsDir = join(projectDir, "artifacts");
  const packageDir = join(projectDir, "node_modules", "@aitty", "browser");
  const distDir = join(packageDir, "dist");
  const frontendDir = join(distDir, "frontend");

  rmSync(projectDir, { recursive: true, force: true });
  rmSync(runnerDir, { recursive: true, force: true });
  mkdirSync(artifactsDir, { recursive: true });
  mkdirSync(runnerDir, { recursive: true });
  mkdirSync(frontendDir, { recursive: true });
  writeFileSync(join(projectDir, "package.json"), JSON.stringify({ type: "module" }), "utf8");
  writeFileSync(join(runnerDir, "package.json"), JSON.stringify({ type: "module" }), "utf8");

  return { artifactsDir, distDir, frontendDir, packageDir, runnerDir };
}

function writeAittyBrowserPackage(
  fixture: AittyReportFixture,
  options: {
    globalScript?: string;
    moduleScript?: string;
    style?: string;
  },
): void {
  const exports: Record<string, string> = {
    "./style.css": "./dist/frontend/terminal.css",
  };

  if (options.globalScript !== undefined) {
    exports["./web-component.global.js"] = "./dist/web-component.global.js";
  }
  if (options.moduleScript !== undefined) {
    exports["./web-component.js"] = "./dist/web-component.js";
  }

  writeFileSync(
    join(fixture.packageDir, "package.json"),
    JSON.stringify({
      name: "@aitty/browser",
      type: "module",
      exports,
    }),
    "utf8",
  );

  if (options.globalScript !== undefined) {
    writeFileSync(join(fixture.distDir, "web-component.global.js"), options.globalScript, "utf8");
  }
  if (options.moduleScript !== undefined) {
    writeFileSync(join(fixture.distDir, "web-component.js"), options.moduleScript, "utf8");
  }

  writeFileSync(
    join(fixture.frontendDir, "terminal.css"),
    options.style ?? ".aitty-terminal-root {}\n",
    "utf8",
  );
}

function extractFirstStyleBlock(html: string): string {
  return /<style>\n([\s\S]*?)\n    <\/style>/.exec(html)?.[1] ?? "";
}

function writeSingleDomAgentReport(args: {
  domHtml: string;
  fixture: AittyReportFixture;
  launchArgs?: string[];
  name: string;
}): {
  copiedScriptPath: string;
  copiedStylePath: string;
  domPreviewPath: string;
  domViewerPath: string;
} {
  const { artifactsDir, runnerDir } = args.fixture;
  const snapshotDir = join(artifactsDir, "snapshots");
  const reportPath = join(artifactsDir, "index.html");
  const flowPath = join(artifactsDir, `${args.name}.flow.json`);
  const cassettePath = join(artifactsDir, `${args.name}.cassette.json`);
  const recordPath = join(artifactsDir, `${args.name}.agent-run.json`);
  const domPath = join(artifactsDir, "mobile.ready.dom.html");
  const launchArgs = args.launchArgs ?? [];

  writeFileSync(domPath, args.domHtml, "utf8");
  writeFileSync(
    flowPath,
    JSON.stringify({ launch: { mode: "command", args: launchArgs } }, null, 2),
    "utf8",
  );
  writeFileSync(
    cassettePath,
    JSON.stringify({ spec: { launch: { args: launchArgs } } }, null, 2),
    "utf8",
  );

  const originalCwd = process.cwd();
  try {
    process.chdir(runnerDir);
    writeAgentReport(reportPath, {
      ok: true,
      name: args.name,
      mode: "replay",
      agentFlavor: "claude",
      startedAt: Date.parse("2026-05-25T00:00:00.000Z"),
      durationMs: 7,
      artifactsDir,
      snapshotDir,
      reportPath,
      recordPath,
      flowPath,
      cassettePath,
      replayCommand: `ptywright agent replay ${args.name}.agent-run.json`,
      commands: {
        replay: {
          argv: ["ptywright", "agent", "replay", `${args.name}.agent-run.json`],
        },
        updateSnapshots: {
          argv: [
            "ptywright",
            "agent",
            "replay",
            `${args.name}.agent-run.json`,
            "--update-snapshots",
          ],
        },
      },
      viewports: [{ name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true }],
      cassetteFrameCount: 1,
      steps: [],
      artifacts: [
        {
          name: "ready",
          viewport: "mobile",
          kind: "dom",
          path: domPath,
          baselinePath: join(snapshotDir, "mobile.ready.dom.snap.html"),
          hash: "domhash",
          ok: true,
        },
      ],
      errors: [],
    } satisfies AgentRunResult);
  } finally {
    process.chdir(originalCwd);
  }

  return {
    copiedScriptPath: join(artifactsDir, "assets", "aitty-web-component.js"),
    copiedStylePath: join(artifactsDir, "assets", "aitty-terminal.css"),
    domPreviewPath: join(artifactsDir, "mobile.ready.dom.preview.html"),
    domViewerPath: join(artifactsDir, "mobile.ready.dom.viewer.html"),
  };
}

test("agent report links terminal artifacts to fullscreen viewport viewers", () => {
  const fixture = createAittyReportFixture("agent-report");
  writeAittyBrowserPackage(fixture, {
    globalScript: "globalThis.AittyBrowser = {};\n",
    moduleScript: "export {};\n",
  });

  const { artifactsDir, runnerDir } = fixture;
  const snapshotDir = join(artifactsDir, "snapshots");

  const terminalPath = join(artifactsDir, "mobile.ready.terminal.txt");
  const domPath = join(artifactsDir, "mobile.ready.dom.html");
  const screenshotPath = join(artifactsDir, "mobile.ready.png");
  writeFileSync(terminalPath, "Ready\n\u001b[32;1m> status\u001b[0m\n", "utf8");
  writeFileSync(
    domPath,
    [
      '<div class="term-grid" data-cols="41" data-rows="8" style="--term-cols: 41; --term-rows: 8;">',
      '<div class="term-wide-row-block" data-aitty-wide-block="true" style="--aitty-wide-block-cols: 96;">',
      '<div class="term-row" data-aitty-line-cols="96"><span style="color: var(--term-color-2); width: calc(var(--term-cell-width, 1ch) * 96);">wide output</span></div>',
      "</div>",
      '<div class="term-row"><span class="term-cursor" style="width: var(--term-cell-width, 1ch);"></span></div>',
      "</div>",
    ].join(""),
    "utf8",
  );
  writeFileSync(screenshotPath, "fake image", "utf8");

  const reportPath = join(artifactsDir, "index.html");
  const flowPath = join(artifactsDir, "agent_report_fixture.flow.json");
  writeFileSync(
    flowPath,
    JSON.stringify(
      {
        launch: {
          mode: "url",
          url: "http://127.0.0.1:3000/",
        },
      },
      null,
      2,
    ),
    "utf8",
  );
  const cassettePath = join(artifactsDir, "agent_report_fixture.cassette.json");
  writeFileSync(
    cassettePath,
    JSON.stringify(
      {
        spec: {
          launch: {
            args: [
              "exec",
              "--experimental-screen-mode",
              "termvision",
              "--theme",
              "light",
              "--font-size",
              "14",
            ],
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const originalCwd = process.cwd();
  try {
    process.chdir(runnerDir);
    writeAgentReport(reportPath, {
      ok: true,
      name: "agent_report_fixture",
      mode: "replay",
      agentFlavor: "codex",
      startedAt: Date.parse("2026-05-25T00:00:00.000Z"),
      durationMs: 12,
      artifactsDir,
      snapshotDir,
      reportPath,
      recordPath: join(artifactsDir, "agent_report_fixture.agent-run.json"),
      flowPath,
      cassettePath,
      replayCommand: "ptywright agent replay agent_report_fixture.agent-run.json",
      commands: {
        replay: { argv: ["ptywright", "agent", "replay", "agent_report_fixture.agent-run.json"] },
        updateSnapshots: {
          argv: [
            "ptywright",
            "agent",
            "replay",
            "agent_report_fixture.agent-run.json",
            "--update-snapshots",
          ],
        },
      },
      viewports: [{ name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true }],
      cassetteFrameCount: 1,
      steps: [],
      artifacts: [
        {
          name: "ready",
          viewport: "mobile",
          kind: "terminal",
          path: terminalPath,
          baselinePath: join(snapshotDir, "mobile.ready.terminal.snap.txt"),
          hash: "terminalhash",
          ok: true,
        },
        {
          name: "ready",
          viewport: "mobile",
          kind: "dom",
          path: domPath,
          baselinePath: join(snapshotDir, "mobile.ready.dom.snap.html"),
          hash: "domhash",
          ok: true,
        },
        {
          name: "ready",
          viewport: "mobile",
          kind: "screenshot",
          path: screenshotPath,
          ok: true,
        },
      ],
      errors: [],
    } satisfies AgentRunResult);
  } finally {
    process.chdir(originalCwd);
  }

  const report = readFileSync(reportPath, "utf8");
  const terminalViewerPath = join(artifactsDir, "mobile.ready.terminal.viewer.html");
  const domViewerPath = join(artifactsDir, "mobile.ready.dom.viewer.html");
  const domPreviewPath = join(artifactsDir, "mobile.ready.dom.preview.html");
  const terminalViewer = readFileSync(terminalViewerPath, "utf8");
  const domViewer = readFileSync(domViewerPath, "utf8");
  const domPreview = readFileSync(domPreviewPath, "utf8");

  expect(existsSync(terminalViewerPath)).toBe(true);
  expect(existsSync(domViewerPath)).toBe(true);
  expect(existsSync(domPreviewPath)).toBe(true);
  expect(report).toContain('<a href="mobile.ready.terminal.viewer.html">terminal</a>');
  expect(report).toContain('<a href="mobile.ready.dom.viewer.html">dom</a>');
  expect(report).toContain('<a href="mobile.ready.terminal.txt">raw</a>');
  expect(report).toContain('<a href="mobile.ready.dom.html">raw</a>');
  expect(report).toContain('<a href="mobile.ready.png">screenshot</a>');
  expect(report).not.toContain("wide output");
  expect(report).not.toContain("terminal-text-preview");
  expect(report).not.toContain("dom-viewer-frame");

  expect(terminalViewer).not.toContain('<pre class="raw-artifact-text"');
  expect(terminalViewer).toContain("dom-viewer-frame");
  expect(terminalViewer).toContain('sandbox="allow-same-origin allow-scripts"');
  expect(terminalViewer).toContain('src="mobile.ready.dom.preview.html"');
  expect(terminalViewer).toContain('data-report-screen-mode="termvision"');
  expect(terminalViewer).toContain('data-theme="light"');
  expect(terminalViewer).toContain("--config-viewport-width: 390px;");
  expect(terminalViewer).toContain("--config-viewport-height: 844px;");
  expect(terminalViewer).toContain("width: var(--config-viewport-width);");
  expect(terminalViewer).toContain("height: var(--config-viewport-height);");
  expect(terminalViewer).not.toContain("raw-artifact-viewport");
  expect(terminalViewer).not.toContain("data-ptywright-report-pan");

  expect(domViewer).toContain("dom-viewer-frame");
  expect(domViewer).toContain('sandbox="allow-same-origin allow-scripts"');
  expect(domViewer).toContain('src="mobile.ready.dom.preview.html"');
  expect(domViewer).toContain('data-mobile="true"');
  expect(domViewer).toContain('data-screen-mode="termvision"');
  expect(domViewer).toContain('data-theme="light"');
  expect(domViewer).toContain("--config-viewport-width: 390px;");
  expect(domViewer).toContain("--config-viewport-height: 844px;");
  expect(domViewer).not.toContain("wide output");
  expect(domViewer).not.toContain("raw-artifact-viewport");
  expect(domViewer).not.toContain("data-ptywright-report-pan");

  expect(domPreview).toContain('screen-mode="termvision"');
  expect(domPreview).toContain('theme="light"');
  expect(domPreview).toContain('font-size="14"');
  expect(domPreview).toContain('line-height="1.6"');
  expect(domPreview).toContain('<link rel="stylesheet" href="assets/aitty-terminal.css" />');
  expect(domPreview).toContain('<script src="assets/aitty-web-component.js"></script>');
  expect(domPreview.match(/<aitty-snapshot\b/g)?.length).toBe(1);
  expect(domPreview).toContain("wide output");
  expect(domPreview).not.toContain("ptywright-terminal-fallback");
  expect(domPreview).not.toContain("ptywright-terminal-root");
  expect(domPreview).not.toContain("data-ptywright-report-scroll-viewport");
  expect(domPreview).not.toContain("data-ptywright-report-dom-renderer");
  expect(domPreview).not.toContain("data-ptywright-report-aitty-assets");
  expect(domPreview).not.toContain("--theme-term-bg:");
  expect(domPreview).not.toContain("--theme-term-color-0:");
  expect(domPreview).not.toContain("--theme-term-font-size:");
  expect(domPreview).not.toContain("--ptywright-report-terminal-padding-inline");
  expect(domPreview).not.toContain("--term-cell-width:");
});

test("agent report does not copy Aitty assets when no DOM preview is needed", () => {
  const fixture = createAittyReportFixture("agent-report-terminal-only-aitty-assets");
  writeAittyBrowserPackage(fixture, {
    globalScript: "globalThis.AittyBrowser = {};\n",
    moduleScript: "export {};\n",
  });

  const { artifactsDir, runnerDir } = fixture;
  const snapshotDir = join(artifactsDir, "snapshots");
  const reportPath = join(artifactsDir, "index.html");
  const flowPath = join(artifactsDir, "agent_report_terminal_only.flow.json");
  const cassettePath = join(artifactsDir, "agent_report_terminal_only.cassette.json");
  const terminalPath = join(artifactsDir, "mobile.ready.terminal.txt");
  writeFileSync(terminalPath, "Ready\n\u001b[32mterminal only\u001b[0m\n", "utf8");
  writeFileSync(
    flowPath,
    JSON.stringify({ launch: { mode: "command", args: ["exec"] } }, null, 2),
    "utf8",
  );
  writeFileSync(
    cassettePath,
    JSON.stringify({ spec: { launch: { args: ["exec"] } } }, null, 2),
    "utf8",
  );

  const originalCwd = process.cwd();
  try {
    process.chdir(runnerDir);
    writeAgentReport(reportPath, {
      ok: true,
      name: "agent_report_terminal_only",
      mode: "replay",
      agentFlavor: "claude",
      startedAt: Date.parse("2026-05-25T00:00:00.000Z"),
      durationMs: 7,
      artifactsDir,
      snapshotDir,
      reportPath,
      recordPath: join(artifactsDir, "agent_report_terminal_only.agent-run.json"),
      flowPath,
      cassettePath,
      replayCommand: "ptywright agent replay agent_report_terminal_only.agent-run.json",
      commands: {
        replay: {
          argv: ["ptywright", "agent", "replay", "agent_report_terminal_only.agent-run.json"],
        },
        updateSnapshots: {
          argv: [
            "ptywright",
            "agent",
            "replay",
            "agent_report_terminal_only.agent-run.json",
            "--update-snapshots",
          ],
        },
      },
      viewports: [{ name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true }],
      cassetteFrameCount: 1,
      steps: [],
      artifacts: [
        {
          name: "ready",
          viewport: "mobile",
          kind: "terminal",
          path: terminalPath,
          baselinePath: join(snapshotDir, "mobile.ready.terminal.snap.txt"),
          hash: "terminalhash",
          ok: true,
        },
      ],
      errors: [],
    } satisfies AgentRunResult);
  } finally {
    process.chdir(originalCwd);
  }

  const terminalViewer = readFileSync(
    join(artifactsDir, "mobile.ready.terminal.viewer.html"),
    "utf8",
  );

  expect(existsSync(join(artifactsDir, "assets", "aitty-web-component.js"))).toBe(false);
  expect(existsSync(join(artifactsDir, "assets", "aitty-terminal.css"))).toBe(false);
  expect(existsSync(join(artifactsDir, "mobile.ready.dom.preview.html"))).toBe(false);
  expect(terminalViewer).toContain('<pre class="raw-artifact-text"');
  expect(terminalViewer).toContain("raw-artifact-viewport");
  expect(terminalViewer).toContain('<span style="color: #7ee787">terminal only</span>');
  expect(terminalViewer).toContain("data-ptywright-report-pan");
  expect(terminalViewer).toContain("cursor: grab;");
  expect(terminalViewer).not.toContain("style.cursor");
  expect(terminalViewer).not.toContain("terminal-text-viewer");
  expect(terminalViewer).not.toContain("terminal-viewport");
  expect(terminalViewer).not.toContain('<iframe class="dom-viewer-frame"');
  expect(terminalViewer).not.toContain("allow-scripts");
  expect(terminalViewer).not.toContain("assets/aitty-web-component.js");
  expect(terminalViewer).toContain('document.querySelectorAll(".raw-artifact-viewport")');
  expect(terminalViewer).not.toContain("enhanceTermvisionDocument");
  expect(terminalViewer).not.toContain("[data-terminal-root]");
  expect(terminalViewer).not.toContain("[data-ptywright-report-scroll-viewport]");
  expect(terminalViewer).not.toContain(".term-wide-row-block");
});

test("agent report falls back to raw viewers when Aitty assets are unavailable", () => {
  const fixture = createAittyReportFixture("agent-report-no-aitty-assets");
  const { artifactsDir, runnerDir } = fixture;
  const snapshotDir = join(artifactsDir, "snapshots");
  const reportPath = join(artifactsDir, "index.html");
  const flowPath = join(artifactsDir, "agent_report_no_aitty.flow.json");
  const cassettePath = join(artifactsDir, "agent_report_no_aitty.cassette.json");
  const terminalPath = join(artifactsDir, "mobile.ready.terminal.txt");
  const domPath = join(artifactsDir, "mobile.ready.dom.html");

  writeFileSync(terminalPath, "Ready\n\u001b[32mterminal fallback\u001b[0m\n", "utf8");
  writeFileSync(
    domPath,
    [
      '<div class="term-grid" data-cols="41" data-rows="1">',
      '<div class="term-row"><span>dom fallback</span></div>',
      "</div>",
    ].join(""),
    "utf8",
  );
  writeFileSync(
    flowPath,
    JSON.stringify({ launch: { mode: "command", args: ["exec"] } }, null, 2),
    "utf8",
  );
  writeFileSync(
    cassettePath,
    JSON.stringify({ spec: { launch: { args: ["exec"] } } }, null, 2),
    "utf8",
  );

  const originalCwd = process.cwd();
  try {
    process.chdir(runnerDir);
    writeAgentReport(reportPath, {
      ok: true,
      name: "agent_report_no_aitty",
      mode: "replay",
      agentFlavor: "claude",
      startedAt: Date.parse("2026-05-25T00:00:00.000Z"),
      durationMs: 7,
      artifactsDir,
      snapshotDir,
      reportPath,
      recordPath: join(artifactsDir, "agent_report_no_aitty.agent-run.json"),
      flowPath,
      cassettePath,
      replayCommand: "ptywright agent replay agent_report_no_aitty.agent-run.json",
      commands: {
        replay: {
          argv: ["ptywright", "agent", "replay", "agent_report_no_aitty.agent-run.json"],
        },
        updateSnapshots: {
          argv: [
            "ptywright",
            "agent",
            "replay",
            "agent_report_no_aitty.agent-run.json",
            "--update-snapshots",
          ],
        },
      },
      viewports: [{ name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true }],
      cassetteFrameCount: 1,
      steps: [],
      artifacts: [
        {
          name: "ready",
          viewport: "mobile",
          kind: "terminal",
          path: terminalPath,
          baselinePath: join(snapshotDir, "mobile.ready.terminal.snap.txt"),
          hash: "terminalhash",
          ok: true,
        },
        {
          name: "ready",
          viewport: "mobile",
          kind: "dom",
          path: domPath,
          baselinePath: join(snapshotDir, "mobile.ready.dom.snap.html"),
          hash: "domhash",
          ok: true,
        },
      ],
      errors: [],
    } satisfies AgentRunResult);
  } finally {
    process.chdir(originalCwd);
  }

  const terminalViewer = readFileSync(
    join(artifactsDir, "mobile.ready.terminal.viewer.html"),
    "utf8",
  );
  const domViewer = readFileSync(join(artifactsDir, "mobile.ready.dom.viewer.html"), "utf8");

  expect(existsSync(join(artifactsDir, "assets", "aitty-web-component.js"))).toBe(false);
  expect(existsSync(join(artifactsDir, "assets", "aitty-terminal.css"))).toBe(false);
  expect(existsSync(join(artifactsDir, "mobile.ready.dom.preview.html"))).toBe(false);
  expect(terminalViewer).toContain('<pre class="raw-artifact-text"');
  expect(terminalViewer).toContain("terminal fallback");
  expect(terminalViewer).not.toContain('<iframe class="dom-viewer-frame"');
  expect(terminalViewer).not.toContain("mobile.ready.dom.preview.html");
  expect(domViewer).toContain('<pre class="raw-artifact-text"');
  expect(domViewer).toContain("dom fallback");
  expect(domViewer).toContain("&lt;div");
  expect(domViewer).not.toContain('<iframe class="dom-viewer-frame"');
  expect(domViewer).not.toContain("mobile.ready.dom.preview.html");
});

test("agent report prefers the Aitty global web component for file reports", () => {
  const fixture = createAittyReportFixture("agent-report-aitty-assets");
  writeAittyBrowserPackage(fixture, {
    globalScript: "globalThis.AittyBrowser = {};\n",
    moduleScript: "export {};\n",
  });
  const paths = writeSingleDomAgentReport({
    fixture,
    name: "agent_report_aitty_assets",
    domHtml: [
      '<div class="term-grid" data-cols="41" data-rows="1" style="--term-cols: 41; --term-rows: 1;">',
      '<div class="term-wide-row-block" data-aitty-wide-block="true" style="--aitty-wide-block-cols: 120;">',
      '<div class="term-row" data-aitty-line-cols="120"><span>wide output</span></div>',
      "</div>",
      "</div>",
    ].join(""),
  });

  const domViewer = readFileSync(paths.domViewerPath, "utf8");
  const domPreview = readFileSync(paths.domPreviewPath, "utf8");
  const domPreviewStyle = extractFirstStyleBlock(domPreview);
  const copiedScript = readFileSync(paths.copiedScriptPath, "utf8");
  const copiedStyle = readFileSync(paths.copiedStylePath, "utf8");

  expect(domViewer).toContain('sandbox="allow-same-origin allow-scripts"');
  expect(domViewer).not.toContain("<script>");
  expect(domViewer).not.toContain('ptywrightReportAittyAssets === "true"');
  expect(domViewer).not.toContain("ptywrightReportDomRenderer");
  expect(domViewer).not.toContain("isHtmlElement");
  expect(domViewer).not.toContain("enableViewportPan");
  expect(domViewer).not.toContain("raw-artifact-viewport");
  expect(domViewer).not.toContain("raw-artifact-text");
  expect(domViewer).not.toContain("data-ptywright-report-pan");
  expect(domPreview).toContain('<link rel="stylesheet" href="assets/aitty-terminal.css" />');
  expect(domPreview).toContain('<script src="assets/aitty-web-component.js"></script>');
  expect(domPreview).not.toContain('type="module"');
  expect(domPreview).not.toContain("data-ptywright-report-dom-renderer");
  expect(domPreview).not.toContain("data-ptywright-report-aitty-assets");
  expect(domPreview).not.toContain("document.documentElement.dataset.ptywrightReportAittyAssets");
  expect(domPreview).toContain("<aitty-snapshot");
  expect(domPreview.match(/<aitty-snapshot\b/g)?.length).toBe(1);
  expect(domPreview).not.toContain('class="ptywright-aitty-snapshot"');
  expect(domPreview).not.toContain("aittyReportAittyAssets");
  expect(domPreview).not.toContain("data-aitty-report-screen-mode");
  expect(domPreview).not.toContain("--theme-term-padding-inline");
  expect(domPreview).toContain('font-size="15"');
  expect(domPreview).toContain('line-height="1.6"');
  expect(domPreviewStyle).not.toContain("--theme-term-bg:");
  expect(domPreviewStyle).not.toContain("--theme-term-color-0:");
  expect(domPreviewStyle).not.toContain("--theme-term-cursor:");
  expect(domPreviewStyle).not.toContain("--theme-term-font-size:");
  expect(domPreviewStyle).not.toContain("--theme-term-line-height:");
  expect(domPreviewStyle).not.toContain("--term-cols:");
  expect(domPreviewStyle).not.toContain("--term-rows:");
  expect(domPreviewStyle).not.toContain("--term-cell-width:");
  expect(domPreviewStyle).not.toContain("--aitty-report-viewport-width:");
  expect(domPreviewStyle).not.toContain("--aitty-report-viewport-height:");
  expect(domPreview).not.toContain("[data-aitty-viewport-pan");
  expect(domPreview).not.toContain("aitty-scroll-viewport");
  expect(domPreview).not.toContain('class="aitty-shell"');
  expect(domPreview).not.toContain("data-aitty-scroll-target");
  expect(domPreview).not.toContain("data-aitty-scroll-content");
  expect(domPreview).not.toContain("aitty-terminal-root terminal-root wterm has-scrollback");
  expect(domPreview).not.toContain('data-client-role="viewer"');
  expect(domPreview).not.toContain('data-runtime="snapshot"');
  expect(domPreview).not.toContain(".aitty-report-snapshot .aitty-terminal-root");
  expect(domPreview).not.toContain(".aitty-report-snapshot .term-row");
  expect(domPreview).not.toContain(".aitty-report-snapshot .term-wide-row-block");
  expect(domPreview).not.toContain("scrollbar-width: none");
  expect(domPreview).not.toContain("aitty-report-snapshot");
  expect(domPreview).not.toContain("ptywright-terminal-fallback");
  expect(domPreview).not.toContain("data-ptywright-report-scroll-viewport");
  expect(copiedScript).toBe("globalThis.AittyBrowser = {};\n");
  expect(copiedStyle).toBe(".aitty-terminal-root {}\n");
});

test("agent report falls back to the Aitty module web component when the global bundle is unavailable", () => {
  const fixture = createAittyReportFixture("agent-report-aitty-module-assets");
  writeAittyBrowserPackage(fixture, {
    moduleScript: "export const moduleOnly = true;\n",
  });
  const paths = writeSingleDomAgentReport({
    fixture,
    name: "agent_report_aitty_module_assets",
    domHtml: [
      '<div class="term-grid" data-cols="41" data-rows="1" style="--term-cols: 41; --term-rows: 1;">',
      '<div class="term-row"><span>module output</span></div>',
      "</div>",
    ].join(""),
  });

  const domViewer = readFileSync(paths.domViewerPath, "utf8");
  const domPreview = readFileSync(paths.domPreviewPath, "utf8");
  const domPreviewStyle = extractFirstStyleBlock(domPreview);
  const copiedScript = readFileSync(paths.copiedScriptPath, "utf8");
  const copiedStyle = readFileSync(paths.copiedStylePath, "utf8");

  expect(domViewer).toContain('sandbox="allow-same-origin allow-scripts"');
  expect(domViewer).not.toContain("<script>");
  expect(domViewer).not.toContain("ptywrightReportAittyAssets");
  expect(domViewer).not.toContain("ptywrightReportDomRenderer");
  expect(domViewer).not.toContain("isHtmlElement");
  expect(domViewer).not.toContain("enableViewportPan");
  expect(domViewer).not.toContain("raw-artifact-viewport");
  expect(domViewer).not.toContain("raw-artifact-text");
  expect(domViewer).not.toContain("data-ptywright-report-pan");
  expect(domPreview).toContain('<link rel="stylesheet" href="assets/aitty-terminal.css" />');
  expect(domPreview).toContain(
    '<script type="module" src="assets/aitty-web-component.js"></script>',
  );
  expect(domPreview).not.toContain("data-ptywright-report-dom-renderer");
  expect(domPreview).not.toContain("data-ptywright-report-aitty-assets");
  expect(domPreview).not.toContain("document.documentElement.dataset.ptywrightReportAittyAssets");
  expect(domPreview.match(/<aitty-snapshot\b/g)?.length).toBe(1);
  expect(domPreview).not.toContain('class="ptywright-aitty-snapshot"');
  expect(domPreview).not.toContain("aittyReportAittyAssets");
  expect(domPreview).not.toContain("data-aitty-report-screen-mode");
  expect(domPreview).toContain('font-size="15"');
  expect(domPreview).toContain('line-height="1.6"');
  expect(domPreview).not.toContain("aitty-terminal-root terminal-root wterm has-scrollback");
  expect(domPreview).not.toContain('class="aitty-shell"');
  expect(domPreview).not.toContain("data-aitty-scroll-target");
  expect(domPreview).not.toContain("ptywright-terminal-fallback");
  expect(domPreview).not.toContain("data-ptywright-report-scroll-viewport");
  expect(domPreviewStyle).not.toContain("--theme-term-bg:");
  expect(domPreviewStyle).not.toContain("--theme-term-font-size:");
  expect(domPreviewStyle).not.toContain("--theme-term-line-height:");
  expect(domPreviewStyle).not.toContain("--term-cols:");
  expect(domPreviewStyle).not.toContain("--term-rows:");
  expect(domPreviewStyle).not.toContain("--term-cell-width:");
  expect(domPreviewStyle).not.toContain("--aitty-report-viewport-width:");
  expect(domPreviewStyle).not.toContain("--aitty-report-viewport-height:");
  expect(copiedScript).toBe("export const moduleOnly = true;\n");
  expect(copiedStyle).toBe(".aitty-terminal-root {}\n");
});

test("agent report delegates Aitty iframe viewport behavior to the web component", async () => {
  const fixture = createAittyReportFixture("agent-report-aitty-runtime");
  writeAittyBrowserPackage(fixture, {
    globalScript: `(() => {
      function mountAittySnapshot(element) {
        const doc = element.ownerDocument;
        const source = element.innerHTML;
        element.classList.add("aitty-embed");
        element.replaceChildren();

        const shell = doc.createElement("div");
        shell.className = "aitty-shell";
        shell.dataset.shell = "";
        shell.dataset.runtime = "snapshot";
        shell.dataset.clientRole = "viewer";
        shell.dataset.screenMode = element.getAttribute("screen-mode") || "plain";
        shell.dataset.theme = element.getAttribute("theme") || "dark";

        const scrollTarget = doc.createElement("div");
        scrollTarget.className = "aitty-scroll-target";
        scrollTarget.dataset.aittyScrollTarget = "";

        const viewport = doc.createElement("div");
        viewport.className = "aitty-scroll-viewport";
        viewport.dataset.aittyScrollViewport = "";
        viewport.dataset.aittyViewportPan = "true";

        const content = doc.createElement("div");
        content.className = "aitty-scroll-content";
        content.dataset.aittyScrollContent = "";

        const root = doc.createElement("div");
        root.className = "aitty-terminal-root terminal-root wterm has-scrollback focused";
        root.dataset.clientRole = "viewer";
        root.dataset.screenMode = element.getAttribute("screen-mode") || "plain";
        root.dataset.theme = element.getAttribute("theme") || "dark";
        root.dataset.sessionInteractive = "false";
        root.style.setProperty("--term-cols", element.getAttribute("cols") || "80");
        root.style.setProperty("--term-rows", element.getAttribute("rows") || "24");
        root.style.setProperty("--term-cell-width", "8.4px");
        root.style.setProperty("--term-row-height", "23px");
        root.innerHTML = source;

        root.querySelectorAll(".term-wide-row-block").forEach((block) => {
          if (!(block instanceof HTMLElement)) return;
          block.dataset.aittyViewportPan = "true";
          block.style.setProperty("--aitty-wide-block-cols", "120");
        });

        content.append(root);
        viewport.append(content);
        scrollTarget.append(viewport);
        shell.append(scrollTarget);
        element.append(shell);

        return { shell, terminalRoot: root, viewport };
      }

      function defineAittySnapshotElement() {
        if (customElements.get("aitty-snapshot")) return;
        customElements.define("aitty-snapshot", class AittySnapshot extends HTMLElement {
          connectedCallback() {
            if (this.__aittyMounted) return;
            this.__aittyMounted = true;
            setTimeout(() => {
              this.__aittyMounted = mountAittySnapshot(this);
            }, 0);
          }
        });
      }

      defineAittySnapshotElement();
      globalThis.AittyBrowser = { defineAittySnapshotElement, mountAittySnapshot };
    })();
`,
    moduleScript: "export {};\n",
    style: `
      aitty-snapshot,
      .aitty-embed,
      .aitty-shell,
      .aitty-scroll-target {
        display: block;
        width: 100%;
        height: 100%;
      }
      .aitty-scroll-viewport {
        height: 100%;
        overflow: auto;
      }
      .aitty-terminal-root.wterm {
        --theme-term-color-15: #5c5f77;
      }
      .term-wide-row-block {
        max-inline-size: 100%;
        overflow-x: auto;
      }
      .term-wide-row-block > .term-row {
        inline-size: calc(var(--term-cell-width, 1ch) * var(--aitty-wide-block-cols, 80));
      }
    `,
  });
  const paths = writeSingleDomAgentReport({
    fixture,
    name: "agent_report_aitty_runtime",
    launchArgs: [
      "exec",
      "--experimental-screen-mode",
      "termvision",
      "--theme",
      "light",
      "--font-size",
      "14",
    ],
    domHtml: [
      '<div class="term-grid" data-cols="41" data-rows="2" style="--term-cols: 41; --term-rows: 2;">',
      '<div class="term-wide-row-block" data-aitty-wide-block="true" style="--aitty-wide-block-cols: 120;">',
      '<div class="term-row" data-aitty-line-cols="120"><span style="width: calc(var(--term-cell-width, 1ch) * 120);">wide output</span></div>',
      "</div>",
      '<div class="term-row"><span class="term-cursor" style="width: var(--term-cell-width, 1ch);"></span></div>',
      "</div>",
    ].join(""),
  });

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 390, height: 844 },
    });
    await page.goto(pathToFileURL(paths.domViewerPath).href);
    const frameElement = await page.waitForSelector(".dom-viewer-frame");
    const frame = await frameElement.contentFrame();
    expect(frame).not.toBeNull();
    await frame?.waitForSelector('.aitty-terminal-root.wterm[data-screen-mode="termvision"]', {
      state: "attached",
    });
    await frame?.waitForSelector('.term-wide-row-block[data-aitty-viewport-pan="true"]', {
      state: "attached",
    });

    const runtime = await frame?.evaluate(() => {
      const snapshot = document.querySelector("aitty-snapshot");
      const viewport = document.querySelector("[data-aitty-scroll-viewport]");
      const root = document.querySelector(".aitty-terminal-root.wterm");
      const wideBlock = document.querySelector(".term-wide-row-block");
      const style = root instanceof HTMLElement ? getComputedStyle(root) : null;

      return {
        domAttribute: document.documentElement.dataset.ptywrightReportDomRenderer ?? null,
        color15: style?.getPropertyValue("--theme-term-color-15").trim() ?? "",
        reportPanCount: document.querySelectorAll('[data-ptywright-report-pan="true"]').length,
        rootScreenMode: root instanceof HTMLElement ? root.dataset.screenMode : "",
        rootTheme: root instanceof HTMLElement ? root.dataset.theme : "",
        snapshotMounted:
          snapshot instanceof HTMLElement && snapshot.classList.contains("aitty-embed"),
        terminalRootCount: document.querySelectorAll(".aitty-terminal-root.wterm").length,
        viewportPan: viewport instanceof HTMLElement ? viewport.dataset.aittyViewportPan : "",
        viewportReportPan:
          viewport instanceof HTMLElement ? (viewport.dataset.ptywrightReportPan ?? null) : null,
        wideBlockPan: wideBlock instanceof HTMLElement ? wideBlock.dataset.aittyViewportPan : "",
      };
    });

    expect(runtime).toEqual({
      domAttribute: null,
      color15: "#5c5f77",
      reportPanCount: 0,
      rootScreenMode: "termvision",
      rootTheme: "light",
      snapshotMounted: true,
      terminalRootCount: 1,
      viewportPan: "true",
      viewportReportPan: null,
      wideBlockPan: "true",
    });
    await page.close();
  } finally {
    await browser.close();
  }
}, 15_000);
