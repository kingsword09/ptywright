import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "bun:test";

import {
  AGENT_RUN_RECORD_SCHEMA_URL,
  normalizeAgentRunRecord,
  readAgentRunRecordPath,
} from "../src/agent/run_record";

test("agent run record normalizes to a stable replay contract", () => {
  const record = normalizeAgentRunRecord({
    version: 1,
    name: "record_fixture",
    ok: true,
    startedAt: "2026-05-24T00:00:00.000Z",
    durationMs: 12,
    mode: "live",
    spec: {
      name: "record_fixture",
      launch: {
        mode: "url",
        url: "http://127.0.0.1:3000/",
      },
      steps: [{ type: "snapshot", name: "ready" }],
    },
    artifactsDir: ".tmp/record-fixture",
    snapshotDir: "snapshots/record-fixture",
    reportPath: ".tmp/record-fixture/index.html",
    cassettePath: "record_fixture.cassette.json",
    cassetteFrameCount: 1,
    replayCommand: "ptywright agent replay record_fixture.agent-run.json",
    commands: {
      replay: {
        argv: ["ptywright", "agent", "replay", "record_fixture.agent-run.json"],
      },
      updateSnapshots: {
        argv: [
          "ptywright",
          "agent",
          "replay",
          "record_fixture.agent-run.json",
          "--update-snapshots",
        ],
      },
    },
    steps: [],
    artifacts: [],
    errors: [],
  });

  expect(record.$schema).toBe(AGENT_RUN_RECORD_SCHEMA_URL);
  expect(record.spec?.viewports?.[0]?.name).toBe("desktop-1440");
  expect(record.commands.replay.argv).toEqual([
    "ptywright",
    "agent",
    "replay",
    "record_fixture.agent-run.json",
  ]);
  expect(record.commands.updateSnapshots.argv).toEqual([
    "ptywright",
    "agent",
    "replay",
    "record_fixture.agent-run.json",
    "--update-snapshots",
  ]);
});

test("agent run record supports shell-quoted replay paths without splitting argv", () => {
  const record = normalizeAgentRunRecord({
    version: 1,
    name: "quoted_record",
    ok: true,
    startedAt: "2026-05-24T00:00:00.000Z",
    durationMs: 12,
    mode: "live",
    spec: {
      name: "quoted_record",
      launch: {
        mode: "url",
        url: "http://127.0.0.1:3000/",
      },
      steps: [{ type: "snapshot", name: "ready" }],
    },
    artifactsDir: ".tmp/quoted-record",
    snapshotDir: "snapshots/quoted-record",
    reportPath: ".tmp/quoted-record/index.html",
    cassettePath: "quoted_record.cassette.json",
    cassetteFrameCount: 1,
    replayCommand: "ptywright agent replay 'records/it'\\''s ready.agent-run.json'",
    commands: {
      replay: {
        argv: ["ptywright", "agent", "replay", "records/it's ready.agent-run.json"],
      },
      updateSnapshots: {
        argv: [
          "ptywright",
          "agent",
          "replay",
          "records/it's ready.agent-run.json",
          "--update-snapshots",
        ],
      },
    },
    steps: [],
    artifacts: [],
    errors: [],
  });

  expect(record.replayCommand).toBe(
    "ptywright agent replay 'records/it'\\''s ready.agent-run.json'",
  );
  expect(record.commands.replay.argv[3]).toBe("records/it's ready.agent-run.json");
});

test("agent run record requires structured replay commands", () => {
  expect(() =>
    normalizeAgentRunRecord({
      version: 1,
      name: "legacy_record",
      ok: true,
      startedAt: "2026-05-24T00:00:00.000Z",
      durationMs: 12,
      mode: "live",
      spec: {
        name: "legacy_record",
        launch: {
          mode: "url",
          url: "http://127.0.0.1:3000/",
        },
        steps: [{ type: "snapshot", name: "ready" }],
      },
      artifactsDir: ".tmp/legacy-record",
      snapshotDir: "snapshots/legacy-record",
      reportPath: ".tmp/legacy-record/index.html",
      cassettePath: "legacy_record.cassette.json",
      cassetteFrameCount: 1,
      replayCommand: "ptywright agent replay legacy_record.agent-run.json",
      steps: [],
      artifacts: [],
      errors: [],
    }),
  ).toThrow("commands: Required");
});

test("agent run record rejects malformed records with readable errors", () => {
  expect(() =>
    normalizeAgentRunRecord({
      version: 1,
      name: "bad_record",
      ok: true,
      startedAt: "2026-05-24T00:00:00.000Z",
      durationMs: 0,
      mode: "live",
      artifactsDir: ".tmp/bad",
      snapshotDir: "snapshots/bad",
      reportPath: ".tmp/bad/index.html",
      cassetteFrameCount: 0,
      replayCommand: "ptywright agent replay bad.agent-run.json",
      commands: {
        replay: {
          argv: ["ptywright", "agent", "replay", "bad.agent-run.json"],
        },
        updateSnapshots: {
          argv: ["ptywright", "agent", "replay", "bad.agent-run.json", "--update-snapshots"],
        },
      },
      steps: [],
      artifacts: [],
      errors: [],
    }),
  ).toThrow("agent run record requires cassettePath, flowPath, or spec");
});

test("agent run record rejects stale command metadata", () => {
  expect(() =>
    normalizeAgentRunRecord({
      version: 1,
      name: "bad_record",
      ok: true,
      startedAt: "2026-05-24T00:00:00.000Z",
      durationMs: 0,
      mode: "live",
      spec: {
        name: "bad_record",
        launch: {
          mode: "url",
          url: "http://127.0.0.1:3000/",
        },
        steps: [{ type: "snapshot", name: "ready" }],
      },
      artifactsDir: ".tmp/bad",
      snapshotDir: "snapshots/bad",
      reportPath: ".tmp/bad/index.html",
      cassetteFrameCount: 0,
      replayCommand: "ptywright agent replay bad.agent-run.json",
      commands: {
        replay: {
          argv: ["ptywright", "agent", "replay", "stale.agent-run.json"],
        },
        updateSnapshots: {
          argv: ["ptywright", "agent", "replay", "bad.agent-run.json", "--update-snapshots"],
        },
      },
      steps: [],
      artifacts: [],
      errors: [],
    }),
  ).toThrow("replayCommand must match commands.replay.argv");
});

test("agent run record rejects replayCommand that diverges from commands", () => {
  expect(() =>
    normalizeAgentRunRecord({
      version: 1,
      name: "bad_record",
      ok: true,
      startedAt: "2026-05-24T00:00:00.000Z",
      durationMs: 0,
      mode: "live",
      spec: {
        name: "bad_record",
        launch: {
          mode: "url",
          url: "http://127.0.0.1:3000/",
        },
        steps: [{ type: "snapshot", name: "ready" }],
      },
      artifactsDir: ".tmp/bad",
      snapshotDir: "snapshots/bad",
      reportPath: ".tmp/bad/index.html",
      cassetteFrameCount: 0,
      replayCommand: "ptywright agent replay stale.agent-run.json",
      commands: {
        replay: {
          argv: ["ptywright", "agent", "replay", "bad.agent-run.json"],
        },
        updateSnapshots: {
          argv: ["ptywright", "agent", "replay", "bad.agent-run.json", "--update-snapshots"],
        },
      },
      steps: [],
      artifacts: [],
      errors: [],
    }),
  ).toThrow("replayCommand must match commands.replay.argv");
});

test("agent run record reader validates files before replay", () => {
  const dir = join(".tmp", "tests", "agent-run-record");
  const path = join(dir, "bad.agent-run.json");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ version: 1, cassettePath: "missing.cassette.json" }),
    "utf8",
  );

  expect(() => readAgentRunRecordPath(path)).toThrow("invalid agent run record");
  expect(readFileSync(path, "utf8")).toContain("missing.cassette.json");
});
