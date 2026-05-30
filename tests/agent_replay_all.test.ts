import { Buffer } from "node:buffer";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { expect, test } from "bun:test";

import { readAgentArtifactCommandsPath } from "../src/agent/commands";
import { agentManifestPath, writeAgentManifestPath } from "../src/agent/manifest";
import { replayAllAgentRecords } from "../src/agent/replay_all";
import { writeReplayAllReport } from "../src/agent/replay_all_report";
import { writeReplayAllSummary } from "../src/agent/replay_all_summary";
import type { AgentReplayAllResult } from "../src/agent/replay_all_types";
import {
  normalizeAgentReplaySummary,
  readAgentReplaySummaryPath,
  writeAgentReplaySummaryPath,
} from "../src/agent/summary";
import { validateAgentArtifactsPath } from "../src/agent/validate";
import { main } from "../src/cli";

function currentExitCode(): string | number | null | undefined {
  return process.exitCode;
}

function readAgentReplaySummaryPathFromJson(json: string) {
  return normalizeAgentReplaySummary(JSON.parse(json) as unknown);
}

function copyCommittedCassette(targetPath: string, overrides: { snapshotDir?: string } = {}): void {
  mkdirSync(dirname(targetPath), { recursive: true });
  const cassette = JSON.parse(
    readFileSync(
      join("tests", "agent-cassettes", "agent_deterministic", "agent_deterministic.cassette.json"),
      "utf8",
    ),
  );
  if (overrides.snapshotDir && cassette.spec) {
    cassette.spec.snapshotDir = overrides.snapshotDir;
  }
  writeFileSync(targetPath, JSON.stringify(cassette, null, 2) + "\n", "utf8");
}

function writeMinimalReplayManifestBundle(artifactsRoot: string): { summaryPath: string } {
  mkdirSync(artifactsRoot, { recursive: true });
  const summaryPath = join(artifactsRoot, "agent-replay.summary.json");
  const replayDir = join(artifactsRoot, "tests");
  const replayAll = [
    "ptywright",
    "agent",
    "replay-all",
    replayDir,
    "--artifacts-root",
    artifactsRoot,
  ];

  writeAgentReplaySummaryPath(summaryPath, {
    version: 1,
    ok: true,
    dir: replayDir,
    suiteDir: artifactsRoot,
    durationMs: 0,
    reportPath: join(artifactsRoot, "index.html"),
    summaryPath,
    commands: {
      replayAll: { argv: replayAll },
      updateSnapshots: { argv: [...replayAll, "--update-snapshots"] },
      rerun: { argv: ["ptywright", "agent", "rerun", summaryPath] },
    },
    updateSnapshots: false,
    totalCount: 0,
    failureCount: 0,
    entries: [],
  });

  writeAgentManifestPath(agentManifestPath(artifactsRoot), {
    kind: "replay-suite",
    ok: true,
    rootDir: artifactsRoot,
    primaryPath: summaryPath,
    commands: {
      replayAll: { argv: replayAll },
      updateSnapshots: { argv: [...replayAll, "--update-snapshots"] },
      rerun: { argv: ["ptywright", "agent", "rerun", summaryPath] },
    },
    validation: {
      ok: true,
      stages: [{ name: "replay", ok: true, totalCount: 0, failureCount: 0 }],
    },
    files: [{ path: summaryPath, kind: "replay-summary", role: "summary", ok: true }],
  });

  return { summaryPath };
}

test("agent replay-all runs copied cassettes as a regression suite", async () => {
  const dir = join(".tmp", "tests", "agent-replay-all");
  const cassetteDir = join(dir, "cassettes");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(cassetteDir, { recursive: true });

  const copiedCassettePath = join(cassetteDir, "agent_replay_all_fixture.cassette.json");
  copyCommittedCassette(copiedCassettePath);

  const result = await replayAllAgentRecords({
    dir: cassetteDir,
    artifactsRoot: join(dir, "suite"),
    headless: true,
  });

  expect(result.ok).toBe(true);
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0]?.result.mode).toBe("replay");
  expect(result.entries[0]?.result.cassetteFrameCount).toBe(4);
  expect(existsSync(result.reportPath)).toBe(true);
  expect(existsSync(result.summaryPath)).toBe(true);

  const summary = readAgentReplaySummaryPath(result.summaryPath);
  expect(summary.ok).toBe(true);
  expect(summary.$schema).toContain("ptywright-agent-replay-summary.schema.json");
  expect(summary.version).toBe(1);
  expect(summary.totalCount).toBe(1);
  expect(summary.failureCount).toBe(0);
  expect(summary.commands.replayAll.argv).toEqual([
    "ptywright",
    "agent",
    "replay-all",
    resolve(cassetteDir),
    "--artifacts-root",
    resolve(join(dir, "suite")),
  ]);
  expect(summary.commands.updateSnapshots.argv).toEqual([
    "ptywright",
    "agent",
    "replay-all",
    resolve(cassetteDir),
    "--artifacts-root",
    resolve(join(dir, "suite")),
    "--update-snapshots",
  ]);
  expect(summary.entries?.[0]).toMatchObject({
    ok: true,
    mode: "replay",
    frames: 4,
  });

  const html = readFileSync(result.reportPath, "utf8");
  expect(html).toContain("ptywright agent replay report");
  expect(html).toContain("agent-replay.summary.json");
  expect(html).toContain("ptywright agent commands");
  expect(html).toContain("--update-snapshots");
}, 15_000);

test("agent replay-all passes report config to entry reports", async () => {
  const dir = join(".tmp", "tests", "agent-replay-all-report-config");
  const cassetteDir = join(dir, "cassettes");
  const artifactsRoot = join(dir, "suite");
  const replayPath = join(dir, "recordings", "stable.pty.json");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(cassetteDir, { recursive: true });
  mkdirSync(dirname(replayPath), { recursive: true });

  writeFileSync(
    replayPath,
    JSON.stringify(
      {
        version: 1,
        createdAt: "2026-05-25T00:00:00.000Z",
        durationMs: 100,
        command: { file: "codex", args: [], cols: 80, rows: 24 },
        events: [
          { atMs: 0, type: "resize", cols: 80, rows: 24 },
          {
            atMs: 0,
            type: "output",
            dataBase64: Buffer.from("stable source from config\r\n", "utf8").toString("base64"),
          },
          { atMs: 100, type: "exit", exitCode: 0 },
        ],
      },
      null,
      2,
    ),
    "utf8",
  );

  const copiedCassettePath = join(cassetteDir, "agent_replay_all_config_fixture.cassette.json");
  copyCommittedCassette(copiedCassettePath);
  const cassette = JSON.parse(readFileSync(copiedCassettePath, "utf8")) as {
    spec?: { launch?: { args?: string[] } };
  };
  cassette.spec!.launch!.args = ["exec", "--pty-replay", resolve(replayPath)];
  writeFileSync(copiedCassettePath, JSON.stringify(cassette, null, 2) + "\n", "utf8");

  const result = await replayAllAgentRecords({
    config: {
      rootDir: resolve(dir),
      agent: {
        report: {
          stableFrames: {
            previewSource: "pty-replay",
            theme: "dark",
          },
        },
      },
    },
    dir: cassetteDir,
    artifactsRoot,
    headless: true,
  });

  expect(result.ok).toBe(true);
  const entryArtifactsDir = result.entries[0]!.result.artifactsDir;
  const domPreview = readFileSync(
    join(entryArtifactsDir, "desktop.ready.dom.preview.html"),
    "utf8",
  );
  expect(domPreview).toContain("stable-frame preview");
  expect(domPreview).toContain("stable source from config");
  expect(domPreview).toContain('theme="dark"');
  expect(domPreview).not.toContain("Deterministic Agent Ready");
}, 15_000);

test("agent replay-all can update snapshots from copied cassettes", async () => {
  const dir = join(".tmp", "tests", "agent-replay-all-update");
  const cassetteDir = join(dir, "cassettes");
  const snapshotDir = join(dir, "snapshots");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(cassetteDir, { recursive: true });

  rmSync(snapshotDir, { recursive: true, force: true });
  const copiedCassettePath = join(cassetteDir, "agent_replay_all_update_fixture.cassette.json");
  copyCommittedCassette(copiedCassettePath, { snapshotDir });

  const update = await replayAllAgentRecords({
    dir: cassetteDir,
    artifactsRoot: join(dir, "suite-update"),
    headless: true,
    updateSnapshots: true,
  });

  expect(update.ok).toBe(true);
  expect(update.updateSnapshots).toBe(true);
  expect(existsSync(join(snapshotDir, "desktop.ready.terminal.snap.txt"))).toBe(true);
  expect(existsSync(join(snapshotDir, "desktop.status.dom.snap.html"))).toBe(true);

  const compare = await replayAllAgentRecords({
    dir: cassetteDir,
    artifactsRoot: join(dir, "suite-compare"),
    headless: true,
  });
  expect(compare.ok).toBe(true);

  const summary = readAgentReplaySummaryPath(update.summaryPath);
  expect(summary.updateSnapshots).toBe(true);
  expect(summary.totalCount).toBe(1);
}, 20_000);

test("agent replay-all manifest bundle can rerun after the original input directory is deleted", async () => {
  const dir = join(".tmp", "tests", "agent-replay-all-copy");
  const cassetteDir = join(dir, "cassettes");
  const suiteDir = join(dir, "suite");
  const copyRoot = join(dir, "suite-moved");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(cassetteDir, { recursive: true });

  copyCommittedCassette(join(cassetteDir, "agent_replay_all_copy_fixture.cassette.json"));

  const result = await replayAllAgentRecords({
    dir: cassetteDir,
    artifactsRoot: suiteDir,
    headless: true,
  });
  expect(result.ok).toBe(true);

  cpSync(suiteDir, copyRoot, { recursive: true });
  rmSync(cassetteDir, { recursive: true, force: true });
  rmSync(suiteDir, { recursive: true, force: true });
  expect(existsSync(cassetteDir)).toBe(false);

  const commands = await readAgentArtifactCommandsPath(copyRoot);
  expect(commands.commands.replayAll.argv).toEqual([
    "ptywright",
    "agent",
    "replay-all",
    join(copyRoot, "tests"),
    "--artifacts-root",
    copyRoot,
  ]);
  expect(commands.commands.updateSnapshots.argv).toEqual([
    "ptywright",
    "agent",
    "replay-all",
    join(copyRoot, "tests"),
    "--artifacts-root",
    copyRoot,
    "--update-snapshots",
  ]);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "exec", copyRoot, "--command", "rerun"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  expect(logs.join("\n")).toContain("ok count=1");
  expect(logs.join("\n")).toContain(`dir=${resolve(copyRoot, "tests")}`);
  expect(await validateAgentArtifactsPath(copyRoot, { preferManifestBundle: true })).toMatchObject({
    ok: true,
    totalCount: 1,
    failureCount: 0,
  });
}, 25_000);

test("agent replay summary next to a moved manifest reruns from local bundle records", async () => {
  const dir = join(".tmp", "tests", "agent-replay-summary-copy");
  const cassetteDir = join(dir, "cassettes");
  const suiteDir = join(dir, "suite");
  const copyRoot = join(dir, "suite-moved");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(cassetteDir, { recursive: true });

  copyCommittedCassette(join(cassetteDir, "agent_replay_summary_copy_fixture.cassette.json"));

  const result = await replayAllAgentRecords({
    dir: cassetteDir,
    artifactsRoot: suiteDir,
    headless: true,
  });
  expect(result.ok).toBe(true);

  cpSync(suiteDir, copyRoot, { recursive: true });
  rmSync(cassetteDir, { recursive: true, force: true });
  rmSync(suiteDir, { recursive: true, force: true });

  const movedSummaryPath = join(copyRoot, "agent-replay.summary.json");
  const commands = await readAgentArtifactCommandsPath(movedSummaryPath);
  expect(commands.commands.rerun.argv).toEqual([
    "ptywright",
    "agent",
    "replay-all",
    join(copyRoot, "tests"),
    "--artifacts-root",
    copyRoot,
  ]);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "exec", movedSummaryPath, "--command", "rerun"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  expect(logs.join("\n")).toContain("ok count=1");
  expect(logs.join("\n")).toContain(`dir=${resolve(copyRoot, "tests")}`);
  expect(await validateAgentArtifactsPath(copyRoot, { preferManifestBundle: true })).toMatchObject({
    ok: true,
    totalCount: 1,
    failureCount: 0,
  });

  logs.length = 0;
  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "rerun", movedSummaryPath]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  expect(logs.join("\n")).toContain("ok rerun=replay-summary");
  expect(logs.join("\n")).toContain(`dir=${resolve(copyRoot, "tests")}`);
  expect(logs.join("\n")).toContain(`summary=${resolve(copyRoot, "agent-replay.summary.json")}`);
}, 25_000);

test("agent exec validates a moved replay summary manifest before dispatch", async () => {
  const dir = join(".tmp", "tests", "agent-replay-summary-copy-tamper");
  const suiteDir = join(dir, "suite");
  const copyRoot = join(dir, "suite-moved");
  rmSync(dir, { recursive: true, force: true });
  writeMinimalReplayManifestBundle(suiteDir);

  cpSync(suiteDir, copyRoot, { recursive: true });
  rmSync(suiteDir, { recursive: true, force: true });

  const movedSummaryPath = join(copyRoot, "agent-replay.summary.json");
  writeFileSync(movedSummaryPath, readFileSync(movedSummaryPath, "utf8") + "\n", "utf8");

  process.exitCode = undefined;
  try {
    await expect(main(["agent", "exec", movedSummaryPath, "--command", "rerun"])).rejects.toThrow(
      "invalid agent manifest files",
    );
  } finally {
    process.exitCode = 0;
  }
}, 20_000);

test("agent replay-all CLI accepts JSON output mode", async () => {
  const dir = join(".tmp", "tests", "agent-replay-all-json");
  const cassetteDir = join(dir, "empty-cassettes");
  const logs: string[] = [];
  const originalLog = console.log;
  const artifactsRoot = join(dir, "suite");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(cassetteDir, { recursive: true });

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "replay-all", cassetteDir, "--artifacts-root", artifactsRoot, "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const parsed = readAgentReplaySummaryPath(join(artifactsRoot, "agent-replay.summary.json"));
  const stdout = readAgentReplaySummaryPathFromJson(logs.join("\n"));
  expect(stdout).toMatchObject({
    ok: true,
    failureCount: 0,
  });
  expect(stdout.totalCount).toBe(0);
  expect(stdout.commands.replayAll.argv).toEqual(parsed.commands.replayAll.argv);
}, 15_000);

test("agent replay-all summary links diff artifacts on snapshot mismatch", () => {
  const dir = join(".tmp", "tests", "agent-replay-all-diff");
  const suiteDir = join(dir, "suite");
  const entryDir = join(suiteDir, "tests", "fixture");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(entryDir, { recursive: true });

  const artifactPath = join(entryDir, "desktop.ready.terminal.txt");
  const baselinePath = join(entryDir, "desktop.ready.terminal.snap.txt");
  const diffPath = join(entryDir, "desktop.ready.terminal.diff.txt");
  const reportPath = join(suiteDir, "index.html");
  const summaryPath = join(suiteDir, "agent-replay.summary.json");
  const entryReportPath = join(entryDir, "index.html");
  const recordPath = join(entryDir, "agent-run.json");
  const cassettePath = join(dir, "cassettes", "agent_replay_all_diff_fixture.cassette.json");
  const replayArgv = ["ptywright", "agent", "replay", cassettePath];

  writeFileSync(artifactPath, "actual output\n", "utf8");
  writeFileSync(baselinePath, "wrong baseline\n", "utf8");
  writeFileSync(diffPath, "-wrong baseline\n+actual output\n", "utf8");

  const result = {
    ok: false,
    dir,
    suiteDir,
    durationMs: 12,
    reportPath,
    summaryPath,
    updateSnapshots: false,
    entries: [
      {
        filePath: cassettePath,
        durationMs: 12,
        result: {
          ok: false,
          name: "agent_replay_all_diff_fixture",
          mode: "replay",
          agentFlavor: "generic",
          startedAt: Date.now(),
          durationMs: 12,
          artifactsDir: entryDir,
          snapshotDir: join(dir, "snapshots"),
          reportPath: entryReportPath,
          recordPath,
          flowPath: join(entryDir, "flow.json"),
          cassettePath,
          replayCommand: replayArgv.join(" "),
          commands: {
            replay: { argv: replayArgv },
            updateSnapshots: { argv: [...replayArgv, "--update-snapshots"] },
          },
          viewports: [{ name: "desktop", width: 1280, height: 820 }],
          cassetteFrameCount: 4,
          steps: [],
          artifacts: [
            {
              name: "ready",
              viewport: "desktop",
              kind: "terminal",
              path: artifactPath,
              baselinePath,
              diffPath,
              ok: false,
              error: "snapshot mismatch",
            },
          ],
          errors: ["desktop step 2 snapshot: snapshot mismatch"],
        },
      },
    ],
  } satisfies AgentReplayAllResult;

  writeReplayAllSummary(summaryPath, result);
  writeReplayAllReport(reportPath, {
    dir,
    durationMs: result.durationMs,
    updateSnapshots: false,
    entries: result.entries,
    summaryPath,
  });

  const summary = readAgentReplaySummaryPath(result.summaryPath);
  expect(summary.failureCount).toBe(1);
  expect(summary.entries?.[0]?.failedArtifacts?.[0]?.diffPath).toBe(diffPath);
  expect(existsSync(diffPath)).toBe(true);

  const html = readFileSync(result.reportPath, "utf8");
  expect(html).toContain("diff");
  expect(html).toContain("snapshot mismatch");
});

test("agent replay-all records invalid cassette as a failed entry", async () => {
  const dir = join(".tmp", "tests", "agent-replay-all-invalid");
  const cassetteDir = join(dir, "cassettes");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(cassetteDir, { recursive: true });

  const copiedCassettePath = join(cassetteDir, "agent_replay_all_invalid_fixture.cassette.json");
  copyCommittedCassette(copiedCassettePath);
  const cassette = JSON.parse(readFileSync(copiedCassettePath, "utf8")) as {
    frames?: Array<{ dom?: string }>;
  };
  cassette.frames![0]!.dom = "<div>tampered</div>";
  writeFileSync(copiedCassettePath, JSON.stringify(cassette, null, 2) + "\n", "utf8");

  const result = await replayAllAgentRecords({
    dir: cassetteDir,
    artifactsRoot: join(dir, "suite"),
    headless: true,
  });

  expect(result.ok).toBe(false);
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0]?.result.errors[0]).toContain("dom hash mismatch");
  expect(existsSync(result.reportPath)).toBe(true);
  expect(existsSync(result.summaryPath)).toBe(true);

  const summary = readAgentReplaySummaryPath(result.summaryPath);
  expect(summary.failureCount).toBe(1);
  expect(summary.entries?.[0]?.ok).toBe(false);
  expect(summary.entries?.[0]?.errors?.[0]).toContain("dom hash mismatch");
}, 20_000);

test("agent replay-all records invalid run record as a failed entry", async () => {
  const dir = join(".tmp", "tests", "agent-replay-all-invalid-run-record");
  const recordsDir = join(dir, "records");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(recordsDir, { recursive: true });

  const runRecordPath = join(recordsDir, "bad.agent-run.json");
  writeFileSync(
    runRecordPath,
    JSON.stringify(
      {
        version: 1,
        cassettePath: "missing.cassette.json",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const result = await replayAllAgentRecords({
    dir: recordsDir,
    artifactsRoot: join(dir, "suite"),
    headless: true,
  });

  expect(result.ok).toBe(false);
  expect(result.entries).toHaveLength(1);
  expect(result.entries[0]?.result.errors[0]).toContain("invalid agent run record");
  expect(existsSync(result.entries[0]!.result.recordPath)).toBe(true);

  const failedRecord = JSON.parse(readFileSync(result.entries[0]!.result.recordPath, "utf8")) as {
    $schema?: string;
    commands?: {
      replay?: { argv?: string[] };
      updateSnapshots?: { argv?: string[] };
    };
    cassettePath?: string;
    errors?: string[];
  };
  expect(failedRecord.$schema).toContain("ptywright-agent-run.schema.json");
  expect(failedRecord.cassettePath).toBe(resolve(runRecordPath));
  expect(failedRecord.commands?.replay?.argv).toEqual([
    "ptywright",
    "agent",
    "replay",
    resolve(runRecordPath),
  ]);
  expect(failedRecord.commands?.updateSnapshots?.argv).toEqual([
    "ptywright",
    "agent",
    "replay",
    resolve(runRecordPath),
    "--update-snapshots",
  ]);
  expect(failedRecord.errors?.[0]).toContain("invalid agent run record");

  const summary = readAgentReplaySummaryPath(result.summaryPath);
  expect(summary.failureCount).toBe(1);
  expect(summary.entries?.[0]?.ok).toBe(false);
  expect(summary.entries?.[0]?.errors?.[0]).toContain("invalid agent run record");
});
