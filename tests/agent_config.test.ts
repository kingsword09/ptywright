import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test } from "bun:test";

import { readAgentCheckSummaryPath } from "../src/agent/check_summary";
import { normalizeAgentRunRecord } from "../src/agent/run_record";
import { main } from "../src/cli";
import { defineConfig, loadPtywrightConfig } from "../src/config";
import { deterministicAgentLaunch } from "./agent_fixture";

function currentExitCode(): string | number | null | undefined {
  return process.exitCode;
}

function withConsoleLogCapture<T>(fn: (logs: string[]) => Promise<T>): Promise<T> {
  const logs: string[] = [];
  const originalLog = console.log;

  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(" "));
  };

  return fn(logs).finally(() => {
    console.log = originalLog;
  });
}

function writeConfig(path: string, agentConfig: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(
    path,
    `export default {
  agent: ${agentConfig},
};
`,
    "utf8",
  );
}

test("ptywright config loader discovers config files from nested directories", async () => {
  const projectDir = resolve(".tmp", "tests", "agent-config-load", "project");
  const nestedDir = join(projectDir, "packages", "demo");
  const configPath = join(projectDir, "ptywright.config.ts");
  rmSync(projectDir, { recursive: true, force: true });
  mkdirSync(nestedDir, { recursive: true });
  writeConfig(
    configPath,
    `{
    artifactsRoot: "artifacts",
    cassetteDir: "cassettes",
    snapshotDir: "snapshots",
    defaults: {
      headless: false,
      timeoutMs: 1234,
      screenshot: false,
      viewports: [{ name: "config-mobile", width: 390, height: 844, isMobile: true }],
      mask: [{ regex: "token_[a-z]+", replacement: "<token>" }],
    },
  }`,
  );

  const config = await loadPtywrightConfig({ cwd: nestedDir });

  expect(config.configPath).toBe(configPath);
  expect(config.rootDir).toBe(projectDir);
  expect(config.agent?.artifactsRoot).toBe("artifacts");
  expect(config.agent?.defaults?.headless).toBe(false);
  expect(config.agent?.defaults?.viewports?.[0]).toMatchObject({
    name: "config-mobile",
    width: 390,
    height: 844,
  });
  expect(defineConfig({ agent: { artifactsRoot: ".tmp/agent" } })).toEqual({
    agent: { artifactsRoot: ".tmp/agent" },
  });
});

test("ptywright config loader rejects missing explicit config paths", async () => {
  await expect(
    loadPtywrightConfig({
      cwd: resolve(".tmp", "tests", "agent-config-missing"),
      configPath: "missing.config.ts",
    }),
  ).rejects.toThrow("ptywright config not found: missing.config.ts");
});

test("agent run applies config defaults for paths, viewport, and snapshots", async () => {
  const projectDir = resolve(".tmp", "tests", "agent-config-run", "project");
  const configPath = join(projectDir, "ptywright.config.ts");
  const flowPath = join(projectDir, "flows", "configured.json");
  rmSync(projectDir, { recursive: true, force: true });
  mkdirSync(join(projectDir, "flows"), { recursive: true });
  writeConfig(
    configPath,
    `{
    artifactsRoot: "artifacts",
    snapshotDir: "snapshots",
    defaults: {
      headless: true,
      timeoutMs: 30000,
      screenshot: false,
      viewports: [{ name: "config-desktop", width: 900, height: 640 }],
    },
  }`,
  );
  writeFileSync(
    flowPath,
    JSON.stringify(
      {
        name: "agent_config_fixture",
        launch: deterministicAgentLaunch(),
        steps: [
          { type: "waitForText", text: "Deterministic Agent Ready" },
          { type: "snapshot", name: "ready", targets: ["terminal", "dom"] },
        ],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  process.exitCode = undefined;
  try {
    await withConsoleLogCapture(async (logs) => {
      await main([
        "agent",
        "run",
        flowPath,
        "--config",
        configPath,
        "--update-snapshots",
        "--json",
      ]);
      expect(currentExitCode()).toBe(0);

      const record = normalizeAgentRunRecord(JSON.parse(logs.join("\n")) as unknown);
      const artifactsDir = join(projectDir, "artifacts", "agent_config_fixture");
      const snapshotDir = join(projectDir, "snapshots", "agent_config_fixture");

      expect(record.ok).toBe(true);
      expect(record.artifactsDir).toBe(artifactsDir);
      expect(record.snapshotDir).toBe(snapshotDir);
      expect(record.spec?.viewports?.map((viewport) => viewport.name)).toEqual(["config-desktop"]);
      expect(record.spec?.defaults?.timeoutMs).toBe(30000);
      expect(record.spec?.defaults?.screenshot).toBe(false);
      expect(existsSync(join(artifactsDir, "agent_config_fixture.agent-run.json"))).toBe(true);
      expect(existsSync(join(snapshotDir, "config-desktop.ready.terminal.snap.txt"))).toBe(true);
      expect(existsSync(join(snapshotDir, "config-desktop.ready.dom.snap.html"))).toBe(true);
    });
  } finally {
    process.exitCode = 0;
  }
}, 20_000);

test("agent run keeps explicit flow fields ahead of config defaults", async () => {
  const projectDir = resolve(".tmp", "tests", "agent-config-precedence", "project");
  const configPath = join(projectDir, "ptywright.config.ts");
  const flowPath = join(projectDir, "flows", "explicit.json");
  const flowArtifactsDir = join(projectDir, "flow-artifacts");
  const flowSnapshotDir = join(projectDir, "flow-snapshots");
  rmSync(projectDir, { recursive: true, force: true });
  mkdirSync(join(projectDir, "flows"), { recursive: true });
  writeConfig(
    configPath,
    `{
    artifactsRoot: "config-artifacts",
    snapshotDir: "config-snapshots",
    defaults: {
      headless: true,
      timeoutMs: 30000,
      screenshot: true,
      viewports: [{ name: "config-desktop", width: 900, height: 640 }],
    },
  }`,
  );
  writeFileSync(
    flowPath,
    JSON.stringify(
      {
        name: "agent_config_precedence",
        artifactsDir: flowArtifactsDir,
        snapshotDir: flowSnapshotDir,
        launch: deterministicAgentLaunch(),
        viewports: [{ name: "flow-desktop", width: 800, height: 600 }],
        defaults: { timeoutMs: 12000, screenshot: false },
        steps: [
          { type: "waitForText", text: "Deterministic Agent Ready" },
          { type: "snapshot", name: "ready", targets: ["terminal"] },
        ],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  process.exitCode = undefined;
  try {
    await withConsoleLogCapture(async (logs) => {
      await main([
        "agent",
        "run",
        flowPath,
        "--config",
        configPath,
        "--update-snapshots",
        "--json",
      ]);
      expect(currentExitCode()).toBe(0);

      const record = normalizeAgentRunRecord(JSON.parse(logs.join("\n")) as unknown);
      expect(record.ok).toBe(true);
      expect(record.artifactsDir).toBe(flowArtifactsDir);
      expect(record.snapshotDir).toBe(flowSnapshotDir);
      expect(record.spec?.viewports?.map((viewport) => viewport.name)).toEqual(["flow-desktop"]);
      expect(record.spec?.defaults?.timeoutMs).toBe(12000);
      expect(record.spec?.defaults?.screenshot).toBe(false);
      expect(existsSync(join(flowSnapshotDir, "flow-desktop.ready.terminal.snap.txt"))).toBe(true);
      expect(existsSync(join(projectDir, "config-artifacts"))).toBe(false);
      expect(existsSync(join(projectDir, "config-snapshots"))).toBe(false);
    });
  } finally {
    process.exitCode = 0;
  }
}, 20_000);

test("agent check uses config cassette and artifact roots", async () => {
  const projectDir = resolve(".tmp", "tests", "agent-config-check", "project");
  const configPath = join(projectDir, "ptywright.config.ts");
  const cassetteDir = join(projectDir, "cassettes");
  const artifactsRoot = join(projectDir, "check-artifacts");
  rmSync(projectDir, { recursive: true, force: true });
  mkdirSync(projectDir, { recursive: true });
  cpSync("tests/agent-cassettes", cassetteDir, { recursive: true });
  writeConfig(
    configPath,
    `{
    cassetteDir: "cassettes",
    artifactsRoot: "check-artifacts",
    defaults: { headless: true },
  }`,
  );

  process.exitCode = undefined;
  try {
    await withConsoleLogCapture(async (logs) => {
      await main(["agent", "check", "--config", configPath, "--json"]);
      expect(currentExitCode()).toBe(0);

      const parsed = JSON.parse(logs.join("\n")) as {
        ok?: boolean;
        cassetteDir?: string;
        artifactsRoot?: string;
        inputs?: { totalCount?: number };
      };
      expect(parsed.ok).toBe(true);
      expect(parsed.cassetteDir).toBe(cassetteDir);
      expect(parsed.artifactsRoot).toBe(artifactsRoot);
      expect(parsed.inputs?.totalCount).toBe(1);
      expect(existsSync(join(artifactsRoot, "agent-check.summary.json"))).toBe(true);
      expect(
        readAgentCheckSummaryPath(join(artifactsRoot, "agent-check.summary.json")),
      ).toMatchObject({
        ok: true,
        cassetteDir,
        artifactsRoot,
      });
    });
  } finally {
    process.exitCode = 0;
  }
}, 20_000);
