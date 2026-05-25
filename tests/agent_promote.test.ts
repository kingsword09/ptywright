import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { expect, test } from "bun:test";

import { readAgentCassettePath } from "../src/agent/cassette";
import { readAgentArtifactCommandsPath } from "../src/agent/commands";
import {
  formatAgentPromoteSummary,
  promoteAgentCassette,
  type AgentPromoteResult,
} from "../src/agent/promote";
import {
  AGENT_PROMOTE_SCHEMA_URL,
  normalizeAgentPromoteSummary,
  readAgentPromoteSummaryPath,
} from "../src/agent/promote_summary";
import { validateAgentArtifactsPath } from "../src/agent/validate";
import { main } from "../src/cli";

function currentExitCode(): string | number | null | undefined {
  return process.exitCode;
}

function committedCassettePath(): string {
  return join(
    "tests",
    "agent-cassettes",
    "agent_deterministic",
    "agent_deterministic.cassette.json",
  );
}

function writeRunRecordForCassette(path: string, cassettePath: string): void {
  const absoluteCassettePath = resolve(cassettePath);
  const cassette = readAgentCassettePath(absoluteCassettePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        version: 1,
        name: cassette.name,
        ok: true,
        startedAt: "2026-05-24T00:00:00.000Z",
        durationMs: 1,
        mode: "live",
        spec: cassette.spec,
        flowPath: `${cassette.name}.flow.json`,
        artifactsDir: dirname(path),
        snapshotDir: cassette.spec.snapshotDir,
        reportPath: join(dirname(path), "index.html"),
        cassettePath: absoluteCassettePath,
        cassetteFrameCount: cassette.frames.length,
        replayCommand: `ptywright agent replay ${path}`,
        commands: {
          replay: {
            argv: ["ptywright", "agent", "replay", path],
          },
          updateSnapshots: {
            argv: ["ptywright", "agent", "replay", path, "--update-snapshots"],
          },
        },
        steps: [],
        artifacts: [],
        errors: [],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
}

async function assertPromoted(
  result: AgentPromoteResult,
  args: { cassetteDir: string; snapshotDir: string },
) {
  expect(result.ok).toBe(true);
  expect(result.validation.ok).toBe(true);
  expect(result.replay.ok).toBe(true);
  expect(existsSync(result.targetCassettePath)).toBe(true);
  expect(existsSync(result.summaryPath)).toBe(true);
  expect(existsSync(join(args.snapshotDir, "desktop.ready.terminal.snap.txt"))).toBe(true);

  const promoted = readAgentCassettePath(result.targetCassettePath);
  expect(promoted.spec.snapshotDir).toBe(args.snapshotDir);
  expect(promoted.frames).toHaveLength(4);

  const summary = readAgentPromoteSummaryPath(result.summaryPath);
  expect(summary).toMatchObject({
    $schema: AGENT_PROMOTE_SCHEMA_URL,
    ok: true,
    cassetteDir: args.cassetteDir,
    snapshotDir: args.snapshotDir,
    validation: { ok: true, totalCount: 1, failureCount: 0 },
    replay: { ok: true, totalCount: 1, failureCount: 0 },
  });
  expect(summary.commands.check.argv).toEqual([
    "ptywright",
    "agent",
    "check",
    args.cassetteDir,
    "--artifacts-root",
    result.artifactsRoot,
  ]);
  expect(summary.commands.updateSnapshots.argv).toContain("--update-snapshots");
  expect(summary.commands.rerun.argv).toEqual(["ptywright", "agent", "rerun", result.summaryPath]);

  const validated = await validateAgentArtifactsPath(result.summaryPath);
  expect(validated).toMatchObject({ ok: true, totalCount: 1, failureCount: 0 });
}

test("agent promote copies a cassette into a replayable committed suite", async () => {
  const dir = join(".tmp", "tests", "agent-promote");
  const cassetteDir = join(dir, "cassettes");
  const snapshotDir = join(dir, "snapshots");
  const artifactsRoot = join(dir, "artifacts");
  rmSync(dir, { recursive: true, force: true });

  const result = await promoteAgentCassette({
    sourcePath: committedCassettePath(),
    cassetteDir,
    snapshotDir,
    artifactsRoot,
    updateSnapshots: true,
    headless: true,
  });

  await assertPromoted(result, { cassetteDir, snapshotDir });
  expect(formatAgentPromoteSummary(result).commands.promote.argv).toContain("--update-snapshots");
}, 15_000);

test("agent promote accepts run records that point at a cassette", async () => {
  const dir = join(".tmp", "tests", "agent-promote-run-record");
  const cassetteDir = join(dir, "cassettes");
  const snapshotDir = join(dir, "snapshots");
  const artifactsRoot = join(dir, "artifacts");
  const runRecordPath = join(dir, "source.agent-run.json");
  rmSync(dir, { recursive: true, force: true });
  writeRunRecordForCassette(runRecordPath, committedCassettePath());

  const result = await promoteAgentCassette({
    sourcePath: runRecordPath,
    cassetteDir,
    snapshotDir,
    artifactsRoot,
    updateSnapshots: true,
    headless: true,
  });

  await assertPromoted(result, { cassetteDir, snapshotDir });
}, 15_000);

test("agent promote manifest bundle can rerun after the original artifact root is deleted", async () => {
  const dir = join(".tmp", "tests", "agent-promote-copy");
  const cassetteDir = join(dir, "cassettes");
  const snapshotDir = join(dir, "snapshots");
  const artifactsRoot = join(dir, "artifacts");
  const copyRoot = join(dir, "artifacts-moved");
  rmSync(dir, { recursive: true, force: true });

  const result = await promoteAgentCassette({
    sourcePath: committedCassettePath(),
    cassetteDir,
    snapshotDir,
    artifactsRoot,
    updateSnapshots: true,
    headless: true,
  });
  await assertPromoted(result, { cassetteDir, snapshotDir });

  cpSync(artifactsRoot, copyRoot, { recursive: true });
  rmSync(artifactsRoot, { recursive: true, force: true });
  expect(existsSync(artifactsRoot)).toBe(false);

  const commands = await readAgentArtifactCommandsPath(copyRoot);
  expect(commands.commands.rerun.argv).toEqual([
    "ptywright",
    "agent",
    "rerun",
    join(copyRoot, "agent-promote.summary.json"),
    "--artifacts-root",
    copyRoot,
  ]);
  expect(commands.commands.updateSnapshots.argv).toEqual([
    "ptywright",
    "agent",
    "check",
    cassetteDir,
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

  expect(logs.join("\n")).toContain("ok agent-promote");
  expect(logs.join("\n")).toContain(`summary=${join(copyRoot, "agent-promote.summary.json")}`);
  expect(await validateAgentArtifactsPath(copyRoot, { preferManifestBundle: true })).toMatchObject({
    ok: true,
    totalCount: 1,
    failureCount: 0,
  });
}, 25_000);

test("agent promote summary next to a moved manifest reruns into the moved bundle root", async () => {
  const dir = join(".tmp", "tests", "agent-promote-summary-copy");
  const cassetteDir = join(dir, "cassettes");
  const snapshotDir = join(dir, "snapshots");
  const artifactsRoot = join(dir, "artifacts");
  const copyRoot = join(dir, "artifacts-moved");
  rmSync(dir, { recursive: true, force: true });

  const result = await promoteAgentCassette({
    sourcePath: committedCassettePath(),
    cassetteDir,
    snapshotDir,
    artifactsRoot,
    updateSnapshots: true,
    headless: true,
  });
  await assertPromoted(result, { cassetteDir, snapshotDir });

  cpSync(artifactsRoot, copyRoot, { recursive: true });
  rmSync(artifactsRoot, { recursive: true, force: true });

  const movedSummaryPath = join(copyRoot, "agent-promote.summary.json");
  const logs: string[] = [];
  const originalLog = console.log;

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

  expect(logs.join("\n")).toContain("ok agent-promote");
  expect(logs.join("\n")).toContain(`summary=${join(copyRoot, "agent-promote.summary.json")}`);
  expect(await validateAgentArtifactsPath(copyRoot, { preferManifestBundle: true })).toMatchObject({
    ok: true,
    totalCount: 1,
    failureCount: 0,
  });
}, 25_000);

test("agent promote CLI accepts JSON output mode", async () => {
  const dir = join(".tmp", "tests", "agent-promote-cli-json");
  const cassetteDir = join(dir, "cassettes");
  const snapshotDir = join(dir, "snapshots");
  const artifactsRoot = join(dir, "artifacts");
  rmSync(dir, { recursive: true, force: true });
  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main([
      "agent",
      "promote",
      committedCassettePath(),
      "--cassette-dir",
      cassetteDir,
      "--snapshot-dir",
      snapshotDir,
      "--artifacts-root",
      artifactsRoot,
      "--update-snapshots",
      "--json",
    ]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const parsed = normalizeAgentPromoteSummary(JSON.parse(logs.join("\n")) as unknown);
  expect(parsed.ok).toBe(true);
  expect(parsed.targetCassettePath).toBe(
    join(cassetteDir, "agent_deterministic", "agent_deterministic.cassette.json"),
  );
  expect(existsSync(parsed.summaryPath)).toBe(true);
}, 15_000);

test("agent promote summary rejects stale command metadata", () => {
  expect(() =>
    normalizeAgentPromoteSummary({
      version: 1,
      ok: true,
      sourcePath: "source.cassette.json",
      cassetteDir: "tests/agent-cassettes",
      targetDir: "tests/agent-cassettes/source",
      targetCassettePath: "tests/agent-cassettes/source/source.cassette.json",
      snapshotDir: "tests/agent-snapshots/source",
      artifactsRoot: ".tmp/agent-promote/source",
      summaryPath: ".tmp/agent-promote/source/agent-promote.summary.json",
      updateSnapshots: false,
      commands: {
        promote: {
          argv: [
            "ptywright",
            "agent",
            "promote",
            "wrong.cassette.json",
            "--cassette-dir",
            "tests/agent-cassettes",
            "--snapshot-dir",
            "tests/agent-snapshots/source",
            "--artifacts-root",
            ".tmp/agent-promote/source",
          ],
        },
        check: {
          argv: [
            "ptywright",
            "agent",
            "check",
            "tests/agent-cassettes",
            "--artifacts-root",
            ".tmp/agent-promote/source",
          ],
        },
        updateSnapshots: {
          argv: [
            "ptywright",
            "agent",
            "check",
            "tests/agent-cassettes",
            "--artifacts-root",
            ".tmp/agent-promote/source",
            "--update-snapshots",
          ],
        },
        rerun: {
          argv: [
            "ptywright",
            "agent",
            "rerun",
            ".tmp/agent-promote/source/agent-promote.summary.json",
          ],
        },
      },
      validation: { ok: true, totalCount: 1, failureCount: 0 },
      replay: {
        ok: true,
        totalCount: 1,
        failureCount: 0,
        reportPath: ".tmp/agent-promote/source/index.html",
        summaryPath: ".tmp/agent-promote/source/agent-replay.summary.json",
      },
      failures: [],
    }),
  ).toThrow("promote argv must match sourcePath");
});

test("agent promote summary requires structured rerun commands", () => {
  expect(() =>
    normalizeAgentPromoteSummary({
      version: 1,
      ok: true,
      sourcePath: "source.cassette.json",
      cassetteDir: "tests/agent-cassettes",
      targetDir: "tests/agent-cassettes/source",
      targetCassettePath: "tests/agent-cassettes/source/source.cassette.json",
      snapshotDir: "tests/agent-snapshots/source",
      artifactsRoot: ".tmp/agent-promote/source",
      summaryPath: ".tmp/agent-promote/source/agent-promote.summary.json",
      updateSnapshots: false,
      validation: { ok: true, totalCount: 1, failureCount: 0 },
      replay: {
        ok: true,
        totalCount: 1,
        failureCount: 0,
        reportPath: ".tmp/agent-promote/source/index.html",
        summaryPath: ".tmp/agent-promote/source/agent-replay.summary.json",
      },
      failures: [],
    }),
  ).toThrow("commands: Required");
});

test("agent promote summary rejects stale rerun metadata", () => {
  expect(() =>
    normalizeAgentPromoteSummary({
      version: 1,
      ok: true,
      sourcePath: "source.cassette.json",
      cassetteDir: "tests/agent-cassettes",
      targetDir: "tests/agent-cassettes/source",
      targetCassettePath: "tests/agent-cassettes/source/source.cassette.json",
      snapshotDir: "tests/agent-snapshots/source",
      artifactsRoot: ".tmp/agent-promote/source",
      summaryPath: ".tmp/agent-promote/source/agent-promote.summary.json",
      updateSnapshots: false,
      commands: {
        promote: {
          argv: [
            "ptywright",
            "agent",
            "promote",
            "source.cassette.json",
            "--cassette-dir",
            "tests/agent-cassettes",
            "--snapshot-dir",
            "tests/agent-snapshots/source",
            "--artifacts-root",
            ".tmp/agent-promote/source",
          ],
        },
        check: {
          argv: [
            "ptywright",
            "agent",
            "check",
            "tests/agent-cassettes",
            "--artifacts-root",
            ".tmp/agent-promote/source",
          ],
        },
        updateSnapshots: {
          argv: [
            "ptywright",
            "agent",
            "check",
            "tests/agent-cassettes",
            "--artifacts-root",
            ".tmp/agent-promote/source",
            "--update-snapshots",
          ],
        },
        rerun: {
          argv: ["ptywright", "agent", "rerun", ".tmp/stale/agent-promote.summary.json"],
        },
      },
      validation: { ok: true, totalCount: 1, failureCount: 0 },
      replay: {
        ok: true,
        totalCount: 1,
        failureCount: 0,
        reportPath: ".tmp/agent-promote/source/index.html",
        summaryPath: ".tmp/agent-promote/source/agent-replay.summary.json",
      },
      failures: [],
    }),
  ).toThrow("rerun argv must match summaryPath");
});
