import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { checkAgentRegression, formatAgentCheckJson } from "../src/agent/check";
import {
  AGENT_CHECK_SCHEMA_URL,
  normalizeAgentCheckJsonSummary,
  readAgentCheckSummaryPath,
} from "../src/agent/check_summary";
import { main } from "../src/cli";

function currentExitCode(): string | number | null | undefined {
  return process.exitCode;
}

test("agent check replays committed cassettes and validates outputs", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-check");
  rmSync(artifactsRoot, { recursive: true, force: true });

  const result = await checkAgentRegression({
    cassetteDir: "tests/agent-cassettes",
    artifactsRoot,
    headless: true,
  });

  expect(result.ok).toBe(true);
  expect(result.validationBefore.ok).toBe(true);
  expect(result.replay.ok).toBe(true);
  expect(result.validationAfter.ok).toBe(true);
  expect(existsSync(result.summaryPath)).toBe(true);
  expect(result.replay.entries.length).toBeGreaterThan(0);
  expect(existsSync(result.replay.summaryPath)).toBe(true);
  expect(existsSync(result.replay.reportPath)).toBe(true);
  expect(readAgentCheckSummaryPath(result.summaryPath)).toMatchObject({
    ok: true,
    inputs: { totalCount: 1 },
    commands: {
      check: {
        argv: [
          "ptywright",
          "agent",
          "check",
          "tests/agent-cassettes",
          "--artifacts-root",
          artifactsRoot,
        ],
      },
      updateSnapshots: {
        argv: [
          "ptywright",
          "agent",
          "check",
          "tests/agent-cassettes",
          "--artifacts-root",
          artifactsRoot,
          "--update-snapshots",
        ],
      },
      rerun: {
        argv: ["ptywright", "agent", "rerun", result.summaryPath],
      },
    },
  });

  const json = formatAgentCheckJson(result);
  expect(json).toMatchObject({
    $schema: AGENT_CHECK_SCHEMA_URL,
    version: 1,
    ok: true,
    inputs: { totalCount: 1, failureCount: 0 },
    replay: { ok: true, totalCount: 1, failureCount: 0 },
    outputs: { totalCount: 7, failureCount: 0 },
  });
  expect(json.commands.check.argv).toEqual([
    "ptywright",
    "agent",
    "check",
    "tests/agent-cassettes",
    "--artifacts-root",
    artifactsRoot,
  ]);
  expect(json.commands.rerun.argv).toEqual(["ptywright", "agent", "rerun", result.summaryPath]);
  expect(json.failures).toEqual([]);
}, 15_000);

test("agent check fails before replay when committed cassettes are invalid", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-check-invalid");
  const cassetteDir = join(".tmp", "tests", "agent-check-empty-inputs");
  rmSync(artifactsRoot, { recursive: true, force: true });
  rmSync(cassetteDir, { recursive: true, force: true });
  mkdirSync(cassetteDir, { recursive: true });

  const result = await checkAgentRegression({
    cassetteDir,
    artifactsRoot,
    headless: true,
  });

  expect(result.ok).toBe(false);
  expect(result.validationBefore.ok).toBe(false);
  expect(result.replay.entries).toHaveLength(0);
  expect(result.validationAfter.ok).toBe(true);
  expect(result.validationAfter.entries[0]).toMatchObject({
    kind: "check-summary",
    ok: true,
  });
  expect(existsSync(result.summaryPath)).toBe(true);

  const json = formatAgentCheckJson(result);
  expect(json.ok).toBe(false);
  expect(json.commands.updateSnapshots.argv).toContain("--update-snapshots");
  expect(json.failures[0]).toMatchObject({
    stage: "input",
    kind: "unknown",
  });
});

test("agent check CLI runs committed cassette regression", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-check-cli");
  rmSync(artifactsRoot, { recursive: true, force: true });

  process.exitCode = undefined;
  try {
    await main(["agent", "check", "tests/agent-cassettes", "--artifacts-root", artifactsRoot]);
    expect(currentExitCode()).toBe(0);
    expect(existsSync(join(artifactsRoot, "agent-check.summary.json"))).toBe(true);
    expect(existsSync(join(artifactsRoot, "agent-replay.summary.json"))).toBe(true);
  } finally {
    process.exitCode = 0;
  }
}, 15_000);

test("agent check CLI accepts JSON output mode", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-check-cli-json");
  rmSync(artifactsRoot, { recursive: true, force: true });
  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main([
      "agent",
      "check",
      "tests/agent-cassettes",
      "--artifacts-root",
      artifactsRoot,
      "--json",
    ]);
    expect(currentExitCode()).toBe(0);
    expect(existsSync(join(artifactsRoot, "agent-check.summary.json"))).toBe(true);
    expect(existsSync(join(artifactsRoot, "agent-replay.summary.json"))).toBe(true);
    const parsed = JSON.parse(logs.join("\n")) as {
      $schema?: string;
      ok?: boolean;
      inputs?: { totalCount?: number };
      replay?: { summaryPath?: string };
      failures?: unknown[];
    };
    expect(parsed.$schema).toBe(AGENT_CHECK_SCHEMA_URL);
    expect(parsed.ok).toBe(true);
    expect(parsed.inputs?.totalCount).toBe(1);
    expect(parsed.replay?.summaryPath).toContain("agent-replay.summary.json");
    expect(parsed.failures).toEqual([]);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }
}, 15_000);

test("agent check JSON summary rejects inconsistent failure counts", () => {
  expect(() =>
    normalizeAgentCheckJsonSummary({
      version: 1,
      ok: true,
      cassetteDir: "tests/agent-cassettes",
      artifactsRoot: ".tmp/agent-check",
      summaryPath: ".tmp/agent-check/agent-check.summary.json",
      commands: {
        check: {
          argv: [
            "ptywright",
            "agent",
            "check",
            "tests/agent-cassettes",
            "--artifacts-root",
            ".tmp/agent-check",
          ],
        },
        updateSnapshots: {
          argv: [
            "ptywright",
            "agent",
            "check",
            "tests/agent-cassettes",
            "--artifacts-root",
            ".tmp/agent-check",
            "--update-snapshots",
          ],
        },
        rerun: {
          argv: ["ptywright", "agent", "rerun", ".tmp/agent-check/agent-check.summary.json"],
        },
      },
      inputs: { totalCount: 1, failureCount: 1 },
      replay: {
        ok: true,
        totalCount: 0,
        failureCount: 0,
        reportPath: "",
        summaryPath: "",
      },
      outputs: { totalCount: 0, failureCount: 0 },
      failures: [],
    }),
  ).toThrow("ok must be true only when all stages have zero failures");
});

test("agent check JSON summary requires structured rerun commands", () => {
  expect(() =>
    normalizeAgentCheckJsonSummary({
      version: 1,
      ok: true,
      cassetteDir: "tests/agent-cassettes",
      artifactsRoot: ".tmp/agent-check",
      summaryPath: ".tmp/agent-check/agent-check.summary.json",
      inputs: { totalCount: 1, failureCount: 0 },
      replay: {
        ok: true,
        totalCount: 1,
        failureCount: 0,
        reportPath: ".tmp/agent-check/index.html",
        summaryPath: ".tmp/agent-check/agent-replay.summary.json",
      },
      outputs: { totalCount: 5, failureCount: 0 },
      failures: [],
    }),
  ).toThrow("commands: Required");
});

test("agent check JSON summary rejects stale command metadata", () => {
  expect(() =>
    normalizeAgentCheckJsonSummary({
      version: 1,
      ok: true,
      cassetteDir: "tests/agent-cassettes",
      artifactsRoot: ".tmp/agent-check",
      summaryPath: ".tmp/agent-check/agent-check.summary.json",
      commands: {
        check: {
          argv: [
            "ptywright",
            "agent",
            "check",
            "tests/wrong-agent-cassettes",
            "--artifacts-root",
            ".tmp/agent-check",
          ],
        },
        updateSnapshots: {
          argv: [
            "ptywright",
            "agent",
            "check",
            "tests/agent-cassettes",
            "--artifacts-root",
            ".tmp/agent-check",
            "--update-snapshots",
          ],
        },
        rerun: {
          argv: ["ptywright", "agent", "rerun", ".tmp/agent-check/agent-check.summary.json"],
        },
      },
      inputs: { totalCount: 1, failureCount: 0 },
      replay: {
        ok: true,
        totalCount: 1,
        failureCount: 0,
        reportPath: ".tmp/agent-check/index.html",
        summaryPath: ".tmp/agent-check/agent-replay.summary.json",
      },
      outputs: { totalCount: 5, failureCount: 0 },
      failures: [],
    }),
  ).toThrow("check argv must match cassetteDir and artifactsRoot");
});

test("agent check JSON summary rejects stale rerun metadata", () => {
  expect(() =>
    normalizeAgentCheckJsonSummary({
      version: 1,
      ok: true,
      cassetteDir: "tests/agent-cassettes",
      artifactsRoot: ".tmp/agent-check",
      summaryPath: ".tmp/agent-check/agent-check.summary.json",
      commands: {
        check: {
          argv: [
            "ptywright",
            "agent",
            "check",
            "tests/agent-cassettes",
            "--artifacts-root",
            ".tmp/agent-check",
          ],
        },
        updateSnapshots: {
          argv: [
            "ptywright",
            "agent",
            "check",
            "tests/agent-cassettes",
            "--artifacts-root",
            ".tmp/agent-check",
            "--update-snapshots",
          ],
        },
        rerun: {
          argv: ["ptywright", "agent", "rerun", ".tmp/stale/agent-check.summary.json"],
        },
      },
      inputs: { totalCount: 1, failureCount: 0 },
      replay: {
        ok: true,
        totalCount: 1,
        failureCount: 0,
        reportPath: ".tmp/agent-check/index.html",
        summaryPath: ".tmp/agent-check/agent-replay.summary.json",
      },
      outputs: { totalCount: 5, failureCount: 0 },
      failures: [],
    }),
  ).toThrow("rerun argv must match summaryPath");
});
