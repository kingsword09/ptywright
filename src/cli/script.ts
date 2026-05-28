import {
  formatScriptArtifactCommandLines,
  readScriptArtifactCommandsPath,
  selectScriptArtifactCommand,
  validateScriptCommandArgv,
} from "../script/commands";
import { formatScriptInspectLines, inspectScriptArtifactPath } from "../script/inspect";
import {
  readScriptManifestPath,
  resolveScriptManifestPath,
  SCRIPT_MANIFEST_FILE_NAME,
  validateScriptManifest,
} from "../script/manifest";
import { runAllScripts } from "../script/run_all";
import { runScriptPath } from "../script/path";
import { readScriptRunSummaryPath, resolveScriptRunSummaryPath } from "../script/summary";
import { logLines } from "./common";
import { parseRunAllArgs, parseRunArgs, parseScriptArgs } from "./script_args";
import { printRunAllResult, printRunResult, printScriptValidateResult } from "./script_output";

export async function cmdRun(argv: string[]): Promise<number> {
  const args = parseRunArgs(argv);
  const result = await runScriptPath(args.scriptPath, {
    artifactsDir: args.artifactsDir,
    updateGoldens: args.updateGoldens,
    stepsPath: args.stepsPath,
  });

  return printRunResult(result);
}

export async function cmdRunAll(argv: string[]): Promise<number> {
  const args = parseRunAllArgs(argv);
  const result = await runAllScripts({
    dir: args.dir,
    artifactsRoot: args.artifactsRoot,
    stepsPath: args.stepsPath,
    updateGoldens: args.updateGoldens,
  });

  return printRunAllResult(result);
}

export async function cmdScript(argv: string[]): Promise<number> {
  const args = parseScriptArgs(argv);

  if (args.mode === "validate") {
    const manifestPath = resolveScriptManifestPath(args.path);
    const hasManifest = manifestPath.endsWith(SCRIPT_MANIFEST_FILE_NAME)
      ? readOptionalScriptManifest(manifestPath)
      : null;
    const summaryPath = hasManifest
      ? resolveScriptRunSummaryPath(hasManifest.primaryPath)
      : resolveScriptRunSummaryPath(args.path);
    if (hasManifest) validateScriptManifest(hasManifest, manifestPath);
    const summary = readScriptRunSummaryPath(summaryPath);
    return printScriptValidateResult({
      summary,
      summaryPath,
      manifestPath: hasManifest ? manifestPath : undefined,
      json: args.json,
    });
  }

  if (args.mode === "inspect") {
    const result = inspectScriptArtifactPath(args.path);
    if (args.json) {
      logLines([JSON.stringify(result, null, 2)], false);
    } else {
      logLines(formatScriptInspectLines(result), false);
    }
    return 0;
  }

  const result = readScriptArtifactCommandsPath(args.path);
  if (args.mode === "commands") {
    if (args.commandName) {
      const selected = selectScriptArtifactCommand(result, args.commandName);
      if (args.json) {
        logLines([JSON.stringify(selected, null, 2)], false);
      } else {
        logLines([selected.shell], false);
      }
      return 0;
    }

    if (args.json) {
      logLines([JSON.stringify(result, null, 2)], false);
    } else {
      logLines(formatScriptArtifactCommandLines(result), false);
    }
    return 0;
  }

  const selected = selectScriptArtifactCommand(result, args.commandName!);
  const commandArgv = selected.command.argv;
  validateScriptCommandArgv(commandArgv, selected.name);
  const [, subcommand, ...rest] = commandArgv;
  if (subcommand === "run-all") {
    return cmdRunAll(rest);
  }

  throw new Error(`unsupported script artifact command: ${subcommand ?? ""}`);
}

function readOptionalScriptManifest(
  path: string,
): ReturnType<typeof readScriptManifestPath> | null {
  try {
    return readScriptManifestPath(path);
  } catch {
    return null;
  }
}
