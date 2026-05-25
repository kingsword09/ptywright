import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test } from "bun:test";

import { checkAgentRegression } from "../src/agent/check";
import { rerunAgentSummary } from "../src/agent/rerun";
import { readAgentCheckSummaryPath } from "../src/agent/check_summary";
import { promoteAgentCassette } from "../src/agent/promote";
import {
  normalizeAgentPromoteSummary,
  readAgentPromoteSummaryPath,
} from "../src/agent/promote_summary";
import { normalizeAgentReplaySummary, readAgentReplaySummaryPath } from "../src/agent/summary";
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

test("agent rerun promotes again from an agent promote summary", async () => {
  const dir = join(".tmp", "tests", "agent-rerun-promote");
  const cassetteDir = join(dir, "cassettes");
  const snapshotDir = join(dir, "snapshots");
  const artifactsRoot = join(dir, "artifacts");
  rmSync(dir, { recursive: true, force: true });

  const first = await promoteAgentCassette({
    sourcePath: committedCassettePath(),
    cassetteDir,
    snapshotDir,
    artifactsRoot,
    updateSnapshots: true,
    headless: true,
  });
  expect(first.ok).toBe(true);

  const rerun = await rerunAgentSummary({
    path: first.summaryPath,
    headless: true,
  });

  expect(rerun.kind).toBe("promote-summary");
  expect(rerun.result.ok).toBe(true);
  expect(rerun.result.cassetteDir).toBe(cassetteDir);
  expect(rerun.result.snapshotDir).toBe(snapshotDir);
  expect(rerun.result.artifactsRoot).toBe(artifactsRoot);
  expect(existsSync(rerun.result.targetCassettePath)).toBe(true);

  const summary = readAgentPromoteSummaryPath(rerun.result.summaryPath);
  expect(summary.commands.promote.argv).toContain("promote");
  expect(summary.commands.check.argv).toContain(cassetteDir);
  expect(summary.commands.rerun.argv).toEqual([
    "ptywright",
    "agent",
    "rerun",
    rerun.result.summaryPath,
  ]);
}, 30_000);

test("agent rerun can override the promote summary artifacts root", async () => {
  const dir = join(".tmp", "tests", "agent-rerun-promote-override");
  const cassetteDir = join(dir, "cassettes");
  const snapshotDir = join(dir, "snapshots");
  const artifactsRoot = join(dir, "artifacts");
  const rerunRoot = join(dir, "rerun-artifacts");
  rmSync(dir, { recursive: true, force: true });

  const first = await promoteAgentCassette({
    sourcePath: committedCassettePath(),
    cassetteDir,
    snapshotDir,
    artifactsRoot,
    updateSnapshots: true,
    headless: true,
  });
  expect(first.ok).toBe(true);

  const rerun = await rerunAgentSummary({
    path: first.summaryPath,
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
  rmSync(artifactsRoot, { recursive: true, force: true });

  const first = await checkAgentRegression({
    cassetteDir: "tests/agent-cassettes",
    artifactsRoot,
    headless: true,
  });
  expect(first.ok).toBe(true);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "rerun", first.summaryPath, "--json"]);
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
  expect(parsed.commands?.rerun?.argv).toEqual(["ptywright", "agent", "rerun", first.summaryPath]);
}, 30_000);

test("agent rerun CLI honors --artifacts-root", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-rerun-cli-source");
  const rerunRoot = join(".tmp", "tests", "agent-rerun-cli-override");
  rmSync(artifactsRoot, { recursive: true, force: true });
  rmSync(rerunRoot, { recursive: true, force: true });

  const first = await checkAgentRegression({
    cassetteDir: "tests/agent-cassettes",
    artifactsRoot,
    headless: true,
  });
  expect(first.ok).toBe(true);

  process.exitCode = undefined;
  try {
    await main(["agent", "rerun", first.summaryPath, "--artifacts-root", rerunRoot]);
    expect(currentExitCode()).toBe(0);
  } finally {
    process.exitCode = 0;
  }

  const summaryPath = join(rerunRoot, "agent-check.summary.json");
  expect(existsSync(summaryPath)).toBe(true);
  const summary = readAgentCheckSummaryPath(summaryPath);
  expect(summary.artifactsRoot).toBe(rerunRoot);
  expect(summary.commands.rerun.argv).toEqual(["ptywright", "agent", "rerun", summaryPath]);
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
  rmSync(artifactsRoot, { recursive: true, force: true });

  const first = await checkAgentRegression({
    cassetteDir: "tests/agent-cassettes",
    artifactsRoot,
    headless: true,
  });
  expect(first.ok).toBe(true);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "rerun", first.replay.summaryPath, "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const parsed = readAgentReplaySummaryFromJson(logs.join("\n"));
  expect(parsed).toMatchObject({
    ok: true,
    totalCount: 1,
    failureCount: 0,
  });
  expect(parsed.commands.replayAll.argv).toContain("replay-all");
  expect(parsed.commands.rerun.argv).toEqual([
    "ptywright",
    "agent",
    "rerun",
    first.replay.summaryPath,
  ]);
}, 30_000);

test("agent rerun CLI prints promote summary JSON for promote summaries", async () => {
  const dir = join(".tmp", "tests", "agent-rerun-cli-promote-json");
  const cassetteDir = join(dir, "cassettes");
  const snapshotDir = join(dir, "snapshots");
  const artifactsRoot = join(dir, "artifacts");
  rmSync(dir, { recursive: true, force: true });

  const first = await promoteAgentCassette({
    sourcePath: committedCassettePath(),
    cassetteDir,
    snapshotDir,
    artifactsRoot,
    updateSnapshots: true,
    headless: true,
  });
  expect(first.ok).toBe(true);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "rerun", first.summaryPath, "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const parsed = readAgentPromoteSummaryFromJson(logs.join("\n"));
  expect(parsed).toMatchObject({
    ok: true,
    cassetteDir,
    snapshotDir,
  });
  expect(parsed.commands.promote.argv).toContain("promote");
  expect(parsed.commands.rerun.argv).toEqual(["ptywright", "agent", "rerun", first.summaryPath]);
}, 30_000);
