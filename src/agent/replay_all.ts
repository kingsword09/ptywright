import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import {
  replayAgentRecordPath,
  type AgentRecordedStep,
  type AgentRunArtifact,
  type AgentRunResult,
} from "./runner";
import {
  AGENT_MANIFEST_FILE_NAME,
  agentManifestPath,
  readAgentManifestPath,
  writeAgentManifestPath,
} from "./manifest";
import {
  AGENT_RUN_RECORD_SCHEMA_URL,
  formatAgentArgv,
  writeAgentRunRecordPath,
} from "./run_record";
import {
  AGENT_REPLAY_SUMMARY_SCHEMA_URL,
  normalizeAgentReplaySummary,
  writeAgentReplaySummaryPath,
  type AgentReplaySummary,
} from "./summary";

export type AgentReplayAllOptions = {
  dir?: string;
  artifactsRoot?: string;
  headless?: boolean;
  updateSnapshots?: boolean;
};

export type AgentReplayAllEntry = {
  filePath: string;
  durationMs: number;
  result: AgentRunResult;
};

export type AgentReplayAllResult = {
  ok: boolean;
  dir: string;
  suiteDir: string;
  durationMs: number;
  reportPath: string;
  summaryPath: string;
  updateSnapshots: boolean;
  entries: AgentReplayAllEntry[];
};

export async function replayAllAgentRecords(
  options: AgentReplayAllOptions = {},
): Promise<AgentReplayAllResult> {
  const dir = resolve(options.dir?.trim() ? options.dir.trim() : join(".tmp", "agent"));
  const suiteDir = resolve(
    options.artifactsRoot?.trim() ? options.artifactsRoot.trim() : join(".tmp", "agent-replay-all"),
  );
  const filePaths = listAgentReplayFiles(dir, { artifactsRoot: suiteDir });
  const entries: AgentReplayAllEntry[] = [];
  const startedAt = Date.now();
  const updateSnapshots = options.updateSnapshots ?? false;

  for (const filePath of filePaths) {
    const artifactsDir = join(suiteDir, "tests", safeArtifactsDirName(relative(dir, filePath)));
    const entryStartedAt = Date.now();
    const result = await replayRecordEntry(filePath, artifactsDir, {
      headless: options.headless ?? true,
      updateSnapshots,
    });
    entries.push({
      filePath,
      durationMs: Date.now() - entryStartedAt,
      result,
    });
  }

  const durationMs = Date.now() - startedAt;
  const reportPath = join(suiteDir, "index.html");
  const summaryPath = join(suiteDir, "agent-replay.summary.json");

  writeReplayAllSummary(summaryPath, {
    ok: entries.every((entry) => entry.result.ok),
    dir,
    suiteDir,
    durationMs,
    reportPath,
    summaryPath,
    updateSnapshots,
    entries,
  });
  writeReplayAllReport(reportPath, {
    dir,
    durationMs,
    updateSnapshots,
    entries,
    summaryPath,
  });
  writeReplayAllManifest({
    ok: entries.every((entry) => entry.result.ok),
    dir,
    suiteDir,
    reportPath,
    summaryPath,
    updateSnapshots,
    entries,
  });

  return {
    ok: entries.every((entry) => entry.result.ok),
    dir,
    suiteDir,
    durationMs,
    reportPath,
    summaryPath,
    updateSnapshots,
    entries,
  };
}

function writeReplayAllManifest(result: {
  ok: boolean;
  dir: string;
  suiteDir: string;
  reportPath: string;
  summaryPath: string;
  updateSnapshots: boolean;
  entries: AgentReplayAllEntry[];
}): void {
  const summary = formatAgentReplaySummary({
    ok: result.ok,
    dir: result.dir,
    suiteDir: result.suiteDir,
    durationMs: 0,
    reportPath: result.reportPath,
    summaryPath: result.summaryPath,
    updateSnapshots: result.updateSnapshots,
    entries: result.entries,
  });
  writeAgentManifestPath(agentManifestPath(result.suiteDir), {
    kind: "replay-suite",
    ok: result.ok,
    rootDir: result.suiteDir,
    primaryPath: result.summaryPath,
    commands: summary.commands,
    validation: {
      ok: result.ok,
      stages: [
        {
          name: "replay",
          ok: result.ok,
          totalCount: result.entries.length,
          failureCount: result.entries.filter((entry) => !entry.result.ok).length,
        },
      ],
    },
    files: [
      { path: result.summaryPath, kind: "replay-summary", role: "summary", ok: result.ok },
      { path: result.reportPath, kind: "report", role: "report", ok: result.ok },
      ...result.entries.flatMap((entry) => [
        {
          path: entry.result.recordPath,
          kind: "run-record" as const,
          role: "record",
          ok: entry.result.ok,
        },
        {
          path: entry.result.reportPath,
          kind: "report" as const,
          role: "entry-report",
          ok: entry.result.ok,
        },
        ...entry.result.artifacts.flatMap((artifact) => [
          {
            path: artifact.path,
            kind: artifact.kind,
            role: "artifact",
            ok: artifact.ok,
          },
          {
            path: artifact.diffPath,
            kind: "diff" as const,
            role: "diff",
            ok: artifact.ok,
          },
        ]),
      ]),
    ],
  });
}

async function replayRecordEntry(
  filePath: string,
  artifactsDir: string,
  options: { headless: boolean; updateSnapshots: boolean },
): Promise<AgentRunResult> {
  try {
    return await replayAgentRecordPath(filePath, {
      artifactsDir,
      headless: options.headless,
      updateSnapshots: options.updateSnapshots,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const startedAt = Date.now();
    mkdirSync(artifactsDir, { recursive: true });
    const replayArgv = ["ptywright", "agent", "replay", filePath];
    const result: AgentRunResult = {
      ok: false,
      name: safeArtifactsDirName(filePath),
      mode: "replay",
      agentFlavor: "generic",
      startedAt,
      durationMs: 0,
      artifactsDir,
      snapshotDir: join(artifactsDir, "snapshots"),
      reportPath: join(artifactsDir, "index.html"),
      recordPath: join(artifactsDir, "failed.agent-run.json"),
      flowPath: "",
      cassettePath: filePath,
      replayCommand: formatAgentArgv(replayArgv),
      commands: {
        replay: { argv: replayArgv },
        updateSnapshots: { argv: [...replayArgv, "--update-snapshots"] },
      },
      viewports: [],
      cassetteFrameCount: 0,
      steps: [] as AgentRecordedStep[],
      artifacts: [] as AgentRunArtifact[],
      errors: [message],
    };
    writeAgentRunRecordPath(result.recordPath, {
      $schema: AGENT_RUN_RECORD_SCHEMA_URL,
      version: 1,
      name: result.name,
      ok: result.ok,
      startedAt: new Date(result.startedAt).toISOString(),
      durationMs: result.durationMs,
      mode: result.mode,
      artifactsDir: result.artifactsDir,
      snapshotDir: result.snapshotDir,
      reportPath: result.reportPath,
      cassettePath: result.cassettePath,
      cassetteFrameCount: result.cassetteFrameCount,
      replayCommand: result.replayCommand,
      commands: result.commands,
      steps: result.steps,
      artifacts: result.artifacts,
      errors: result.errors,
    });
    writeFileSync(result.reportPath, renderFailedEntryReport(result), "utf8");
    return result;
  }
}

function renderFailedEntryReport(result: AgentRunResult): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(result.name)} failed replay</title>
    <style>
      :root { color-scheme: light; font-family: ui-sans-serif, system-ui, sans-serif; }
      body { margin: 0; padding: 32px; background: oklch(97.5% 0.008 210); color: oklch(19% 0.018 230); }
      main { display: grid; gap: 16px; max-width: 960px; }
      pre { overflow: auto; border-radius: 8px; background: oklch(20% 0.015 230); color: oklch(92% 0.012 230); padding: 14px; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(result.name)}</h1>
      <p>Replay failed before the agent runner could start.</p>
      <pre>${escapeHtml(result.errors.join("\n"))}</pre>
    </main>
  </body>
</html>`;
}

export function listAgentReplayFiles(
  dir: string,
  options: { artifactsRoot?: string } = {},
): string[] {
  const resolvedDir = resolve(process.cwd(), dir);
  const suiteDir = options.artifactsRoot?.trim()
    ? resolve(process.cwd(), options.artifactsRoot)
    : null;

  return collectReplayFiles(resolvedDir, {
    skipGeneratedOutputDirs: suiteDir ? isSubpath(resolvedDir, suiteDir) : false,
  });
}

function collectReplayFiles(
  dir: string,
  options: { skipGeneratedOutputDirs?: boolean } = {},
): string[] {
  const out: string[] = [];
  const entries = readdirSync(dir);
  const hasRunRecord = entries.some((entry) => entry.endsWith(".agent-run.json"));

  for (const entry of entries) {
    const abs = join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      if (entry === "replay") continue;
      if (options.skipGeneratedOutputDirs && isGeneratedReplayOutputDir(abs)) continue;
      out.push(...collectReplayFiles(abs, options));
      continue;
    }

    if (hasRunRecord && entry.endsWith(".cassette.json")) {
      continue;
    }

    if (entry.endsWith(".cassette.json") || entry.endsWith(".agent-run.json")) {
      out.push(abs);
    }
  }

  return out.sort((a, b) => a.localeCompare(b));
}

function isGeneratedReplayOutputDir(dir: string): boolean {
  const manifestPath = join(dir, AGENT_MANIFEST_FILE_NAME);
  try {
    const manifest = readAgentManifestPath(manifestPath);
    if (samePath(manifest.rootDir, dir)) {
      return true;
    }
  } catch {
    // Fall back to legacy run-record detection below.
  }

  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".agent-run.json")) continue;
    try {
      const parsed = JSON.parse(readFileSync(join(dir, entry), "utf8")) as {
        artifactsDir?: unknown;
      };
      if (typeof parsed.artifactsDir === "string" && samePath(parsed.artifactsDir, dir)) {
        return true;
      }
    } catch {
      // Invalid records should still be discovered and reported by replayRecordEntry.
    }
  }
  return false;
}

function isSubpath(path: string, maybeParent: string): boolean {
  const child = resolve(process.cwd(), path);
  const parent = resolve(process.cwd(), maybeParent);
  const rel = relative(parent, child);
  return rel === "" || (!!rel && !rel.startsWith("..") && !isAbsolute(rel));
}

function samePath(left: string, right: string): boolean {
  return resolve(process.cwd(), left) === resolve(process.cwd(), right);
}

export function formatAgentReplaySummary(result: AgentReplayAllResult): AgentReplaySummary {
  const entries = result.entries.map((entry) => ({
    filePath: entry.filePath,
    durationMs: entry.durationMs,
    ok: entry.result.ok,
    mode: entry.result.mode,
    frames: entry.result.cassetteFrameCount,
    reportPath: entry.result.reportPath,
    recordPath: entry.result.recordPath,
    cassettePath: entry.result.replaySourceCassettePath ?? entry.result.cassettePath,
    failedArtifacts: entry.result.artifacts
      .filter((artifact) => !artifact.ok)
      .map((artifact) => ({
        name: artifact.name,
        viewport: artifact.viewport,
        kind: artifact.kind,
        path: artifact.path,
        baselinePath: artifact.baselinePath,
        diffPath: artifact.diffPath,
        error: artifact.error,
      })),
    errors: entry.result.errors,
  }));
  const failureCount = entries.filter((entry) => !entry.ok).length;
  return normalizeAgentReplaySummary({
    $schema: AGENT_REPLAY_SUMMARY_SCHEMA_URL,
    version: 1,
    ok: result.ok,
    dir: result.dir,
    suiteDir: result.suiteDir,
    durationMs: result.durationMs,
    reportPath: result.reportPath,
    summaryPath: result.summaryPath,
    commands: {
      replayAll: {
        argv: ["ptywright", "agent", "replay-all", result.dir, "--artifacts-root", result.suiteDir],
      },
      updateSnapshots: {
        argv: [
          "ptywright",
          "agent",
          "replay-all",
          result.dir,
          "--artifacts-root",
          result.suiteDir,
          "--update-snapshots",
        ],
      },
      rerun: {
        argv: ["ptywright", "agent", "rerun", result.summaryPath],
      },
    },
    updateSnapshots: result.updateSnapshots,
    totalCount: entries.length,
    failureCount,
    entries,
  });
}

function writeReplayAllSummary(path: string, result: AgentReplayAllResult): void {
  mkdirSync(dirname(path), { recursive: true });
  writeAgentReplaySummaryPath(path, formatAgentReplaySummary(result));
}

function writeReplayAllReport(
  path: string,
  args: {
    dir: string;
    durationMs: number;
    updateSnapshots: boolean;
    entries: AgentReplayAllEntry[];
    summaryPath: string;
  },
): void {
  mkdirSync(dirname(path), { recursive: true });
  const rows = args.entries.map((entry) => renderEntry(entry, path)).join("\n");
  const ok = args.entries.every((entry) => entry.result.ok);

  writeFileSync(
    path,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>ptywright agent replay report</title>
    <style>
      :root {
        color-scheme: light;
        --bg: oklch(97.5% 0.008 210);
        --ink: oklch(19% 0.018 230);
        --muted: oklch(48% 0.02 230);
        --line: oklch(86% 0.018 230);
        --panel: oklch(99% 0.006 210);
        --good: oklch(55% 0.15 155);
        --bad: oklch(58% 0.19 25);
        --focus: oklch(55% 0.14 235);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--ink); }
      main {
        display: grid;
        gap: 22px;
        width: min(1180px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }
      header {
        display: grid;
        gap: 10px;
        border-bottom: 1px solid var(--line);
        padding-bottom: 20px;
      }
      h1 { margin: 0; font-size: 28px; line-height: 1.15; letter-spacing: 0; }
      .meta { display: flex; flex-wrap: wrap; gap: 8px; }
      .pill {
        display: inline-flex;
        min-height: 32px;
        align-items: center;
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 0 12px;
        color: var(--muted);
        font-size: 13px;
      }
      .pill.pass { color: var(--good); border-color: color-mix(in oklch, var(--good) 42%, var(--line)); }
      .pill.fail { color: var(--bad); border-color: color-mix(in oklch, var(--bad) 42%, var(--line)); }
      .entries { display: grid; gap: 10px; }
      .entry {
        display: grid;
        grid-template-columns: 92px minmax(0, 1fr) auto;
        gap: 14px;
        align-items: center;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        padding: 12px;
      }
      .badge {
        justify-self: start;
        border-radius: 999px;
        padding: 5px 9px;
        background: color-mix(in oklch, var(--line) 52%, transparent);
        color: var(--muted);
        font-size: 12px;
        font-weight: 700;
      }
      .badge.pass { background: color-mix(in oklch, var(--good) 12%, var(--panel)); color: var(--good); }
      .badge.fail { background: color-mix(in oklch, var(--bad) 12%, var(--panel)); color: var(--bad); }
      a { color: var(--focus); font-weight: 700; text-decoration: none; }
      code { color: var(--muted); overflow-wrap: anywhere; }
      .commands {
        display: grid;
        gap: 4px;
        margin-top: 8px;
      }
      .commands code {
        display: block;
      }
      @media (max-width: 720px) {
        main { width: min(100vw - 20px, 1180px); padding-top: 18px; }
        .entry { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>ptywright agent replay report</h1>
        <div class="meta">
          <span class="pill ${ok ? "pass" : "fail"}">${ok ? "passed" : "failed"}</span>
          <span class="pill">${args.entries.length} entries</span>
          <span class="pill">${args.updateSnapshots ? "update snapshots" : "compare snapshots"}</span>
          <span class="pill">${args.durationMs}ms</span>
          <span class="pill">${escapeHtml(args.dir)}</span>
          <a class="pill" href="${escapeAttribute(relativeHref(path, args.summaryPath))}">agent-replay.summary.json</a>
        </div>
      </header>
      <section class="entries">
        ${rows || "<p>No replay artifacts were found.</p>"}
      </section>
    </main>
  </body>
</html>`,
    "utf8",
  );
}

function renderEntry(entry: AgentReplayAllEntry, reportPath: string): string {
  const state = entry.result.ok ? "pass" : "fail";
  const source = entry.result.replaySourceCassettePath ?? entry.result.cassettePath;
  const failedArtifacts = entry.result.artifacts.filter((artifact) => !artifact.ok);
  return `<article class="entry">
    <span class="badge ${state}">${state}</span>
    <div>
      <a href="${escapeAttribute(relativeHref(reportPath, entry.result.reportPath))}">${escapeHtml(entry.result.name)}</a>
      <div><code>${escapeHtml(entry.filePath)}</code></div>
      <div><code>${escapeHtml(source)}</code></div>
      <div class="commands">
        <code>replay ${escapeHtml(formatAgentArgv(entry.result.commands.replay.argv))}</code>
        <code>update ${escapeHtml(formatAgentArgv(entry.result.commands.updateSnapshots.argv))}</code>
        <code>commands ${escapeHtml(
          formatAgentArgv(["ptywright", "agent", "commands", entry.result.recordPath, "--json"]),
        )}</code>
      </div>
      ${failedArtifacts.map((artifact) => renderFailedArtifact(artifact, reportPath)).join("")}
      ${entry.result.errors.map((error) => `<div><code>${escapeHtml(error)}</code></div>`).join("")}
    </div>
    <code>${entry.result.mode} / ${entry.result.cassetteFrameCount} frames / ${entry.durationMs}ms</code>
  </article>`;
}

function renderFailedArtifact(
  artifact: AgentRunResult["artifacts"][number],
  reportPath: string,
): string {
  const diffLink = artifact.diffPath
    ? `<a href="${escapeAttribute(relativeHref(reportPath, artifact.diffPath))}">diff</a>`
    : "";
  const artifactLink = `<a href="${escapeAttribute(relativeHref(reportPath, artifact.path))}">${escapeHtml(artifact.kind)}</a>`;
  return `<div>
    ${artifactLink}${diffLink ? ` ${diffLink}` : ""}
    <code>${escapeHtml(artifact.viewport)} / ${escapeHtml(artifact.name)}${artifact.error ? ` / ${artifact.error}` : ""}</code>
  </div>`;
}

function safeArtifactsDirName(relPath: string): string {
  return relPath.replace(/[/\\]/g, "__");
}

function relativeHref(fromPath: string, targetPath: string): string {
  const href = relative(dirname(fromPath), targetPath);
  return href.startsWith(".") ? href : `./${href}`;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(input: string): string {
  return escapeHtml(input).replace(/'/g, "&#39;");
}
