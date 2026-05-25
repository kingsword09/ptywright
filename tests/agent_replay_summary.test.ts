import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "bun:test";

import {
  AGENT_REPLAY_SUMMARY_SCHEMA_URL,
  normalizeAgentReplaySummary,
  readAgentReplaySummaryPath,
  writeAgentReplaySummaryPath,
} from "../src/agent/summary";

test("agent replay summary normalizes to a stable suite contract", () => {
  const summary = normalizeAgentReplaySummary({
    version: 1,
    ok: true,
    dir: ".tmp/agent",
    suiteDir: ".tmp/agent-replay-all",
    durationMs: 10,
    reportPath: ".tmp/agent-replay-all/index.html",
    summaryPath: ".tmp/agent-replay-all/agent-replay.summary.json",
    commands: {
      replayAll: {
        argv: [
          "ptywright",
          "agent",
          "replay-all",
          ".tmp/agent",
          "--artifacts-root",
          ".tmp/agent-replay-all",
        ],
      },
      updateSnapshots: {
        argv: [
          "ptywright",
          "agent",
          "replay-all",
          ".tmp/agent",
          "--artifacts-root",
          ".tmp/agent-replay-all",
          "--update-snapshots",
        ],
      },
      rerun: {
        argv: ["ptywright", "agent", "rerun", ".tmp/agent-replay-all/agent-replay.summary.json"],
      },
    },
    updateSnapshots: false,
    totalCount: 1,
    failureCount: 0,
    entries: [
      {
        filePath: ".tmp/agent/example/example.agent-run.json",
        durationMs: 5,
        ok: true,
        mode: "replay",
        frames: 2,
        reportPath: ".tmp/agent-replay-all/tests/example/index.html",
        recordPath: ".tmp/agent-replay-all/tests/example/example.agent-run.json",
        cassettePath: ".tmp/agent/example/example.cassette.json",
        failedArtifacts: [],
        errors: [],
      },
    ],
  });

  expect(summary.$schema).toBe(AGENT_REPLAY_SUMMARY_SCHEMA_URL);
  expect(summary.totalCount).toBe(1);
  expect(summary.failureCount).toBe(0);
  expect(summary.commands.replayAll.argv).toEqual([
    "ptywright",
    "agent",
    "replay-all",
    ".tmp/agent",
    "--artifacts-root",
    ".tmp/agent-replay-all",
  ]);
  expect(summary.commands.updateSnapshots.argv).toEqual([
    "ptywright",
    "agent",
    "replay-all",
    ".tmp/agent",
    "--artifacts-root",
    ".tmp/agent-replay-all",
    "--update-snapshots",
  ]);
  expect(summary.commands.rerun.argv).toEqual([
    "ptywright",
    "agent",
    "rerun",
    ".tmp/agent-replay-all/agent-replay.summary.json",
  ]);
});

test("agent replay summary requires structured rerun commands", () => {
  expect(() =>
    normalizeAgentReplaySummary({
      version: 1,
      ok: true,
      dir: ".tmp/agent",
      suiteDir: ".tmp/agent-replay-all",
      durationMs: 10,
      reportPath: ".tmp/agent-replay-all/index.html",
      summaryPath: ".tmp/agent-replay-all/agent-replay.summary.json",
      updateSnapshots: false,
      totalCount: 0,
      failureCount: 0,
      entries: [],
    }),
  ).toThrow("commands: Required");
});

test("agent replay summary rejects inconsistent suite counts", () => {
  expect(() =>
    normalizeAgentReplaySummary({
      version: 1,
      ok: true,
      dir: ".tmp/agent",
      suiteDir: ".tmp/agent-replay-all",
      durationMs: 10,
      reportPath: ".tmp/agent-replay-all/index.html",
      summaryPath: ".tmp/agent-replay-all/agent-replay.summary.json",
      commands: {
        replayAll: {
          argv: [
            "ptywright",
            "agent",
            "replay-all",
            ".tmp/agent",
            "--artifacts-root",
            ".tmp/agent-replay-all",
          ],
        },
        updateSnapshots: {
          argv: [
            "ptywright",
            "agent",
            "replay-all",
            ".tmp/agent",
            "--artifacts-root",
            ".tmp/agent-replay-all",
            "--update-snapshots",
          ],
        },
        rerun: {
          argv: ["ptywright", "agent", "rerun", ".tmp/agent-replay-all/agent-replay.summary.json"],
        },
      },
      updateSnapshots: false,
      totalCount: 2,
      failureCount: 0,
      entries: [],
    }),
  ).toThrow("totalCount must equal entries.length");
});

test("agent replay summary rejects stale command metadata", () => {
  expect(() =>
    normalizeAgentReplaySummary({
      version: 1,
      ok: true,
      dir: ".tmp/agent",
      suiteDir: ".tmp/agent-replay-all",
      durationMs: 10,
      reportPath: ".tmp/agent-replay-all/index.html",
      summaryPath: ".tmp/agent-replay-all/agent-replay.summary.json",
      commands: {
        replayAll: {
          argv: [
            "ptywright",
            "agent",
            "replay-all",
            ".tmp/wrong-agent",
            "--artifacts-root",
            ".tmp/agent-replay-all",
          ],
        },
        updateSnapshots: {
          argv: [
            "ptywright",
            "agent",
            "replay-all",
            ".tmp/agent",
            "--artifacts-root",
            ".tmp/agent-replay-all",
            "--update-snapshots",
          ],
        },
        rerun: {
          argv: ["ptywright", "agent", "rerun", ".tmp/agent-replay-all/agent-replay.summary.json"],
        },
      },
      updateSnapshots: false,
      totalCount: 0,
      failureCount: 0,
      entries: [],
    }),
  ).toThrow("replayAll argv must match dir and suiteDir");
});

test("agent replay summary writer validates before persisting", () => {
  const dir = join(".tmp", "tests", "agent-replay-summary");
  const path = join(dir, "agent-replay.summary.json");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  writeAgentReplaySummaryPath(path, {
    $schema: AGENT_REPLAY_SUMMARY_SCHEMA_URL,
    version: 1,
    ok: false,
    dir,
    suiteDir: dir,
    durationMs: 1,
    reportPath: join(dir, "index.html"),
    summaryPath: path,
    commands: {
      replayAll: {
        argv: ["ptywright", "agent", "replay-all", dir, "--artifacts-root", dir],
      },
      updateSnapshots: {
        argv: [
          "ptywright",
          "agent",
          "replay-all",
          dir,
          "--artifacts-root",
          dir,
          "--update-snapshots",
        ],
      },
      rerun: {
        argv: ["ptywright", "agent", "rerun", path],
      },
    },
    updateSnapshots: false,
    totalCount: 1,
    failureCount: 1,
    entries: [
      {
        filePath: join(dir, "bad.cassette.json"),
        durationMs: 1,
        ok: false,
        mode: "replay",
        frames: 0,
        reportPath: join(dir, "tests", "bad", "index.html"),
        recordPath: join(dir, "tests", "bad", "failed.agent-run.json"),
        cassettePath: join(dir, "bad.cassette.json"),
        failedArtifacts: [],
        errors: ["invalid cassette"],
      },
    ],
  });

  expect(readAgentReplaySummaryPath(path).failureCount).toBe(1);

  writeFileSync(path, JSON.stringify({ version: 1, entries: [] }) + "\n", "utf8");
  expect(() => readAgentReplaySummaryPath(path)).toThrow("invalid agent replay summary");
});
