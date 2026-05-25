import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test } from "bun:test";

import { checkAgentRegression } from "../src/agent/check";
import {
  readAgentArtifactCommandsPath,
  selectAgentArtifactCommand,
  validateAgentCommandArgv,
} from "../src/agent/commands";
import { agentManifestPath, writeAgentManifestPath } from "../src/agent/manifest";
import { runAgentSpec } from "../src/agent/runner";
import { main } from "../src/cli";
import { deterministicAgentSpec } from "./agent_fixture";

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

function writeFlowSpec(path: string): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        name: "agent_commands_flow",
        launch: {
          mode: "url",
          url: "http://127.0.0.1:3000/",
        },
        steps: [{ type: "snapshot", name: "ready" }],
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
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

test("agent commands reads replay/update commands from flow, cassette, and run records", async () => {
  const dir = join(".tmp", "tests", "agent-commands");
  const flowPath = join(dir, "flow.json");
  rmSync(dir, { recursive: true, force: true });
  writeFlowSpec(flowPath);

  const flowCommands = await readAgentArtifactCommandsPath(flowPath);
  expect(flowCommands.kind).toBe("flow");
  expect(flowCommands.cwd).toBe(process.cwd());
  expect(flowCommands.commands.run.argv).toEqual(["ptywright", "agent", "run", flowPath]);
  expect(flowCommands.shell.run).toBe("ptywright agent run .tmp/tests/agent-commands/flow.json");
  expect(flowCommands.commands.updateSnapshots.argv).toEqual([
    "ptywright",
    "agent",
    "run",
    flowPath,
    "--update-snapshots",
  ]);

  const cassetteCommands = await readAgentArtifactCommandsPath(committedCassettePath());
  expect(cassetteCommands.kind).toBe("cassette");
  expect(cassetteCommands.commands.replay.argv).toEqual([
    "ptywright",
    "agent",
    "replay",
    committedCassettePath(),
  ]);

  const run = await runAgentSpec(
    deterministicAgentSpec({
      name: "agent_commands_record",
      artifactsDir: join(dir, "run"),
      snapshotDir: join(dir, "snapshots"),
      targets: ["terminal"],
    }),
    { updateSnapshots: true, headless: true },
  );
  expect(run.ok).toBe(true);

  const runRecordCommands = await readAgentArtifactCommandsPath(run.recordPath);
  expect(runRecordCommands.kind).toBe("run-record");
  expect(runRecordCommands.commands.replay.argv).toEqual(run.commands.replay.argv);
  expect(runRecordCommands.commands.updateSnapshots.argv).toEqual(
    run.commands.updateSnapshots.argv,
  );
}, 20_000);

test("agent commands reads summary commands and supports CLI JSON", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-commands-check");
  rmSync(artifactsRoot, { recursive: true, force: true });

  const check = await checkAgentRegression({
    cassetteDir: "tests/agent-cassettes",
    artifactsRoot,
    headless: true,
  });
  expect(check.ok).toBe(true);

  const checkCommands = await readAgentArtifactCommandsPath(check.summaryPath);
  expect(checkCommands.kind).toBe("check-summary");
  expect(checkCommands.commands.rerun.argv).toEqual([
    "ptywright",
    "agent",
    "rerun",
    check.summaryPath,
  ]);

  const replayCommands = await readAgentArtifactCommandsPath(check.replay.summaryPath);
  expect(replayCommands.kind).toBe("replay-summary");
  expect(replayCommands.commands.replayAll.argv).toEqual([
    "ptywright",
    "agent",
    "replay-all",
    resolve("tests/agent-cassettes"),
    "--artifacts-root",
    resolve(artifactsRoot),
  ]);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "commands", check.summaryPath, "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const parsed = JSON.parse(logs.join("\n")) as {
    kind?: string;
    cwd?: string;
    shell?: { rerun?: string };
    commands?: { rerun?: { argv?: string[] } };
  };
  expect(parsed.kind).toBe("check-summary");
  expect(parsed.cwd).toBe(process.cwd());
  expect(parsed.commands?.rerun?.argv).toEqual(checkCommands.commands.rerun.argv);
  expect(parsed.shell?.rerun).toBe(
    "ptywright agent rerun .tmp/tests/agent-commands-check/agent-check.summary.json",
  );
}, 20_000);

test("agent commands can select one reusable command for direct execution", async () => {
  const dir = join(".tmp", "tests", "agent-commands-select");
  const flowPath = join(dir, "flow with spaces.json");
  rmSync(dir, { recursive: true, force: true });
  writeFlowSpec(flowPath);

  const flowCommands = await readAgentArtifactCommandsPath(flowPath);
  const selected = selectAgentArtifactCommand(flowCommands, "updateSnapshots");
  expect(selected).toMatchObject({
    kind: "flow",
    cwd: process.cwd(),
    name: "updateSnapshots",
    command: {
      argv: ["ptywright", "agent", "run", flowPath, "--update-snapshots"],
    },
  });
  expect(selected.shell).toBe(
    `ptywright agent run '.tmp/tests/agent-commands-select/flow with spaces.json' --update-snapshots`,
  );
  expect(() => selectAgentArtifactCommand(flowCommands, "missing")).toThrow(
    "unknown agent artifact command: missing (available: run, updateSnapshots)",
  );

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "commands", flowPath, "--command", "updateSnapshots"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }
  expect(logs).toEqual([
    "ptywright agent run '.tmp/tests/agent-commands-select/flow with spaces.json' --update-snapshots",
  ]);
});

test("agent commands selected JSON includes argv and shell line", async () => {
  const dir = join(".tmp", "tests", "agent-commands-select-json");
  const flowPath = join(dir, "flow.json");
  rmSync(dir, { recursive: true, force: true });
  writeFlowSpec(flowPath);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "commands", flowPath, "--command", "run", "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const parsed = JSON.parse(logs.join("\n")) as {
    name?: string;
    cwd?: string;
    shell?: string;
    command?: { argv?: string[] };
  };
  expect(parsed.name).toBe("run");
  expect(parsed.cwd).toBe(process.cwd());
  expect(parsed.command?.argv).toEqual(["ptywright", "agent", "run", flowPath]);
  expect(parsed.shell).toBe("ptywright agent run .tmp/tests/agent-commands-select-json/flow.json");
});

test("agent commands selected JSON works for summary artifact reruns", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-commands-summary-select-json");
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
    await main(["agent", "commands", check.summaryPath, "--command", "rerun", "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const parsed = JSON.parse(logs.join("\n")) as {
    kind?: string;
    name?: string;
    cwd?: string;
    shell?: string;
    command?: { argv?: string[] };
  };
  expect(parsed.kind).toBe("check-summary");
  expect(parsed.name).toBe("rerun");
  expect(parsed.cwd).toBe(process.cwd());
  expect(parsed.command?.argv).toEqual(["ptywright", "agent", "rerun", check.summaryPath]);
  expect(parsed.shell).toBe(
    "ptywright agent rerun .tmp/tests/agent-commands-summary-select-json/agent-check.summary.json",
  );
}, 20_000);

test("agent commands reports attached manifests for moved summary commands", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-commands-summary-manifest");
  const copyRoot = join(".tmp", "tests", "agent-commands-summary-manifest-moved");
  rmSync(artifactsRoot, { recursive: true, force: true });
  rmSync(copyRoot, { recursive: true, force: true });
  writeMinimalCheckManifestBundle(artifactsRoot);

  cpSync(artifactsRoot, copyRoot, { recursive: true });
  rmSync(artifactsRoot, { recursive: true, force: true });

  const movedSummaryPath = join(copyRoot, "agent-check.summary.json");
  const movedManifestPath = resolve(agentManifestPath(copyRoot));
  const commands = await readAgentArtifactCommandsPath(movedSummaryPath);
  expect(commands.manifestPath).toBe(movedManifestPath);

  const selected = selectAgentArtifactCommand(commands, "rerun");
  expect(selected.manifestPath).toBe(movedManifestPath);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "commands", movedSummaryPath]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  expect(logs).toContain(`manifest=${movedManifestPath}`);
  expect(logs).toContain(
    `rerun: ptywright agent rerun ${join(copyRoot, "agent-check.summary.json")} --artifacts-root ${copyRoot}`,
  );

  logs.length = 0;
  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "commands", movedSummaryPath, "--command", "rerun", "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const parsed = JSON.parse(logs.join("\n")) as {
    manifestPath?: string;
    command?: { argv?: string[] };
  };
  expect(parsed.manifestPath).toBe(movedManifestPath);
  expect(parsed.command?.argv).toEqual([
    "ptywright",
    "agent",
    "rerun",
    join(copyRoot, "agent-check.summary.json"),
    "--artifacts-root",
    copyRoot,
  ]);
});

test("agent commands refuses manifest-backed artifacts with tampered files", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-commands-summary-manifest-tamper");
  const copyRoot = join(".tmp", "tests", "agent-commands-summary-manifest-tamper-moved");
  rmSync(artifactsRoot, { recursive: true, force: true });
  rmSync(copyRoot, { recursive: true, force: true });
  writeMinimalCheckManifestBundle(artifactsRoot);

  cpSync(artifactsRoot, copyRoot, { recursive: true });
  rmSync(artifactsRoot, { recursive: true, force: true });

  const movedSummaryPath = join(copyRoot, "agent-check.summary.json");
  writeFileSync(movedSummaryPath, readFileSync(movedSummaryPath, "utf8") + "\n", "utf8");

  await expect(main(["agent", "commands", movedSummaryPath])).rejects.toThrow(
    "invalid agent manifest files",
  );
  await expect(
    main(["agent", "commands", movedSummaryPath, "--command", "rerun", "--json"]),
  ).rejects.toThrow("invalid agent manifest files");
});

test("agent command argv validation rejects unsupported command shapes", () => {
  expect(() =>
    validateAgentCommandArgv(["ptywright", "agent", "replay", "run.json"], "replay"),
  ).not.toThrow();
  expect(() => validateAgentCommandArgv(["bun", "run", "src/cli.ts"], "bad")).toThrow(
    "command bad argv must start with a supported ptywright agent command",
  );
  expect(() => validateAgentCommandArgv(["ptywright", "agent", "unknown"], "bad")).toThrow(
    "command bad argv must start with a supported ptywright agent command",
  );
});

test("agent commands reports a missing manifest for directory bundle inputs", async () => {
  const dir = join(".tmp", "tests", "agent-commands-empty-dir");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });

  await expect(readAgentArtifactCommandsPath(dir)).rejects.toThrow(
    "agent artifact directory is missing ptywright-agent.manifest.json",
  );
  await expect(main(["agent", "commands", dir])).rejects.toThrow(
    "Pass a supported artifact file, or a manifest bundle directory",
  );
  await expect(main(["agent", "exec", dir, "--command", "rerun"])).rejects.toThrow(
    "Pass a supported artifact file, or a manifest bundle directory",
  );
});

test("agent exec runs one command from an artifact without shell parsing", async () => {
  const dir = join(".tmp", "tests", "agent-exec");
  const flowPath = join(dir, "flow.json");
  const artifactsDir = join(dir, "artifacts");
  const snapshotDir = join(dir, "snapshots");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(flowPath, ".."), { recursive: true });
  writeFileSync(
    flowPath,
    JSON.stringify(
      deterministicAgentSpec({
        name: "agent_exec_fixture",
        artifactsDir,
        snapshotDir,
        targets: ["terminal"],
      }),
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "exec", flowPath, "--command", "updateSnapshots"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  expect(logs.join("\n")).toContain("ok agent=agent_exec_fixture");
}, 15_000);

test("agent exec runs rerun command from a summary artifact", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-exec-summary");
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
    await main(["agent", "exec", check.summaryPath, "--command", "rerun"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const output = logs.join("\n");
  expect(output).toContain("ok agent-check");
  expect(output).toContain(`checkSummary=${check.summaryPath}`);
}, 20_000);

test("agent exec runs updateSnapshots command from a replay summary artifact", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-exec-replay-update");
  const snapshotDir = join(artifactsRoot, "snapshots");
  const cassetteDir = join(artifactsRoot, "cassettes");
  rmSync(artifactsRoot, { recursive: true, force: true });
  mkdirSync(cassetteDir, { recursive: true });

  const cassettePath = join(cassetteDir, "agent_exec_replay_update.cassette.json");
  const cassette = JSON.parse(await Bun.file(committedCassettePath()).text()) as {
    spec?: { snapshotDir?: string };
  };
  cassette.spec = { ...cassette.spec, snapshotDir };
  await Bun.write(cassettePath, JSON.stringify(cassette, null, 2) + "\n");

  const check = await checkAgentRegression({
    cassetteDir,
    artifactsRoot: join(artifactsRoot, "compare"),
    headless: true,
  });
  expect(check.ok).toBe(false);
  expect(existsSync(join(snapshotDir, "desktop.ready.terminal.snap.txt"))).toBe(false);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "exec", check.replay.summaryPath, "--command", "updateSnapshots"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  expect(logs.join("\n")).toContain("ok count=1");
  expect(existsSync(join(snapshotDir, "desktop.ready.terminal.snap.txt"))).toBe(true);
  expect(existsSync(join(snapshotDir, "desktop.status.dom.snap.html"))).toBe(true);
}, 20_000);

test("agent exec selects updateSnapshots command from a check summary artifact", async () => {
  const artifactsRoot = join(".tmp", "tests", "agent-exec-check-update");
  rmSync(artifactsRoot, { recursive: true, force: true });

  const { summaryPath } = writeMinimalCheckManifestBundle(artifactsRoot);
  const commands = await readAgentArtifactCommandsPath(summaryPath);
  const selected = selectAgentArtifactCommand(commands, "updateSnapshots");

  expect(selected.kind).toBe("check-summary");
  expect(selected.name).toBe("updateSnapshots");
  expect(selected.command.argv).toEqual([
    "ptywright",
    "agent",
    "check",
    "tests/agent-cassettes",
    "--artifacts-root",
    artifactsRoot,
    "--update-snapshots",
  ]);
  expect(selected.shell).toBe(
    "ptywright agent check tests/agent-cassettes --artifacts-root .tmp/tests/agent-exec-check-update --update-snapshots",
  );
});
