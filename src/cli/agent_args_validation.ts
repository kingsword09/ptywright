import type { AgentCliArgs, AgentCliMode } from "./agent_args_types";
import { usage } from "./common";

export function missingAgentSubcommandError(): Error {
  return new Error(
    "missing agent subcommand: run|record|replay|promote|replay-all|rerun|commands|inspect|exec|check|validate|init\n\n" +
      usage(),
  );
}

export function validateAgentArgs(mode: AgentCliMode, out: Omit<AgentCliArgs, "mode">): void {
  if (mode === "init" && !out.flavor) {
    throw new Error(`missing <flavor> for agent init\n\n` + usage());
  }

  if (!out.path && mode !== "replay-all" && mode !== "check") {
    const expected =
      mode === "rerun"
        ? "<summary>"
        : mode === "commands" || mode === "inspect" || mode === "exec"
          ? "<artifact>"
          : "<file>";
    throw new Error(`missing ${expected} for agent ${mode}\n\n` + usage());
  }

  if (mode === "record" && !out.outPath) {
    throw new Error(`missing --out <file> for agent record\n\n` + usage());
  }

  if (mode === "exec" && !out.commandName) {
    throw new Error(`missing --command <name> for agent exec\n\n` + usage());
  }
}
