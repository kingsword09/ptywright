import { formatAgentArgv } from "./run_record";
import type {
  AgentArtifactCommands,
  AgentCommandArtifactKind,
  AgentCommandMap,
  SelectedAgentArtifactCommand,
} from "./command_types";

export function createArtifactCommands(
  path: string,
  kind: AgentCommandArtifactKind,
  commands: AgentCommandMap,
  options: { manifestPath?: string } = {},
): AgentArtifactCommands {
  return {
    path,
    kind,
    manifestPath: options.manifestPath,
    cwd: process.cwd(),
    shell: Object.fromEntries(
      Object.entries(commands).map(([name, command]) => [name, formatAgentArgv(command.argv)]),
    ),
    commands,
  };
}

export function formatAgentArtifactCommandLines(result: AgentArtifactCommands): string[] {
  return [
    `kind=${result.kind}`,
    `path=${result.path}`,
    result.manifestPath ? `manifest=${result.manifestPath}` : null,
    ...Object.entries(result.commands).map(
      ([name, command]) => `${name}: ${formatAgentArgv(command.argv)}`,
    ),
  ].filter((line): line is string => line !== null);
}

export function selectAgentArtifactCommand(
  result: AgentArtifactCommands,
  name: string,
): SelectedAgentArtifactCommand {
  const command = result.commands[name];
  if (!command) {
    const available = Object.keys(result.commands).sort().join(", ");
    throw new Error(
      `unknown agent artifact command: ${name}${available ? ` (available: ${available})` : ""}`,
    );
  }
  return {
    path: result.path,
    kind: result.kind,
    manifestPath: result.manifestPath,
    cwd: result.cwd,
    name,
    command,
    shell: result.shell[name] ?? formatAgentArgv(command.argv),
  };
}

export function validateAgentArtifactCommands(result: AgentArtifactCommands): void {
  for (const [name, command] of Object.entries(result.commands)) {
    validateAgentCommandArgv(command.argv, name);
  }
}

export function validateAgentCommandArgv(argv: readonly string[], name = "<unknown>"): void {
  const [binary, group, subcommand] = argv;
  if (binary !== "ptywright" || group !== "agent" || !isSupportedAgentSubcommand(subcommand)) {
    throw new Error(`command ${name} argv must start with a supported ptywright agent command`);
  }
}

export function replayCommands(path: string): AgentCommandMap {
  const replay = ["ptywright", "agent", "replay", path];
  return {
    replay: { argv: replay },
    updateSnapshots: { argv: [...replay, "--update-snapshots"] },
  };
}

export function runCommands(path: string): AgentCommandMap {
  const run = ["ptywright", "agent", "run", path];
  return {
    run: { argv: run },
    updateSnapshots: { argv: [...run, "--update-snapshots"] },
  };
}

function isSupportedAgentSubcommand(value: string | undefined): boolean {
  return (
    value === "run" ||
    value === "record" ||
    value === "replay" ||
    value === "promote" ||
    value === "replay-all" ||
    value === "rerun" ||
    value === "commands" ||
    value === "inspect" ||
    value === "exec" ||
    value === "check" ||
    value === "validate" ||
    value === "init"
  );
}
