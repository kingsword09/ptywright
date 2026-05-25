import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { replayAllAgentRecords } from "../src/agent/replay_all";
import { runAgentSpec } from "../src/agent/runner";
import { validateAgentArtifactsPath } from "../src/agent/validate";
import { checkAgentRegression } from "../src/agent/check";
import { promoteAgentCassette } from "../src/agent/promote";
import { main } from "../src/cli";
import { deterministicAgentSpec } from "./agent_fixture";

function currentExitCode(): string | number | null | undefined {
  return process.exitCode;
}

test("agent validate accepts flow, cassette, run record, and replay summary artifacts", async () => {
  const dir = join(".tmp", "tests", "agent-validate");
  const liveDir = join(dir, "live");
  const snapshotDir = join(dir, "snapshots");
  rmSync(dir, { recursive: true, force: true });

  const run = await runAgentSpec(
    deterministicAgentSpec({
      name: "agent_validate_fixture",
      artifactsDir: liveDir,
      snapshotDir,
    }),
    { updateSnapshots: true, headless: true },
  );
  expect(run.ok).toBe(true);

  const suite = await replayAllAgentRecords({
    dir: liveDir,
    artifactsRoot: join(dir, "suite"),
    headless: true,
  });
  expect(suite.ok).toBe(true);
  const check = await checkAgentRegression({
    cassetteDir: liveDir,
    artifactsRoot: join(dir, "check"),
    headless: true,
  });
  expect(check.ok).toBe(true);
  const promote = await promoteAgentCassette({
    sourcePath: run.cassettePath,
    cassetteDir: join(dir, "promoted-cassettes"),
    snapshotDir: join(dir, "promoted-snapshots"),
    artifactsRoot: join(dir, "promote"),
    updateSnapshots: true,
    headless: true,
  });
  expect(promote.ok).toBe(true);

  const flow = await validateAgentArtifactsPath(run.flowPath);
  expect(flow).toMatchObject({ ok: true, totalCount: 1, failureCount: 0 });
  expect(flow.entries[0]?.kind).toBe("flow");

  const cassette = await validateAgentArtifactsPath(run.cassettePath);
  expect(cassette.entries[0]).toMatchObject({ ok: true, kind: "cassette" });

  const runRecord = await validateAgentArtifactsPath(run.recordPath);
  expect(runRecord.entries[0]).toMatchObject({ ok: true, kind: "run-record" });

  const summary = await validateAgentArtifactsPath(suite.summaryPath);
  expect(summary.entries[0]).toMatchObject({ ok: true, kind: "replay-summary" });

  const checkSummary = await validateAgentArtifactsPath(check.summaryPath);
  expect(checkSummary.entries[0]).toMatchObject({ ok: true, kind: "check-summary" });

  const promoteSummary = await validateAgentArtifactsPath(promote.summaryPath);
  expect(promoteSummary.entries[0]).toMatchObject({ ok: true, kind: "promote-summary" });

  const directory = await validateAgentArtifactsPath(dir);
  expect(directory.ok).toBe(true);
  expect(directory.entries.some((entry) => entry.kind === "flow")).toBe(true);
  expect(directory.entries.some((entry) => entry.kind === "cassette")).toBe(true);
  expect(directory.entries.some((entry) => entry.kind === "run-record")).toBe(true);
  expect(directory.entries.some((entry) => entry.kind === "replay-summary")).toBe(true);
  expect(directory.entries.some((entry) => entry.kind === "check-summary")).toBe(true);
  expect(directory.entries.some((entry) => entry.kind === "promote-summary")).toBe(true);
}, 15_000);

test("agent validate reports malformed artifacts without throwing", async () => {
  const dir = join(".tmp", "tests", "agent-validate-bad");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const path = join(dir, "bad.agent-run.json");
  writeFileSync(
    path,
    JSON.stringify({ version: 1, cassettePath: "missing.cassette.json" }),
    "utf8",
  );

  const result = await validateAgentArtifactsPath(path);
  expect(result.ok).toBe(false);
  expect(result.failureCount).toBe(1);
  expect(result.entries[0]).toMatchObject({
    kind: "run-record",
    ok: false,
  });
  expect(result.entries[0]?.error).toContain("invalid agent run record");
  expect(readFileSync(path, "utf8")).toContain("missing.cassette.json");
});

test("agent validate rejects stale summary command metadata", async () => {
  const dir = join(".tmp", "tests", "agent-validate-stale-commands");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const path = join(dir, "agent-check.summary.json");
  writeFileSync(
    path,
    JSON.stringify(
      {
        version: 1,
        ok: true,
        cassetteDir: "tests/agent-cassettes",
        artifactsRoot: ".tmp/agent-check",
        summaryPath: path,
        commands: {
          check: {
            argv: [
              "ptywright",
              "agent",
              "check",
              "tests/stale-agent-cassettes",
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
            argv: ["ptywright", "agent", "rerun", path],
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
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const result = await validateAgentArtifactsPath(path);
  expect(result.ok).toBe(false);
  expect(result.entries[0]).toMatchObject({
    kind: "check-summary",
    ok: false,
  });
  expect(result.entries[0]?.error).toContain("check argv must match cassetteDir");
});

test("agent validate rejects schema-shaped unsupported command argv", async () => {
  const dir = join(".tmp", "tests", "agent-validate-command-shape");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const path = join(dir, "agent-check.summary.json");
  writeFileSync(
    path,
    JSON.stringify(
      {
        version: 1,
        ok: true,
        cassetteDir: "tests/agent-cassettes",
        artifactsRoot: ".tmp/agent-check",
        summaryPath: path,
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
            argv: ["ptywright", "agent", "rerun", path],
          },
          inspect: {
            argv: ["bun", "run", "src/cli.ts"],
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
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const result = await validateAgentArtifactsPath(path);
  expect(result.ok).toBe(false);
  expect(result.entries[0]).toMatchObject({
    kind: "check-summary",
    ok: false,
  });
  expect(result.entries[0]?.error).toContain(
    "command inspect argv must start with a supported ptywright agent command",
  );
});

test("agent validate CLI reports unsupported stored command argv", async () => {
  const dir = join(".tmp", "tests", "agent-validate-cli-command-shape");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const path = join(dir, "agent-check.summary.json");
  writeFileSync(
    path,
    JSON.stringify(
      {
        version: 1,
        ok: true,
        cassetteDir: "tests/agent-cassettes",
        artifactsRoot: ".tmp/agent-check",
        summaryPath: path,
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
            argv: ["ptywright", "agent", "unknown", path],
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
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const errors: string[] = [];
  const originalError = console.error;

  process.exitCode = undefined;
  try {
    console.error = (...args: unknown[]) => {
      errors.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "validate", path]);
    expect(currentExitCode()).toBe(1);
  } finally {
    console.error = originalError;
    process.exitCode = 0;
  }

  expect(errors.join("\n")).toContain(
    "command rerun argv must start with a supported ptywright agent command",
  );
});

test("agent validate checks attached moved summary manifest hashes", async () => {
  const dir = join(".tmp", "tests", "agent-validate-moved-summary-manifest");
  const artifactsRoot = join(dir, "check");
  const copyRoot = join(dir, "check-moved");
  rmSync(dir, { recursive: true, force: true });

  const check = await checkAgentRegression({
    cassetteDir: "tests/agent-cassettes",
    artifactsRoot,
    headless: true,
  });
  expect(check.ok).toBe(true);

  cpSync(artifactsRoot, copyRoot, { recursive: true });
  rmSync(artifactsRoot, { recursive: true, force: true });

  const movedSummaryPath = join(copyRoot, "agent-check.summary.json");
  const clean = await validateAgentArtifactsPath(movedSummaryPath);
  expect(clean).toMatchObject({ ok: true, totalCount: 1, failureCount: 0 });
  expect(clean.entries[0]).toMatchObject({ kind: "check-summary", ok: true });

  writeFileSync(movedSummaryPath, readFileSync(movedSummaryPath, "utf8") + "\n", "utf8");

  const tampered = await validateAgentArtifactsPath(movedSummaryPath);
  expect(tampered).toMatchObject({ ok: false, totalCount: 1, failureCount: 1 });
  expect(tampered.entries[0]).toMatchObject({ kind: "check-summary", ok: false });
  expect(tampered.entries[0]?.error).toContain("invalid agent manifest files");
}, 20_000);

test("agent validate reports empty directories as failures", async () => {
  const dir = join(".tmp", "tests", "agent-validate-empty");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const result = await validateAgentArtifactsPath(dir);
  expect(existsSync(dir)).toBe(true);
  expect(result.ok).toBe(false);
  expect(result.entries[0]).toMatchObject({
    kind: "unknown",
    ok: false,
    error: "no agent artifacts found",
  });
});
