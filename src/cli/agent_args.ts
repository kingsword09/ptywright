import { isAgentCliMode, parseAgentFlavor } from "./agent_args_modes";
import type { AgentCliArgs } from "./agent_args_types";
import { missingAgentSubcommandError, validateAgentArgs } from "./agent_args_validation";

export { shouldLoadAgentConfig } from "./agent_args_modes";
export type { AgentCliArgs, AgentCliMode } from "./agent_args_types";

export function parseAgentArgs(argv: string[]): AgentCliArgs {
  const [mode, ...rest] = argv;
  if (!isAgentCliMode(mode)) {
    throw missingAgentSubcommandError();
  }

  const out: Omit<AgentCliArgs, "mode"> = {
    updateSnapshots: false,
    headed: false,
    json: false,
  };

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    const next = rest[i + 1];

    if (mode === "init" && !out.flavor && arg && !arg.startsWith("-")) {
      out.flavor = parseAgentFlavor(arg);
      continue;
    }

    if (arg === "--config") {
      if (!next) {
        throw new Error(`missing <file> for --config`);
      }
      out.configPath = next;
      i += 1;
      continue;
    }

    if (arg === "--artifacts-root" && next) {
      out.artifactsRoot = next;
      i += 1;
      continue;
    }

    if ((arg === "--cassette-dir" || arg === "--dir") && next) {
      out.cassetteDir = next;
      i += 1;
      continue;
    }

    if (arg === "--snapshot-dir" && next) {
      out.snapshotDir = next;
      i += 1;
      continue;
    }

    if (!out.path && arg && !arg.startsWith("-")) {
      out.path = arg;
      continue;
    }

    if (arg === "--artifacts-dir" && next) {
      out.artifactsDir = next;
      i += 1;
      continue;
    }

    if (arg === "--out" && next) {
      out.outPath = next;
      i += 1;
      continue;
    }

    if (arg === "--duration-ms" && next) {
      const value = Number.parseInt(next, 10);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`invalid --duration-ms: ${next}`);
      }
      out.durationMs = value;
      i += 1;
      continue;
    }

    if (arg === "--command" && next) {
      out.commandName = next;
      i += 1;
      continue;
    }

    if (arg === "--update-snapshots") {
      out.updateSnapshots = true;
      continue;
    }

    if (arg === "--headed") {
      out.headed = true;
      continue;
    }

    if (arg === "--json") {
      out.json = true;
      continue;
    }

    throw new Error(`unknown arg: ${arg ?? ""}`);
  }

  validateAgentArgs(mode, out);

  return { mode, ...out };
}
