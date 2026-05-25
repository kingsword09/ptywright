import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test } from "bun:test";

import { checkAgentRegression } from "../src/agent/check";
import { rerunAgentSummary } from "../src/agent/rerun";
import { readAgentCheckSummaryPath, writeAgentCheckSummaryPath } from "../src/agent/check_summary";
import {
  normalizeAgentPromoteSummary,
  readAgentPromoteSummaryPath,
  writeAgentPromoteSummaryPath,
} from "../src/agent/promote_summary";
import {
  normalizeAgentReplaySummary,
  readAgentReplaySummaryPath,
  writeAgentReplaySummaryPath,
} from "../src/agent/summary";
import { main } from "../src/cli";

function currentExitCode(): string | number | null | undefined {
  return process.exitCode;
}

function readAgentReplaySummaryFromJson(json: string) {
  return normalizeAgentReplaySummary(JSON.parse(json) as unknown);
}

function readAgentPromoteSummaryFromJson(json: string) {
  return normalizeAgentPromoteSummary(JSON.parse(json) as unknown);
}

function committedCassettePath(): string {
  return join(
    "tests",
    "agent-cassettes",
    "agent_deterministic",
    "agent_deterministic.cassette.json",
  );
}

function writeFlowOnlyInputDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "input.flow.json"),
    JSON.stringify(
      {
        name: "agent_rerun_input",
        launch: { mode: "url", url: "http://127.0.0.1:9/" },
        steps: [{ type: "snapshot", name: "noop" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

function writeCheckSummaryFixture(artifactsRoot: string, cassetteDir: string): string {
  const summaryPath = join(artifactsRoot, "agent-check.summary.json");
  const check = ["ptywright", "agent", "check", cassetteDir, "--artifacts-root", artifactsRoot];
  writeAgentCheckSummaryPath(summaryPath, {
    version: 1,
    ok: true,
    cassetteDir,
    artifactsRoot,
    summaryPath,
    commands: {
      check: { argv: check },
      updateSnapshots: { argv: [...check, "--update-snapshots"] },
      rerun: { argv: ["ptywright", "agent", "rerun", summaryPath] },
    },
    inputs: { totalCount: 1, failureCount: 0 },
    replay: {
      ok: true,
      totalCount: 0,
      failureCount: 0,
      reportPath: join(artifactsRoot, "index.html"),
      summaryPath: join(artifactsRoot, "agent-replay.summary.json"),
    },
    outputs: { totalCount: 0, failureCount: 0 },
    failures: [],
  });
  return summaryPath;
}

function writeReplaySummaryFixture(artifactsRoot: string, dir: string): string {
  mkdirSync(artifactsRoot, { recursive: true });
  mkdirSync(dir, { recursive: true });
  const summaryPath = join(artifactsRoot, "agent-replay.summary.json");
  const replayAll = ["ptywright", "agent", "replay-all", dir, "--artifacts-root", artifactsRoot];
  writeAgentReplaySummaryPath(summaryPath, {
    version: 1,
    ok: true,
    dir,
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
  return summaryPath;
}

function writePromoteSummaryFixture(args: {
  sourcePath: string;
  cassetteDir: string;
  snapshotDir: string;
  artifactsRoot: string;
}): string {
  const summaryPath = join(args.artifactsRoot, "agent-promote.summary.json");
  const promote = [
    "ptywright",
    "agent",
    "promote",
    args.sourcePath,
    "--cassette-dir",
    args.cassetteDir,
    "--snapshot-dir",
    args.snapshotDir,
    "--artifacts-root",
    args.artifactsRoot,
    "--update-snapshots",
  ];
  const check = [
    "ptywright",
    "agent",
    "check",
    args.cassetteDir,
    "--artifacts-root",
    args.artifactsRoot,
  ];
  writeAgentPromoteSummaryPath(summaryPath, {
    version: 1,
    ok: true,
    sourcePath: args.sourcePath,
    cassetteDir: args.cassetteDir,
    targetDir: join(args.cassetteDir, "agent_deterministic"),
    targetCassettePath: join(
      args.cassetteDir,
      "agent_deterministic",
      "agent_deterministic.cassette.json",
    ),
    snapshotDir: args.snapshotDir,
    artifactsRoot: args.artifactsRoot,
    summaryPath,
    updateSnapshots: true,
    commands: {
      promote: { argv: promote },
      check: { argv: check },
      updateSnapshots: { argv: [...check, "--update-snapshots"] },
      rerun: { argv: ["ptywright", "agent", "rerun", summaryPath] },
    },
    validation: { ok: true, totalCount: 0, failureCount: 0 },
    replay: {
      ok: true,
      totalCount: 0,
      failureCount: 0,
      reportPath: join(args.artifactsRoot, "index.html"),
      summaryPath: join(args.artifactsRoot, "agent-replay.summary.json"),
    },
    failures: [],
  });
  return summaryPath;
}

test("agent rerun replays from an agent check summary", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-rerun-check");
  rmSync(artifactsRoot, { recursive: true, force: true });

  const first = await checkAgentRegression({
    cassetteDir: "tests/agent-cassettes",
    artifactsRoot,
    headless: true,
  });
  expect(first.ok).toBe(true);

  const rerun = await rerunAgentSummary({
    path: first.summaryPath,
    headless: true,
  });

  expect(rerun.kind).toBe("check-summary");
  expect(rerun.result.ok).toBe(true);
  expect(rerun.result.cassetteDir).toBe("tests/agent-cassettes");
  expect(rerun.result.artifactsRoot).toBe(artifactsRoot);
  expect(existsSync(rerun.result.summaryPath)).toBe(true);

  const checkSummary = readAgentCheckSummaryPath(rerun.result.summaryPath);
  expect(checkSummary.commands.check.argv).toEqual([
    "ptywright",
    "agent",
    "check",
    "tests/agent-cassettes",
    "--artifacts-root",
    artifactsRoot,
  ]);
  expect(checkSummary.commands.rerun.argv).toEqual([
    "ptywright",
    "agent",
    "rerun",
    rerun.result.summaryPath,
  ]);
}, 30_000);

test("agent rerun can override the check summary artifacts root", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-rerun-check-source");
  const rerunRoot = join(".tmp", "tests", "agent-rerun-check-override");
  rmSync(artifactsRoot, { recursive: true, force: true });
  rmSync(rerunRoot, { recursive: true, force: true });

  const first = await checkAgentRegression({
    cassetteDir: "tests/agent-cassettes",
    artifactsRoot,
    headless: true,
  });
  expect(first.ok).toBe(true);

  const rerun = await rerunAgentSummary({
    path: first.summaryPath,
    artifactsRoot: rerunRoot,
    headless: true,
  });

  expect(rerun.kind).toBe("check-summary");
  expect(rerun.result.ok).toBe(true);
  expect(rerun.result.artifactsRoot).toBe(rerunRoot);
  expect(rerun.result.summaryPath).toBe(join(rerunRoot, "agent-check.summary.json"));
  expect(existsSync(join(rerunRoot, "agent-check.summary.json"))).toBe(true);
  const checkSummary = readAgentCheckSummaryPath(rerun.result.summaryPath);
  expect(checkSummary.commands.check.argv).toContain(rerunRoot);
  expect(checkSummary.commands.rerun.argv).toEqual([
    "ptywright",
    "agent",
    "rerun",
    rerun.result.summaryPath,
  ]);
}, 30_000);

test("agent rerun replays from an agent replay summary", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-rerun-replay");
  rmSync(artifactsRoot, { recursive: true, force: true });

  const first = await checkAgentRegression({
    cassetteDir: "tests/agent-cassettes",
    artifactsRoot,
    headless: true,
  });
  expect(first.ok).toBe(true);

  const rerun = await rerunAgentSummary({
    path: first.replay.summaryPath,
    headless: true,
  });

  expect(rerun.kind).toBe("replay-summary");
  expect(rerun.result.ok).toBe(true);
  expect(rerun.result.entries).toHaveLength(1);
  expect(rerun.result.dir).toContain("tests/agent-cassettes");
  expect(rerun.result.suiteDir).toBe(resolve(artifactsRoot));

  const replaySummary = readAgentReplaySummaryPath(rerun.result.summaryPath);
  expect(replaySummary.commands.updateSnapshots.argv).toContain("--update-snapshots");
  expect(replaySummary.commands.rerun.argv).toEqual([
    "ptywright",
    "agent",
    "rerun",
    rerun.result.summaryPath,
  ]);
}, 30_000);

test("agent rerun can override the replay summary artifacts root", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-rerun-replay-source");
  const rerunRoot = join(".tmp", "tests", "agent-rerun-replay-override");
  rmSync(artifactsRoot, { recursive: true, force: true });
  rmSync(rerunRoot, { recursive: true, force: true });

  const first = await checkAgentRegression({
    cassetteDir: "tests/agent-cassettes",
    artifactsRoot,
    headless: true,
  });
  expect(first.ok).toBe(true);

  const rerun = await rerunAgentSummary({
    path: first.replay.summaryPath,
    artifactsRoot: rerunRoot,
    headless: true,
  });

  expect(rerun.kind).toBe("replay-summary");
  expect(rerun.result.ok).toBe(true);
  expect(rerun.result.suiteDir).toBe(resolve(rerunRoot));
  expect(rerun.result.summaryPath).toBe(resolve(join(rerunRoot, "agent-replay.summary.json")));
  expect(existsSync(join(rerunRoot, "agent-replay.summary.json"))).toBe(true);
  const replaySummary = readAgentReplaySummaryPath(rerun.result.summaryPath);
  expect(replaySummary.commands.replayAll.argv).toContain(resolve(rerunRoot));
  expect(replaySummary.commands.rerun.argv).toEqual([
    "ptywright",
    "agent",
    "rerun",
    rerun.result.summaryPath,
  ]);
}, 30_000);

test("agent promote summary exposes a reusable rerun command", async () => {
  const dir = join(".tmp", "tests", "agent-rerun-promote");
  const cassetteDir = join(dir, "cassettes");
  const snapshotDir = join(dir, "snapshots");
  const artifactsRoot = join(dir, "artifacts");
  rmSync(dir, { recursive: true, force: true });

  const summaryPath = writePromoteSummaryFixture({
    sourcePath: committedCassettePath(),
    cassetteDir,
    snapshotDir,
    artifactsRoot,
  });

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "commands", summaryPath, "--command", "rerun", "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const selected = JSON.parse(logs.join("\n")) as {
    name?: string;
    command?: { argv?: string[] };
  };
  expect(selected.name).toBe("rerun");
  expect(selected.command?.argv).toEqual(["ptywright", "agent", "rerun", summaryPath]);

  const summary = readAgentPromoteSummaryPath(summaryPath);
  expect(summary.commands.promote.argv).toContain("promote");
  expect(summary.commands.check.argv).toContain(cassetteDir);
  expect(summary.commands.rerun.argv).toEqual(["ptywright", "agent", "rerun", summaryPath]);
}, 30_000);

test("agent rerun can override the promote summary artifacts root", async () => {
  const dir = join(".tmp", "tests", "agent-rerun-promote-override");
  const cassetteDir = join(dir, "cassettes");
  const snapshotDir = join(dir, "snapshots");
  const artifactsRoot = join(dir, "artifacts");
  const rerunRoot = join(dir, "rerun-artifacts");
  rmSync(dir, { recursive: true, force: true });

  const summaryPath = writePromoteSummaryFixture({
    sourcePath: committedCassettePath(),
    cassetteDir,
    snapshotDir,
    artifactsRoot,
  });

  const rerun = await rerunAgentSummary({
    path: summaryPath,
    artifactsRoot: rerunRoot,
    headless: true,
  });

  expect(rerun.kind).toBe("promote-summary");
  expect(rerun.result.ok).toBe(true);
  expect(rerun.result.artifactsRoot).toBe(rerunRoot);
  expect(rerun.result.summaryPath).toBe(join(rerunRoot, "agent-promote.summary.json"));
  const summary = readAgentPromoteSummaryPath(rerun.result.summaryPath);
  expect(summary.commands.check.argv).toContain(rerunRoot);
  expect(summary.commands.rerun.argv).toEqual([
    "ptywright",
    "agent",
    "rerun",
    rerun.result.summaryPath,
  ]);
}, 30_000);

test("agent rerun CLI accepts summary paths and JSON output", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-rerun-cli");
  const inputDir = join(".tmp", "tests", "agent-rerun-cli-input");
  rmSync(artifactsRoot, { recursive: true, force: true });
  rmSync(inputDir, { recursive: true, force: true });
  writeFlowOnlyInputDir(inputDir);
  const summaryPath = writeCheckSummaryFixture(artifactsRoot, inputDir);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "rerun", summaryPath, "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const parsed = JSON.parse(logs.join("\n")) as {
    commands?: { check?: { argv?: string[] } };
    ok?: boolean;
  };
  expect(parsed.ok).toBe(true);
  expect(parsed.commands?.check?.argv).toContain("check");
  expect(parsed.commands?.rerun?.argv).toEqual(["ptywright", "agent", "rerun", summaryPath]);
}, 30_000);

test("agent rerun CLI honors --artifacts-root", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-rerun-cli-source");
  const rerunRoot = join(".tmp", "tests", "agent-rerun-cli-override");
  const inputDir = join(".tmp", "tests", "agent-rerun-cli-override-input");
  rmSync(artifactsRoot, { recursive: true, force: true });
  rmSync(rerunRoot, { recursive: true, force: true });
  rmSync(inputDir, { recursive: true, force: true });
  writeFlowOnlyInputDir(inputDir);
  const summaryPath = writeCheckSummaryFixture(artifactsRoot, inputDir);

  process.exitCode = undefined;
  try {
    await main(["agent", "rerun", summaryPath, "--artifacts-root", rerunRoot]);
    expect(currentExitCode()).toBe(0);
  } finally {
    process.exitCode = 0;
  }

  const rerunSummaryPath = join(rerunRoot, "agent-check.summary.json");
  expect(existsSync(rerunSummaryPath)).toBe(true);
  const summary = readAgentCheckSummaryPath(rerunSummaryPath);
  expect(summary.artifactsRoot).toBe(rerunRoot);
  expect(summary.commands.rerun.argv).toEqual(["ptywright", "agent", "rerun", rerunSummaryPath]);
}, 30_000);

test("agent rerun CLI can rerun replay summaries with update mode", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-rerun-cli-replay");
  rmSync(artifactsRoot, { recursive: true, force: true });

  const first = await checkAgentRegression({
    cassetteDir: "tests/agent-cassettes",
    artifactsRoot,
    headless: true,
  });
  expect(first.ok).toBe(true);

  process.exitCode = undefined;
  try {
    await main(["agent", "rerun", first.replay.summaryPath, "--update-snapshots"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    process.exitCode = 0;
  }

  const summary = readAgentReplaySummaryPath(first.replay.summaryPath);
  expect(summary.updateSnapshots).toBe(true);
  expect(readFileSync(summary.reportPath, "utf8")).toContain("update snapshots");
}, 30_000);

test("agent rerun CLI prints replay summary JSON for replay summaries", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-rerun-cli-replay-json");
  const inputDir = join(".tmp", "tests", "agent-rerun-cli-replay-json-input");
  rmSync(artifactsRoot, { recursive: true, force: true });
  rmSync(inputDir, { recursive: true, force: true });
  const summaryPath = writeReplaySummaryFixture(artifactsRoot, inputDir);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "rerun", summaryPath, "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const parsed = readAgentReplaySummaryFromJson(logs.join("\n"));
  expect(parsed).toMatchObject({
    ok: true,
    totalCount: 0,
    failureCount: 0,
  });
  expect(parsed.commands.replayAll.argv).toContain("replay-all");
  expect(parsed.commands.rerun.argv).toEqual([
    "ptywright",
    "agent",
    "rerun",
    resolve(artifactsRoot, "agent-replay.summary.json"),
  ]);
}, 30_000);

test("agent promote summary JSON normalizes stored rerun metadata", () => {
  const dir = join(".tmp", "tests", "agent-rerun-cli-promote-json");
  const cassetteDir = join(dir, "cassettes");
  const snapshotDir = join(dir, "snapshots");
  const artifactsRoot = join(dir, "artifacts");
  rmSync(dir, { recursive: true, force: true });

  const summaryPath = writePromoteSummaryFixture({
    sourcePath: committedCassettePath(),
    cassetteDir,
    snapshotDir,
    artifactsRoot,
  });

  const parsed = readAgentPromoteSummaryFromJson(readFileSync(summaryPath, "utf8"));
  expect(parsed).toMatchObject({
    ok: true,
    cassetteDir,
    snapshotDir,
  });
  expect(parsed.commands.promote.argv).toContain("promote");
  expect(parsed.commands.rerun.argv).toEqual(["ptywright", "agent", "rerun", summaryPath]);
});
