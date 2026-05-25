import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { expect, test } from "bun:test";

import { normalizeAgentCassette } from "../src/agent/cassette";
import { normalizeAgentRunRecord } from "../src/agent/run_record";
import { replayAgentRecordPath, runAgentSpec } from "../src/agent/runner";
import { main } from "../src/cli";
import { deterministicAgentSpec } from "./agent_fixture";

function currentExitCode(): string | number | null | undefined {
  return process.exitCode;
}

test("agent replay uses cassette frames instead of launching the original command", async () => {
  const artifactsDir = join(".tmp", "tests", "agent-cassette");
  const snapshotDir = join(artifactsDir, "snapshots");
  rmSync(artifactsDir, { recursive: true, force: true });

  const run = await runAgentSpec(
    {
      ...deterministicAgentSpec({
        name: "agent_cassette_fixture",
        artifactsDir,
        snapshotDir,
      }),
      name: "agent_cassette_fixture",
      artifactsDir,
      snapshotDir,
      steps: [
        { type: "waitForText", text: "Deterministic Agent Ready" },
        { type: "snapshot", name: "ready", targets: ["terminal", "dom"] },
        { type: "typeText", text: "status", enter: true },
        { type: "waitForText", text: "Status: stable" },
        { type: "snapshot", name: "status", targets: ["terminal", "dom"] },
      ],
    },
    { updateSnapshots: true, headless: true },
  );

  expect(run.ok).toBe(true);
  expect(existsSync(run.cassettePath)).toBe(true);
  expect(run.cassetteFrameCount).toBeGreaterThan(0);

  const cassette = normalizeAgentCassette(
    JSON.parse(readFileSync(run.cassettePath, "utf8")) as unknown,
  );
  expect(cassette.$schema).toContain("ptywright-agent-cassette.schema.json");
  expect(cassette.spec.launch.mode).toBe("url");
  expect(cassette.frames[0]?.terminalHash).toBeTruthy();
  expect(cassette.frames[0]?.domHash).toBeTruthy();

  const record = JSON.parse(readFileSync(run.recordPath, "utf8")) as {
    cassettePath?: string;
    cassetteFrameCount?: number;
    commands?: {
      replay?: { argv?: string[] };
      updateSnapshots?: { argv?: string[] };
    };
    mode?: string;
    spec?: { launch?: { url?: string } };
  };
  expect(record.cassettePath).toBe("agent_cassette_fixture.cassette.json");
  expect(record.mode).toBe("live");
  expect(record.cassetteFrameCount).toBe(run.cassetteFrameCount);
  expect(record.commands?.replay?.argv).toEqual([
    "ptywright",
    "agent",
    "replay",
    relative(process.cwd(), run.recordPath),
  ]);
  expect(record.commands?.updateSnapshots?.argv).toEqual([
    "ptywright",
    "agent",
    "replay",
    relative(process.cwd(), run.recordPath),
    "--update-snapshots",
  ]);

  if (record.spec?.launch) {
    record.spec.launch.url = "http://127.0.0.1:9/missing-agent-fixture";
  }

  const recordPath = join(artifactsDir, "agent_cassette_fixture.agent-run.json");
  await Bun.write(recordPath, JSON.stringify(record, null, 2) + "\n");

  const replay = await replayAgentRecordPath(recordPath, {
    updateSnapshots: false,
    headless: true,
  });
  expect(replay.ok).toBe(true);
  expect(replay.mode).toBe("replay");
  expect(replay.artifacts.every((artifact) => artifact.ok)).toBe(true);
  const replayRecord = JSON.parse(readFileSync(replay.recordPath, "utf8")) as {
    cassettePath?: string;
    cassetteFrameCount?: number;
    commands?: {
      replay?: { argv?: string[] };
      updateSnapshots?: { argv?: string[] };
    };
    mode?: string;
  };
  expect(replayRecord.mode).toBe("replay");
  expect(replayRecord.cassettePath).toBe("agent_cassette_fixture.cassette.json");
  expect(existsSync(join(replay.artifactsDir, replayRecord.cassettePath))).toBe(true);
  expect(replayRecord.cassetteFrameCount).toBe(run.cassetteFrameCount);
  expect(replayRecord.commands?.replay?.argv).toEqual([
    "ptywright",
    "agent",
    "replay",
    relative(process.cwd(), replay.recordPath),
  ]);
  expect(replayRecord.commands?.updateSnapshots?.argv).toEqual([
    "ptywright",
    "agent",
    "replay",
    relative(process.cwd(), replay.recordPath),
    "--update-snapshots",
  ]);

  const cassetteReplay = await replayAgentRecordPath(run.cassettePath, {
    artifactsDir: join(artifactsDir, "cassette-direct-replay"),
    updateSnapshots: false,
    headless: true,
  });
  expect(cassetteReplay.ok).toBe(true);

  const secondReplay = await replayAgentRecordPath(replay.recordPath, {
    artifactsDir: join(artifactsDir, "second-replay"),
    updateSnapshots: false,
    headless: true,
  });
  expect(secondReplay.ok).toBe(true);
}, 15_000);

test("agent snapshot mismatch writes a readable diff artifact", async () => {
  const artifactsDir = join(".tmp", "tests", "agent-mismatch-diff");
  const snapshotDir = join(artifactsDir, "snapshots");
  rmSync(artifactsDir, { recursive: true, force: true });

  const spec = {
    ...deterministicAgentSpec({
      name: "agent_mismatch_diff_fixture",
      artifactsDir,
      snapshotDir,
      targets: ["terminal"],
    }),
    name: "agent_mismatch_diff_fixture",
    artifactsDir,
    snapshotDir,
  };

  const update = await runAgentSpec(spec, { updateSnapshots: true, headless: true });
  expect(update.ok).toBe(true);

  const baselinePath = join(snapshotDir, "desktop.ready.terminal.snap.txt");
  writeFileSync(baselinePath, "wrong baseline\n", "utf8");

  const compare = await runAgentSpec(spec, { headless: true });
  expect(compare.ok).toBe(false);
  const diffArtifact = compare.artifacts.find((artifact) => artifact.diffPath);
  expect(diffArtifact?.diffPath).toBeTruthy();
  expect(existsSync(diffArtifact!.diffPath!)).toBe(true);

  const diff = readFileSync(diffArtifact!.diffPath!, "utf8");
  expect(diff).toContain("--- expected");
  expect(diff).toContain("+++ received");
  expect(diff).toContain("- wrong baseline");
  expect(diff).toContain("+ Deterministic Agent Ready");

  const report = readFileSync(compare.reportPath, "utf8");
  expect(report).toContain("diff");
  expect(report).toContain("Commands");
  expect(report).toContain("ptywright agent commands");
  expect(report).toContain("--update-snapshots");
}, 15_000);

test("agent run and replay CLI accept JSON output mode", async () => {
  const artifactsDir = join(".tmp", "tests", "agent-cli-json-run");
  const replayDir = join(".tmp", "tests", "agent-cli-json-replay");
  const specPath = join(artifactsDir, "flow.json");
  rmSync(artifactsDir, { recursive: true, force: true });
  rmSync(replayDir, { recursive: true, force: true });

  await Bun.write(
    specPath,
    JSON.stringify(
      {
        ...deterministicAgentSpec({
          name: "agent_cli_json_fixture",
          artifactsDir,
          snapshotDir: join(artifactsDir, "snapshots"),
        }),
      },
      null,
      2,
    ) + "\n",
  );

  const runLogs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      runLogs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "run", specPath, "--update-snapshots", "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const runRecord = normalizeAgentRunRecord(JSON.parse(runLogs.join("\n")) as unknown);
  expect(runRecord.mode).toBe("live");
  expect(runRecord.ok).toBe(true);
  expect(runRecord.cassettePath).toBe("agent_cli_json_fixture.cassette.json");

  const replayLogs: string[] = [];
  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      replayLogs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main([
      "agent",
      "replay",
      join(artifactsDir, "agent_cli_json_fixture.cassette.json"),
      "--artifacts-dir",
      replayDir,
      "--json",
    ]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const replayRecord = normalizeAgentRunRecord(JSON.parse(replayLogs.join("\n")) as unknown);
  expect(replayRecord.mode).toBe("replay");
  expect(replayRecord.ok).toBe(true);
  expect(replayRecord.cassettePath).toBe("agent_cli_json_fixture.cassette.json");
  expect(existsSync(join(replayDir, replayRecord.cassettePath))).toBe(true);
}, 30_000);

test("agent cassette validation rejects tampered frame hashes", async () => {
  const artifactsDir = join(".tmp", "tests", "agent-cassette-hash");
  const snapshotDir = join(artifactsDir, "snapshots");
  rmSync(artifactsDir, { recursive: true, force: true });

  const run = await runAgentSpec(
    deterministicAgentSpec({
      name: "agent_cassette_hash_fixture",
      artifactsDir,
      snapshotDir,
      targets: ["terminal"],
    }),
    { updateSnapshots: true, headless: true },
  );
  expect(run.ok).toBe(true);

  const cassette = JSON.parse(readFileSync(run.cassettePath, "utf8")) as {
    frames?: Array<{ terminalText?: string }>;
  };
  cassette.frames![0]!.terminalText = "tampered";
  expect(() => normalizeAgentCassette(cassette)).toThrow("terminal hash mismatch");
}, 15_000);
