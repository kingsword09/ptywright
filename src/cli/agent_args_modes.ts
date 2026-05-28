import type { AgentFlavor } from "../agent/presets";
import { AGENT_CLI_MODES, type AgentCliMode } from "./agent_args_types";

export function isAgentCliMode(value: string | undefined): value is AgentCliMode {
  return typeof value === "string" && AGENT_CLI_MODES.includes(value as AgentCliMode);
}

export function shouldLoadAgentConfig(mode: AgentCliMode): boolean {
  return (
    mode === "run" ||
    mode === "record" ||
    mode === "replay" ||
    mode === "promote" ||
    mode === "replay-all" ||
    mode === "rerun" ||
    mode === "check"
  );
}

export function parseAgentFlavor(value: string): AgentFlavor {
  if (value === "codex" || value === "claude" || value === "droid" || value === "generic") {
    return value;
  }
  if (value === "droidx") return "droid";
  throw new Error(`unknown agent flavor: ${value}`);
}
