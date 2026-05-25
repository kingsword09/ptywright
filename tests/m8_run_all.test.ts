import { expect, test } from "bun:test";

import { existsSync, readFileSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { runAllScripts } from "../src/script/run_all";
import {
  readScriptArtifactCommandsPath,
  selectScriptArtifactCommand,
  validateScriptCommandArgv,
} from "../src/script/commands";
import { readScriptRunSummaryPath } from "../src/script/summary";
import { main } from "../src/cli";

function currentExitCode(): string | number | null | undefined {
  return process.exitCode;
}

test("script:run-all discovers scripts and skips step modules", async () => {
  const dir = "tests/fixtures/run_all_scripts";
  const result = await runAllScripts({
    dir,
    artifactsRoot: ".tmp/test_scripts/run_all",
    stepsPath: `${dir}/custom_steps.ts`,
  });

  expect(result.entries.length).toBeGreaterThan(0);
  expect(result.entries.some((e) => basename(e.filePath) === "custom_steps.ts")).toBe(false);
  expect(result.entries.some((e) => basename(e.filePath) === "ignore.steps.ts")).toBe(false);

  expect(result.ok).toBe(true);

  expect(existsSync(result.reportPath)).toBe(true);
  expect(existsSync(result.summaryPath)).toBe(true);

  const html = readFileSync(result.reportPath, "utf8");
  expect(html).toContain("ptywright script report");
  expect(html).toContain("run.summary.json");

  const summary = readScriptRunSummaryPath(result.summaryPath);
  expect(summary.$schema).toContain("ptywright-script-run-summary.schema.json");
  expect(summary.commands.runAll.argv).toEqual([
    "ptywright",
    "run-all",
    resolve(dir),
    "--artifacts-root",
    resolve(".tmp/test_scripts/run_all"),
    "--steps",
    `${dir}/custom_steps.ts`,
  ]);
  expect(summary.commands.updateGoldens.argv).toEqual([
    ...summary.commands.runAll.argv,
    "--update-goldens",
  ]);
});

test("script commands reads run summary commands and supports CLI output", async () => {
  const dir = "tests/fixtures/run_all_scripts";
  const artifactsRoot = ".tmp/test_scripts/run_all_commands";
  rmSync(artifactsRoot, { recursive: true, force: true });

  const result = await runAllScripts({
    dir,
    artifactsRoot,
    stepsPath: `${dir}/custom_steps.ts`,
  });
  expect(result.ok).toBe(true);

  const commands = readScriptArtifactCommandsPath(result.suiteDir);
  expect(commands.kind).toBe("run-summary");
  expect(commands.path).toBe(resolve(result.summaryPath));
  expect(commands.commands.runAll.argv).toEqual([
    "ptywright",
    "run-all",
    resolve(dir),
    "--artifacts-root",
    artifactsRoot,
    "--steps",
    `${dir}/custom_steps.ts`,
  ]);
  expect(commands.shell.runAll).toBe(
    `ptywright run-all ${resolve(
      dir,
    )} --artifacts-root .tmp/test_scripts/run_all_commands --steps tests/fixtures/run_all_scripts/custom_steps.ts`,
  );

  const selected = selectScriptArtifactCommand(commands, "updateGoldens");
  expect(selected).toMatchObject({
    kind: "run-summary",
    cwd: process.cwd(),
    name: "updateGoldens",
    command: {
      argv: [...commands.commands.runAll.argv, "--update-goldens"],
    },
  });
  expect(() => selectScriptArtifactCommand(commands, "missing")).toThrow(
    "unknown script artifact command: missing (available: runAll, updateGoldens)",
  );
  expect(() => validateScriptCommandArgv(["ptywright", "run-all", dir], "runAll")).not.toThrow();
  expect(() => validateScriptCommandArgv(["bun", "run", "src/cli.ts"], "bad")).toThrow(
    "command bad argv must start with a supported ptywright script command",
  );

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["script", "commands", result.suiteDir, "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const parsed = JSON.parse(logs.join("\n")) as {
    kind?: string;
    cwd?: string;
    shell?: { runAll?: string };
    commands?: { runAll?: { argv?: string[] } };
  };
  expect(parsed.kind).toBe("run-summary");
  expect(parsed.cwd).toBe(process.cwd());
  expect(parsed.commands?.runAll?.argv).toEqual(commands.commands.runAll.argv);
  expect(parsed.shell?.runAll).toBe(commands.shell.runAll);

  logs.length = 0;
  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["script", "commands", result.summaryPath, "--command", "updateGoldens"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  expect(logs).toEqual([commands.shell.updateGoldens]);

  logs.length = 0;
  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["script", "validate", result.suiteDir, "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  expect(JSON.parse(logs.join("\n"))).toMatchObject({
    ok: true,
    kind: "manifest",
    path: resolve(result.summaryPath),
    manifestPath: resolve(join(result.suiteDir, "ptywright-script.manifest.json")),
    failureCount: 0,
  });
});

test("script exec runs a selected command from run summary metadata", async () => {
  const dir = "tests/fixtures/run_all_scripts";
  const artifactsRoot = ".tmp/test_scripts/run_all_exec";
  rmSync(artifactsRoot, { recursive: true, force: true });

  const result = await runAllScripts({
    dir,
    artifactsRoot,
    stepsPath: `${dir}/custom_steps.ts`,
  });
  expect(result.ok).toBe(true);

  const logs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["script", "exec", result.summaryPath, "--command", "runAll"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  expect(logs.join("\n")).toContain("ok count=");
  expect(existsSync(join(artifactsRoot, "ptywright-script.manifest.json"))).toBe(true);
});

test("script commands rejects manifest bundles with tampered files", async () => {
  const dir = "tests/fixtures/run_all_scripts";
  const artifactsRoot = ".tmp/test_scripts/run_all_manifest_tamper";
  rmSync(artifactsRoot, { recursive: true, force: true });

  const result = await runAllScripts({
    dir,
    artifactsRoot,
    stepsPath: `${dir}/custom_steps.ts`,
  });
  expect(result.ok).toBe(true);

  await Bun.write(result.summaryPath, readFileSync(result.summaryPath, "utf8") + "\n");

  expect(() => readScriptArtifactCommandsPath(result.suiteDir)).toThrow(
    "invalid script manifest files",
  );
  await expect(main(["script", "validate", result.suiteDir])).rejects.toThrow(
    "invalid script manifest files",
  );
});
