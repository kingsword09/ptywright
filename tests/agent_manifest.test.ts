import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test } from "bun:test";

import { checkAgentRegression } from "../src/agent/check";
import { readAgentArtifactCommandsPath } from "../src/agent/commands";
import {
  AGENT_MANIFEST_FILE_NAME,
  AGENT_MANIFEST_SCHEMA_URL,
  agentManifestPath,
  readAgentManifestPath,
  writeAgentManifestPath,
} from "../src/agent/manifest";
import { listAgentReplayFiles } from "../src/agent/replay_all";
import { runAgentSpec } from "../src/agent/runner";
import { validateAgentArtifactsPath } from "../src/agent/validate";
import { main } from "../src/cli";
import { deterministicAgentSpec } from "./agent_fixture";

function currentExitCode(): string | number | null | undefined {
  return process.exitCode;
}

function writeMinimalCheckManifestBundle(artifactsRoot: string): { summaryPath: string } {
  mkdirSync(artifactsRoot, { recursive: true });
  const summaryPath = join(artifactsRoot, "agent-check.summary.json");
  const checkCommand = [
    "ptywright",
    "agent",
    "check",
    "tests/agent-cassettes",
    "--artifacts-root",
    artifactsRoot,
  ];
  const commands = {
    check: { argv: checkCommand },
    updateSnapshots: { argv: [...checkCommand, "--update-snapshots"] },
    rerun: { argv: ["ptywright", "agent", "rerun", summaryPath] },
  };

  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        version: 1,
        ok: true,
        cassetteDir: "tests/agent-cassettes",
        artifactsRoot,
        summaryPath,
        commands,
        inputs: { totalCount: 0, failureCount: 0 },
        replay: {
          ok: true,
          totalCount: 0,
          failureCount: 0,
          reportPath: "",
          summaryPath: "",
        },
        outputs: { totalCount: 0, failureCount: 0 },
        failures: [],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  writeAgentManifestPath(agentManifestPath(artifactsRoot), {
    kind: "check",
    ok: true,
    rootDir: artifactsRoot,
    primaryPath: summaryPath,
    commands,
    validation: {
      ok: true,
      stages: [
        { name: "inputs", ok: true, totalCount: 0, failureCount: 0 },
        { name: "replay", ok: true, totalCount: 0, failureCount: 0 },
        { name: "outputs", ok: true, totalCount: 0, failureCount: 0 },
      ],
    },
    files: [{ path: summaryPath, kind: "check-summary", role: "summary", ok: true }],
  });

  return { summaryPath };
}

test("agent run writes a hashed manifest for replayable artifacts", async () => {
  const dir = join(".tmp", "tests", "agent-manifest-run");
  rmSync(dir, { recursive: true, force: true });

  const run = await runAgentSpec(
    deterministicAgentSpec({
      name: "agent_manifest_run",
      artifactsDir: join(dir, "run"),
      snapshotDir: join(dir, "snapshots"),
      targets: ["terminal", "dom"],
    }),
    { updateSnapshots: true, headless: true },
  );
  expect(run.ok).toBe(true);

  const manifest = readAgentManifestPath(agentManifestPath(run.artifactsDir));
  expect(manifest).toMatchObject({
    $schema: AGENT_MANIFEST_SCHEMA_URL,
    version: 1,
    kind: "run",
    ok: true,
    rootDir: run.artifactsDir,
    primaryPath: run.recordPath,
    commands: run.commands,
  });
  expect(manifest.files.some((file) => file.path.endsWith(".agent-run.json"))).toBe(true);
  expect(manifest.files.some((file) => file.path.endsWith(".cassette.json"))).toBe(true);
  expect(manifest.files.every((file) => !file.path.startsWith(run.artifactsDir))).toBe(true);
  expect(manifest.files.some((file) => file.kind === "terminal" && file.sha256.length === 64)).toBe(
    true,
  );

  const validation = await validateAgentArtifactsPath(agentManifestPath(run.artifactsDir));
  expect(validation.entries[0]).toMatchObject({ kind: "manifest", ok: true });
});

test("agent exec replays from a copied run manifest bundle", async () => {
  const dir = join(".tmp", "tests", "agent-manifest-run-copy");
  const artifactsDir = join(dir, "run");
  const copyRoot = join(dir, "run-moved");
  const snapshotDir = join(dir, "snapshots");
  rmSync(dir, { recursive: true, force: true });

  const run = await runAgentSpec(
    deterministicAgentSpec({
      name: "agent_manifest_run_copy",
      artifactsDir,
      snapshotDir,
      targets: ["terminal", "dom"],
    }),
    { updateSnapshots: true, headless: true },
  );
  expect(run.ok).toBe(true);

  cpSync(artifactsDir, copyRoot, { recursive: true });
  rmSync(artifactsDir, { recursive: true, force: true });
  expect(existsSync(artifactsDir)).toBe(false);

  const commands = await readAgentArtifactCommandsPath(copyRoot);
  expect(commands.commands.replay.argv).toEqual([
    "ptywright",
    "agent",
    "replay",
    join(copyRoot, "agent_manifest_run_copy.agent-run.json"),
  ]);
  expect(commands.commands.updateSnapshots.argv).toEqual([
    "ptywright",
    "agent",
    "replay",
    join(copyRoot, "agent_manifest_run_copy.agent-run.json"),
    "--update-snapshots",
  ]);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "exec", copyRoot, "--command", "replay"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  expect(logs.join("\n")).toContain("ok agent=agent_manifest_run_copy");
  expect(logs.join("\n")).toContain(
    `record=${resolve(copyRoot, "replay", "agent_manifest_run_copy.agent-run.json")}`,
  );
  expect(await validateAgentArtifactsPath(copyRoot, { preferManifestBundle: true })).toMatchObject({
    ok: true,
    totalCount: 1,
    failureCount: 0,
  });
}, 20_000);

test("agent run record next to a moved manifest replays from the copied bundle", async () => {
  const dir = join(".tmp", "tests", "agent-manifest-run-record-copy");
  const artifactsDir = join(dir, "run");
  const copyRoot = join(dir, "run-moved");
  const snapshotDir = join(dir, "snapshots");
  rmSync(dir, { recursive: true, force: true });

  const run = await runAgentSpec(
    deterministicAgentSpec({
      name: "agent_manifest_run_record_copy",
      artifactsDir,
      snapshotDir,
      targets: ["terminal", "dom"],
    }),
    { updateSnapshots: true, headless: true },
  );
  expect(run.ok).toBe(true);

  cpSync(artifactsDir, copyRoot, { recursive: true });
  rmSync(artifactsDir, { recursive: true, force: true });

  const movedRecordPath = join(copyRoot, "agent_manifest_run_record_copy.agent-run.json");
  const movedManifestPath = resolve(agentManifestPath(copyRoot));
  const commands = await readAgentArtifactCommandsPath(movedRecordPath);
  expect(commands.manifestPath).toBe(movedManifestPath);
  expect(commands.commands.replay.argv).toEqual(["ptywright", "agent", "replay", movedRecordPath]);
  expect(await validateAgentArtifactsPath(movedRecordPath)).toMatchObject({
    ok: true,
    totalCount: 1,
    failureCount: 0,
  });

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "exec", movedRecordPath, "--command", "replay"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const output = logs.join("\n");
  expect(output).toContain("ok agent=agent_manifest_run_record_copy");
  expect(output).toContain(
    `record=${resolve(copyRoot, "replay", "agent_manifest_run_record_copy.agent-run.json")}`,
  );
}, 20_000);

test("agent exec updateSnapshots works from a copied run manifest bundle", async () => {
  const dir = join(".tmp", "tests", "agent-manifest-run-copy-update");
  const artifactsDir = join(dir, "run");
  const copyRoot = join(dir, "run-moved");
  const snapshotDir = join(dir, "snapshots");
  rmSync(dir, { recursive: true, force: true });

  const run = await runAgentSpec(
    deterministicAgentSpec({
      name: "agent_manifest_run_copy_update",
      artifactsDir,
      snapshotDir,
      targets: ["terminal", "dom"],
    }),
    { updateSnapshots: true, headless: true },
  );
  expect(run.ok).toBe(true);

  const terminalSnapshot = join(snapshotDir, "desktop.ready.terminal.snap.txt");
  const domSnapshot = join(snapshotDir, "desktop.ready.dom.snap.html");
  rmSync(terminalSnapshot, { force: true });
  rmSync(domSnapshot, { force: true });
  expect(existsSync(terminalSnapshot)).toBe(false);
  expect(existsSync(domSnapshot)).toBe(false);

  cpSync(artifactsDir, copyRoot, { recursive: true });
  rmSync(artifactsDir, { recursive: true, force: true });

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "exec", copyRoot, "--command", "updateSnapshots"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  expect(logs.join("\n")).toContain("ok agent=agent_manifest_run_copy_update");
  expect(existsSync(terminalSnapshot)).toBe(true);
  expect(existsSync(domSnapshot)).toBe(true);
  expect(await validateAgentArtifactsPath(copyRoot, { preferManifestBundle: true })).toMatchObject({
    ok: true,
    totalCount: 1,
    failureCount: 0,
  });
}, 20_000);

test("agent check writes a suite manifest that can drive commands", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-manifest-check");
  rmSync(artifactsRoot, { recursive: true, force: true });

  const check = await checkAgentRegression({
    cassetteDir: "tests/agent-cassettes",
    artifactsRoot,
    headless: true,
  });
  expect(check.ok).toBe(true);

  const manifestPath = agentManifestPath(artifactsRoot);
  const manifest = readAgentManifestPath(manifestPath);
  expect(manifest.kind).toBe("check");
  expect(manifest.ok).toBe(true);
  expect(manifest.primaryPath).toBe(check.summaryPath);
  expect(manifest.validation?.stages.map((stage) => stage.name)).toEqual([
    "inputs",
    "replay",
    "outputs",
  ]);
  expect(manifest.files.some((file) => file.path === "agent-check.summary.json")).toBe(true);
  expect(
    manifest.files.some(
      (file) => file.path === "agent-replay.summary.json" && file.kind === "replay-summary",
    ),
  ).toBe(true);

  const commands = await readAgentArtifactCommandsPath(manifestPath);
  expect(commands.kind).toBe("manifest");
  expect(commands.commands.rerun.argv).toEqual([
    "ptywright",
    "agent",
    "rerun",
    check.summaryPath,
    "--artifacts-root",
    artifactsRoot,
  ]);
  expect(commands.commands.updateSnapshots.argv).toEqual([
    "ptywright",
    "agent",
    "check",
    "tests/agent-cassettes",
    "--artifacts-root",
    artifactsRoot,
    "--update-snapshots",
  ]);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "commands", manifestPath, "--command", "rerun"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  expect(logs).toEqual([
    "ptywright agent rerun .tmp/tests/agent-manifest-check/agent-check.summary.json --artifacts-root .tmp/tests/agent-manifest-check",
  ]);
}, 20_000);

test("agent exec can run a command selected from a manifest", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-manifest-exec");
  rmSync(artifactsRoot, { recursive: true, force: true });

  const check = await checkAgentRegression({
    cassetteDir: "tests/agent-cassettes",
    artifactsRoot,
    headless: true,
  });
  expect(check.ok).toBe(true);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "exec", agentManifestPath(artifactsRoot), "--command", "rerun"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  expect(logs.join("\n")).toContain("ok agent-check");
  expect(logs.join("\n")).toContain(`checkSummary=${check.summaryPath}`);
}, 20_000);

test("agent manifest validation detects tampered files", async () => {
  const dir = join(".tmp", "tests", "agent-manifest-tamper");
  rmSync(dir, { recursive: true, force: true });

  const run = await runAgentSpec(
    deterministicAgentSpec({
      name: "agent_manifest_tamper",
      artifactsDir: join(dir, "run"),
      snapshotDir: join(dir, "snapshots"),
      targets: ["terminal"],
    }),
    { updateSnapshots: true, headless: true },
  );
  expect(run.ok).toBe(true);

  const manifestPath = agentManifestPath(run.artifactsDir);
  const manifest = readAgentManifestPath(manifestPath);
  const terminal = manifest.files.find((file) => file.kind === "terminal");
  expect(terminal).toBeDefined();
  const terminalPath = join(run.artifactsDir, terminal!.path);
  writeFileSync(terminalPath, readFileSync(terminalPath, "utf8") + "tampered\n", "utf8");

  const validation = await validateAgentArtifactsPath(manifestPath);
  expect(validation.ok).toBe(false);
  expect(validation.entries[0]).toMatchObject({ kind: "manifest", ok: false });
  expect(validation.entries[0]?.error).toContain("invalid agent manifest files");
});

test("agent exec refuses a manifest when indexed files were tampered", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-manifest-exec-tamper");
  rmSync(artifactsRoot, { recursive: true, force: true });

  const check = await checkAgentRegression({
    cassetteDir: "tests/agent-cassettes",
    artifactsRoot,
    headless: true,
  });
  expect(check.ok).toBe(true);

  const manifestPath = agentManifestPath(artifactsRoot);
  const manifest = readAgentManifestPath(manifestPath);
  const summary = manifest.files.find((file) => file.kind === "check-summary");
  expect(summary).toBeDefined();
  const summaryPath = join(artifactsRoot, summary!.path);
  writeFileSync(summaryPath, readFileSync(summaryPath, "utf8") + "\n", "utf8");

  process.exitCode = undefined;
  try {
    await expect(main(["agent", "exec", manifestPath, "--command", "rerun"])).rejects.toThrow(
      "invalid agent manifest files",
    );
  } finally {
    process.exitCode = 0;
  }
});

test("agent manifest validation rejects unsupported stored commands", async () => {
  const dir = join(".tmp", "tests", "agent-manifest-bad-command");
  rmSync(dir, { recursive: true, force: true });

  const run = await runAgentSpec(
    deterministicAgentSpec({
      name: "agent_manifest_bad_command",
      artifactsDir: join(dir, "run"),
      snapshotDir: join(dir, "snapshots"),
      targets: ["terminal"],
    }),
    { updateSnapshots: true, headless: true },
  );
  expect(run.ok).toBe(true);

  const manifestPath = agentManifestPath(run.artifactsDir);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    commands?: Record<string, { argv: string[] }>;
  };
  manifest.commands!.inspect = { argv: ["bun", "run", "src/cli.ts"] };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  const validation = await validateAgentArtifactsPath(manifestPath);
  expect(validation.ok).toBe(false);
  expect(validation.entries[0]).toMatchObject({ kind: "manifest", ok: false });
  expect(validation.entries[0]?.error).toContain(
    "command inspect argv must start with a supported ptywright agent command",
  );
});

test("agent manifest validation rejects stale command targets even when files are intact", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-manifest-stale-command-target");
  rmSync(artifactsRoot, { recursive: true, force: true });

  const check = await checkAgentRegression({
    cassetteDir: "tests/agent-cassettes",
    artifactsRoot,
    headless: true,
  });
  expect(check.ok).toBe(true);

  const manifestPath = agentManifestPath(artifactsRoot);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    commands?: {
      rerun?: { argv: string[] };
      updateSnapshots?: { argv: string[] };
    };
  };
  manifest.commands!.rerun!.argv = [
    "ptywright",
    "agent",
    "rerun",
    join(artifactsRoot, "stale.summary.json"),
  ];
  manifest.commands!.updateSnapshots!.argv = [
    "ptywright",
    "agent",
    "check",
    "tests/agent-cassettes",
    "--artifacts-root",
    join(artifactsRoot, "stale-root"),
    "--update-snapshots",
  ];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  const validation = await validateAgentArtifactsPath(manifestPath);
  expect(validation.ok).toBe(false);
  expect(validation.entries[0]).toMatchObject({ kind: "manifest", ok: false });
  expect(validation.entries[0]?.error).toContain("invalid agent manifest commands");
  expect(validation.entries[0]?.error).toContain("command rerun argv must match primary artifact");
  expect(validation.entries[0]?.error).toContain(
    "command updateSnapshots argv must match primary artifact",
  );
});

test("agent exec refuses a manifest when command targets are stale", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-manifest-exec-stale-command");
  rmSync(artifactsRoot, { recursive: true, force: true });

  const check = await checkAgentRegression({
    cassetteDir: "tests/agent-cassettes",
    artifactsRoot,
    headless: true,
  });
  expect(check.ok).toBe(true);

  const manifestPath = agentManifestPath(artifactsRoot);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    commands?: {
      rerun?: { argv: string[] };
    };
  };
  manifest.commands!.rerun!.argv = [
    "ptywright",
    "agent",
    "rerun",
    join(artifactsRoot, "stale.summary.json"),
  ];
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");

  process.exitCode = undefined;
  try {
    await expect(main(["agent", "exec", manifestPath, "--command", "rerun"])).rejects.toThrow(
      "invalid agent manifest commands",
    );
  } finally {
    process.exitCode = 0;
  }
});

test("agent manifest remains valid after copying the artifact directory", async () => {
  const dir = join(".tmp", "tests", "agent-manifest-copy");
  const copyDir = join(".tmp", "tests", "agent-manifest-copy-moved");
  rmSync(dir, { recursive: true, force: true });
  rmSync(copyDir, { recursive: true, force: true });

  const run = await runAgentSpec(
    deterministicAgentSpec({
      name: "agent_manifest_copy",
      artifactsDir: join(dir, "run"),
      snapshotDir: join(dir, "snapshots"),
      targets: ["terminal"],
    }),
    { updateSnapshots: true, headless: true },
  );
  expect(run.ok).toBe(true);

  cpSync(run.artifactsDir, copyDir, { recursive: true });
  const validation = await validateAgentArtifactsPath(agentManifestPath(copyDir));
  expect(validation).toMatchObject({ ok: true, totalCount: 1, failureCount: 0 });

  const copiedManifest = readAgentManifestPath(agentManifestPath(copyDir));
  expect(copiedManifest.files.some((file) => file.path.endsWith(".terminal.txt"))).toBe(true);
  expect(copiedManifest.files.every((file) => !file.path.startsWith(run.artifactsDir))).toBe(true);
});

test("agent validate treats copied manifest directories as portable bundles", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-manifest-validate-dir");
  const copyRoot = join(".tmp", "tests", "agent-manifest-validate-dir-moved");
  rmSync(artifactsRoot, { recursive: true, force: true });
  rmSync(copyRoot, { recursive: true, force: true });

  writeMinimalCheckManifestBundle(artifactsRoot);
  cpSync(artifactsRoot, copyRoot, { recursive: true });
  rmSync(artifactsRoot, { recursive: true, force: true });

  const validation = await validateAgentArtifactsPath(copyRoot, { preferManifestBundle: true });
  expect(validation).toMatchObject({ ok: true, totalCount: 1, failureCount: 0 });
  expect(validation.entries[0]).toMatchObject({
    filePath: resolve(agentManifestPath(copyRoot)),
    kind: "manifest",
    ok: true,
  });

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "validate", copyRoot]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  expect(logs).toEqual([`ok count=1 path=${resolve(copyRoot)}`]);
});

test("agent commands accept a copied manifest bundle directory", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-manifest-command-copy");
  const copyRoot = join(".tmp", "tests", "agent-manifest-command-copy-moved");
  rmSync(artifactsRoot, { recursive: true, force: true });
  rmSync(copyRoot, { recursive: true, force: true });

  writeMinimalCheckManifestBundle(artifactsRoot);
  cpSync(artifactsRoot, copyRoot, { recursive: true });
  rmSync(artifactsRoot, { recursive: true, force: true });

  const commands = await readAgentArtifactCommandsPath(copyRoot);
  expect(commands.path).toBe(resolve(agentManifestPath(copyRoot)));
  expect(commands.commands.rerun.argv).toEqual([
    "ptywright",
    "agent",
    "rerun",
    join(copyRoot, "agent-check.summary.json"),
    "--artifacts-root",
    copyRoot,
  ]);
  expect(commands.commands.updateSnapshots.argv).toEqual([
    "ptywright",
    "agent",
    "check",
    "tests/agent-cassettes",
    "--artifacts-root",
    copyRoot,
    "--update-snapshots",
  ]);
  expect(commands.shell.rerun).toBe(
    "ptywright agent rerun .tmp/tests/agent-manifest-command-copy-moved/agent-check.summary.json --artifacts-root .tmp/tests/agent-manifest-command-copy-moved",
  );

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "commands", copyRoot, "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const parsed = JSON.parse(logs.join("\n")) as {
    path?: string;
    kind?: string;
    commands?: { rerun?: { argv?: string[] } };
  };
  expect(parsed.path).toBe(resolve(agentManifestPath(copyRoot)));
  expect(parsed.kind).toBe("manifest");
  expect(parsed.commands?.rerun?.argv).toEqual(commands.commands.rerun.argv);
});

test("agent exec rerun works from a copied manifest bundle", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-manifest-exec-copy");
  const copyRoot = join(".tmp", "tests", "agent-manifest-exec-copy-moved");
  rmSync(artifactsRoot, { recursive: true, force: true });
  rmSync(copyRoot, { recursive: true, force: true });

  const check = await checkAgentRegression({
    cassetteDir: "tests/agent-cassettes",
    artifactsRoot,
    headless: true,
  });
  expect(check.ok).toBe(true);

  cpSync(artifactsRoot, copyRoot, { recursive: true });
  rmSync(artifactsRoot, { recursive: true, force: true });

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

  const output = logs.join("\n");
  expect(output).toContain("ok agent-check");
  expect(output).toContain(`checkSummary=${join(copyRoot, "agent-check.summary.json")}`);
  expect(existsSync(join(copyRoot, "agent-check.summary.json"))).toBe(true);
}, 60_000);

test("agent check summary next to a moved manifest reruns from local bundle records", async () => {
  const dir = join(".tmp", "tests", "agent-manifest-check-summary-copy");
  const cassetteDir = join(dir, "cassettes");
  const artifactsRoot = join(dir, "compare");
  const copyRoot = join(dir, "compare-moved");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(cassetteDir, { recursive: true });

  const cassette = JSON.parse(
    await Bun.file(
      join("tests", "agent-cassettes", "agent_deterministic", "agent_deterministic.cassette.json"),
    ).text(),
  );
  await Bun.write(
    join(cassetteDir, "agent_manifest_check_summary_copy.cassette.json"),
    JSON.stringify(cassette, null, 2) + "\n",
  );

  const check = await checkAgentRegression({
    cassetteDir,
    artifactsRoot,
    headless: true,
  });
  expect(check.ok).toBe(true);

  cpSync(artifactsRoot, copyRoot, { recursive: true });
  rmSync(cassetteDir, { recursive: true, force: true });
  rmSync(artifactsRoot, { recursive: true, force: true });

  const movedSummaryPath = join(copyRoot, "agent-check.summary.json");
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

  const output = logs.join("\n");
  expect(output).toContain("ok agent-check");
  expect(output).toContain(`summary=${resolve(copyRoot, "agent-replay.summary.json")}`);
  expect(output).toContain(`checkSummary=${join(copyRoot, "agent-check.summary.json")}`);
  expect(await validateAgentArtifactsPath(copyRoot, { preferManifestBundle: true })).toMatchObject({
    ok: true,
    totalCount: 1,
    failureCount: 0,
  });
}, 25_000);

test("agent replay file discovery keeps copied reruns from recursive outputs", async () => {
  const copyRoot = join(".tmp", "tests", "agent-manifest-exec-repeat-moved");
  rmSync(copyRoot, { recursive: true, force: true });

  const originalInputDir = join(
    ".tmp",
    "tests",
    "agent-manifest-exec-repeat",
    "tests",
    "agent_deterministic__agent_deterministic.cassette.json",
  );
  const movedInputDir = join(
    copyRoot,
    "tests",
    "agent_deterministic__agent_deterministic.cassette.json",
  );
  const generatedOutputDir = join(
    copyRoot,
    "tests",
    "agent_deterministic__agent_deterministic.cassette.json__agent_deterministic.agent-run.json",
  );
  mkdirSync(movedInputDir, { recursive: true });
  mkdirSync(generatedOutputDir, { recursive: true });

  writeFileSync(
    join(movedInputDir, "agent_deterministic.agent-run.json"),
    JSON.stringify({ artifactsDir: originalInputDir }) + "\n",
    "utf8",
  );
  writeFileSync(join(movedInputDir, "agent_deterministic.cassette.json"), "{}\n", "utf8");
  writeFileSync(
    join(generatedOutputDir, "agent_deterministic.agent-run.json"),
    JSON.stringify({ artifactsDir: generatedOutputDir }) + "\n",
    "utf8",
  );

  expect(
    listAgentReplayFiles(join(copyRoot, "tests"), {
      artifactsRoot: copyRoot,
    }),
  ).toEqual([resolve(movedInputDir, "agent_deterministic.agent-run.json")]);
  expect(
    existsSync(
      join(
        copyRoot,
        "tests",
        "agent_deterministic__agent_deterministic.cassette.json__agent_deterministic.agent-run.json__agent_deterministic.agent-run.json",
      ),
    ),
  ).toBe(false);
}, 35_000);

test("agent exec updateSnapshots works from a copied manifest bundle", async () => {
  const dir = join(".tmp", "tests", "agent-manifest-exec-copy-update");
  const cassetteDir = join(dir, "cassettes");
  const snapshotDir = join(dir, "snapshots");
  const artifactsRoot = join(dir, "compare");
  const copyRoot = join(dir, "compare-moved");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(cassetteDir, { recursive: true });

  const cassettePath = join(cassetteDir, "agent_manifest_exec_copy_update.cassette.json");
  const cassette = JSON.parse(
    await Bun.file(
      join("tests", "agent-cassettes", "agent_deterministic", "agent_deterministic.cassette.json"),
    ).text(),
  ) as {
    spec?: { snapshotDir?: string };
  };
  cassette.spec = { ...cassette.spec, snapshotDir };
  await Bun.write(cassettePath, JSON.stringify(cassette, null, 2) + "\n");

  const check = await checkAgentRegression({
    cassetteDir,
    artifactsRoot,
    headless: true,
  });
  expect(check.ok).toBe(false);
  expect(existsSync(join(snapshotDir, "desktop.ready.terminal.snap.txt"))).toBe(false);

  cpSync(artifactsRoot, copyRoot, { recursive: true });
  rmSync(artifactsRoot, { recursive: true, force: true });
  expect(existsSync(artifactsRoot)).toBe(false);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "exec", copyRoot, "--command", "updateSnapshots"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const output = logs.join("\n");
  expect(output).toContain("ok agent-check");
  expect(output).toContain(`checkSummary=${join(copyRoot, "agent-check.summary.json")}`);
  expect(existsSync(join(snapshotDir, "desktop.ready.terminal.snap.txt"))).toBe(true);
  expect(existsSync(join(snapshotDir, "desktop.status.dom.snap.html"))).toBe(true);

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
    await main(["agent", "exec", copyRoot, "--command", "rerun"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  expect(logs.join("\n")).toContain("ok agent-check");
  expect(await validateAgentArtifactsPath(copyRoot, { preferManifestBundle: true })).toMatchObject({
    ok: true,
    totalCount: 1,
    failureCount: 0,
  });
}, 60_000);

test("agent inspect summarizes a manifest bundle and reusable commands", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-manifest-inspect");
  rmSync(artifactsRoot, { recursive: true, force: true });

  const { summaryPath } = writeMinimalCheckManifestBundle(artifactsRoot);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "inspect", artifactsRoot]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const output = logs.join("\n");
  expect(output).toContain("ok agent-inspect");
  expect(output).toContain("kind=manifest");
  expect(output).toContain(`path=${resolve(agentManifestPath(artifactsRoot))}`);
  expect(output).toContain("validation=ok count=1");
  expect(output).toContain(
    `directoryManifest=found path=${resolve(agentManifestPath(artifactsRoot))}`,
  );
  expect(output).toContain("manifestKind=check");
  expect(output).toContain("manifestFileKind.check-summary=1");
  expect(output).toContain("manifestStage.inputs=ok");
  expect(output).toContain("commands=check,rerun,updateSnapshots");
  expect(output).toContain(
    `command.rerun: ptywright agent rerun ${summaryPath} --artifacts-root ${artifactsRoot}`,
  );
});

test("agent inspect JSON uses copied manifest paths and reports command argv", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-manifest-inspect-json");
  const copyRoot = join(".tmp", "tests", "agent-manifest-inspect-json-moved");
  rmSync(artifactsRoot, { recursive: true, force: true });
  rmSync(copyRoot, { recursive: true, force: true });
  writeMinimalCheckManifestBundle(artifactsRoot);

  cpSync(artifactsRoot, copyRoot, { recursive: true });
  rmSync(artifactsRoot, { recursive: true, force: true });

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "inspect", agentManifestPath(copyRoot), "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const parsed = JSON.parse(logs.join("\n")) as {
    ok?: boolean;
    kind?: string;
    manifest?: {
      primaryPath?: string;
      files?: {
        totalCount?: number;
        byKind?: Record<string, number>;
      };
    };
    commands?: {
      commands?: {
        rerun?: { argv?: string[] };
      };
    };
  };
  expect(parsed.ok).toBe(true);
  expect(parsed.kind).toBe("manifest");
  expect(parsed.manifest?.primaryPath).toBe(resolve(copyRoot, "agent-check.summary.json"));
  expect(parsed.manifest?.files?.totalCount).toBeGreaterThan(0);
  expect(parsed.manifest?.files?.byKind?.["check-summary"]).toBe(1);
  expect(parsed.commands?.commands?.rerun?.argv).toEqual([
    "ptywright",
    "agent",
    "rerun",
    join(copyRoot, "agent-check.summary.json"),
    "--artifacts-root",
    copyRoot,
  ]);
}, 20_000);

test("agent inspect shows the manifest that relocates moved summary commands", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-manifest-inspect-summary");
  const copyRoot = join(".tmp", "tests", "agent-manifest-inspect-summary-moved");
  rmSync(artifactsRoot, { recursive: true, force: true });
  rmSync(copyRoot, { recursive: true, force: true });
  writeMinimalCheckManifestBundle(artifactsRoot);

  cpSync(artifactsRoot, copyRoot, { recursive: true });
  rmSync(artifactsRoot, { recursive: true, force: true });

  const movedSummaryPath = join(copyRoot, "agent-check.summary.json");
  const movedManifestPath = resolve(agentManifestPath(copyRoot));
  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "inspect", movedSummaryPath]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const output = logs.join("\n");
  expect(output).toContain("kind=check-summary");
  expect(output).toContain(`commandsManifest=${movedManifestPath}`);
  expect(output).toContain(
    `command.rerun: ptywright agent rerun ${join(copyRoot, "agent-check.summary.json")} --artifacts-root ${copyRoot}`,
  );

  logs.length = 0;
  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "inspect", movedSummaryPath, "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const parsed = JSON.parse(logs.join("\n")) as {
    commands?: {
      manifestPath?: string;
      commands?: {
        rerun?: { argv?: string[] };
      };
    };
  };
  expect(parsed.commands?.manifestPath).toBe(movedManifestPath);
  expect(parsed.commands?.commands?.rerun?.argv).toEqual([
    "ptywright",
    "agent",
    "rerun",
    join(copyRoot, "agent-check.summary.json"),
    "--artifacts-root",
    copyRoot,
  ]);
}, 20_000);

test("agent inspect fails for a tampered moved summary with an attached manifest", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-manifest-inspect-summary-tamper");
  const copyRoot = join(".tmp", "tests", "agent-manifest-inspect-summary-tamper-moved");
  rmSync(artifactsRoot, { recursive: true, force: true });
  rmSync(copyRoot, { recursive: true, force: true });
  writeMinimalCheckManifestBundle(artifactsRoot);

  cpSync(artifactsRoot, copyRoot, { recursive: true });
  rmSync(artifactsRoot, { recursive: true, force: true });

  const movedSummaryPath = join(copyRoot, "agent-check.summary.json");
  writeFileSync(movedSummaryPath, readFileSync(movedSummaryPath, "utf8") + "\n", "utf8");

  const errors: string[] = [];
  const originalError = console.error;

  process.exitCode = undefined;
  try {
    console.error = (...args: unknown[]) => {
      errors.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "inspect", movedSummaryPath]);
    expect(currentExitCode()).toBe(1);
  } finally {
    console.error = originalError;
    process.exitCode = 0;
  }

  const output = errors.join("\n");
  expect(output).toContain("failed agent-inspect");
  expect(output).toContain(`commandsManifest=${resolve(agentManifestPath(copyRoot))}`);
  expect(output).toContain("invalid agent manifest files");
}, 20_000);

test("agent inspect fails when a manifest indexed file is tampered", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-manifest-inspect-tamper");
  rmSync(artifactsRoot, { recursive: true, force: true });
  writeMinimalCheckManifestBundle(artifactsRoot);

  const manifestPath = agentManifestPath(artifactsRoot);
  const summaryPath = join(artifactsRoot, "agent-check.summary.json");
  writeFileSync(summaryPath, readFileSync(summaryPath, "utf8") + "\n", "utf8");

  const errors: string[] = [];
  const originalError = console.error;

  process.exitCode = undefined;
  try {
    console.error = (...args: unknown[]) => {
      errors.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "inspect", manifestPath]);
    expect(currentExitCode()).toBe(1);
  } finally {
    console.error = originalError;
    process.exitCode = 0;
  }

  const output = errors.join("\n");
  expect(output).toContain("failed agent-inspect");
  expect(output).toContain("validation=failed count=1");
  expect(output).toContain("invalid agent manifest files");
});

test("agent inspect explains when a directory is not a manifest bundle", async () => {
  const dir = join(".tmp", "tests", "agent-manifest-inspect-plain-dir");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  const run = await runAgentSpec(
    deterministicAgentSpec({
      name: "agent_manifest_inspect_plain_dir",
      artifactsDir: join(dir, "run"),
      snapshotDir: join(dir, "snapshots"),
      targets: ["terminal"],
    }),
    { updateSnapshots: true, headless: true },
  );
  expect(run.ok).toBe(true);
  expect(existsSync(join(dir, AGENT_MANIFEST_FILE_NAME))).toBe(false);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "inspect", dir]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const output = logs.join("\n");
  expect(output).toContain("ok agent-inspect");
  expect(output).toContain("validation=ok count=");
  expect(output).toContain(
    `directoryManifest=missing path=${resolve(dir, AGENT_MANIFEST_FILE_NAME)}`,
  );
  expect(output).toContain("hint=ptywright-agent.manifest.json is required");

  logs.length = 0;
  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "inspect", dir, "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const parsed = JSON.parse(logs.join("\n")) as {
    directory?: {
      isDirectory?: boolean;
      hasManifest?: boolean;
      manifestPath?: string;
      hint?: string;
    };
  };
  expect(parsed.directory).toMatchObject({
    isDirectory: true,
    hasManifest: false,
    manifestPath: resolve(dir, AGENT_MANIFEST_FILE_NAME),
  });
  expect(parsed.directory?.hint).toContain("agent validate <dir>");
}, 20_000);

test("agent validate includes manifests when scanning artifact directories", async () => {
  const dir = join(".tmp", "tests", "agent-manifest-scan");
  const bundleDir = join(dir, "bundle");
  rmSync(dir, { recursive: true, force: true });
  expect(existsSync(join(dir, AGENT_MANIFEST_FILE_NAME))).toBe(false);

  writeMinimalCheckManifestBundle(bundleDir);

  const validation = await validateAgentArtifactsPath(dir);
  expect(validation.ok).toBe(true);
  expect(validation.entries).toContainEqual(
    expect.objectContaining({
      filePath: resolve(agentManifestPath(bundleDir)),
      kind: "manifest",
      ok: true,
    }),
  );
});
