import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  formatAgentArtifactCommandLines,
  readAgentArtifactCommandsPath,
  selectAgentArtifactCommand,
  validateAgentCommandArgv,
  validateAgentManifestCommandTargets,
} from "../agent/commands";
import { formatAgentInspectLines, inspectAgentArtifactPath } from "../agent/inspect";
import { readAgentManifestPath, validateAgentManifestFiles } from "../agent/manifest";
import { createAgentTemplateSpec } from "../agent/presets";
import { validateAgentArtifactsPath } from "../agent/validate";
import type { AgentCliArgs, AgentCliMode } from "./agent_args";
import { logLines } from "./common";

type AgentArtifactCommandMode = Extract<
  AgentCliMode,
  "init" | "validate" | "commands" | "inspect" | "exec"
>;

type AgentArtifactCommandArgs = AgentCliArgs & {
  mode: AgentArtifactCommandMode;
};

type AgentDispatch = (argv: string[]) => Promise<number>;

export function isAgentArtifactCommandMode(mode: AgentCliMode): mode is AgentArtifactCommandMode {
  return (
    mode === "init" ||
    mode === "validate" ||
    mode === "commands" ||
    mode === "inspect" ||
    mode === "exec"
  );
}

export async function runAgentArtifactCommand(
  args: AgentArtifactCommandArgs,
  options: { dispatch: AgentDispatch },
): Promise<number> {
  if (args.mode === "init") {
    return runAgentInit(args);
  }

  if (args.mode === "validate") {
    return await runAgentValidate(args);
  }

  if (args.mode === "commands") {
    return await runAgentCommands(args);
  }

  if (args.mode === "inspect") {
    return await runAgentInspect(args);
  }

  return await runAgentExec(args, options.dispatch);
}

function runAgentInit(args: AgentArtifactCommandArgs): number {
  const spec = createAgentTemplateSpec(args.flavor ?? "generic");
  const path = args.path!;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(
      {
        $schema: "../schemas/ptywright-agent.schema.json",
        ...spec,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  logLines([`ok wrote ${path}`], false);
  return 0;
}

async function runAgentValidate(args: AgentArtifactCommandArgs): Promise<number> {
  const result = await validateAgentArtifactsPath(args.path!, { preferManifestBundle: true });
  if (args.json) {
    logLines([JSON.stringify(result, null, 2)], false);
    return result.ok ? 0 : 1;
  }

  const failures = result.entries.filter((entry) => !entry.ok);
  logLines(
    [
      `${result.ok ? "ok" : "failed"} count=${result.totalCount} path=${result.path}`,
      result.failureCount > 0 ? `failures=${result.failureCount}` : null,
      ...failures.flatMap((entry) => [
        `- ${entry.filePath}`,
        `  kind=${entry.kind}`,
        entry.error ? `  error=${entry.error}` : null,
      ]),
    ],
    !result.ok,
  );
  return result.ok ? 0 : 1;
}

async function runAgentCommands(args: AgentArtifactCommandArgs): Promise<number> {
  const result = await readAgentArtifactCommandsPath(args.path!);
  validateAttachedManifest(result);
  if (args.commandName) {
    const selected = selectAgentArtifactCommand(result, args.commandName);
    logLines([args.json ? JSON.stringify(selected, null, 2) : selected.shell], false);
    return 0;
  }

  logLines(
    args.json ? [JSON.stringify(result, null, 2)] : formatAgentArtifactCommandLines(result),
    false,
  );
  return 0;
}

async function runAgentInspect(args: AgentArtifactCommandArgs): Promise<number> {
  const result = await inspectAgentArtifactPath(args.path!);
  if (args.json) {
    logLines([JSON.stringify(result, null, 2)], false);
  } else {
    logLines(formatAgentInspectLines(result), !result.ok);
  }
  return result.ok ? 0 : 1;
}

async function runAgentExec(
  args: AgentArtifactCommandArgs,
  dispatch: AgentDispatch,
): Promise<number> {
  const result = await readAgentArtifactCommandsPath(args.path!);
  validateAttachedManifest(result);

  const selected = selectAgentArtifactCommand(result, args.commandName!);
  const argv = selected.command.argv;
  validateAgentCommandArgv(argv, selected.name);

  const [, , subcommand, ...rest] = argv;
  return dispatch([
    subcommand ?? "",
    ...rest,
    ...(args.configPath ? ["--config", args.configPath] : []),
  ]);
}

function validateAttachedManifest(result: {
  kind: string;
  path?: string;
  manifestPath?: string;
}): void {
  const manifestPath = result.kind === "manifest" ? result.path : result.manifestPath;
  if (!manifestPath) return;

  const manifest = readAgentManifestPath(manifestPath);
  validateAgentManifestCommandTargets(manifest, manifestPath);
  validateAgentManifestFiles(manifest, manifestPath);
}
