import { loadPtywrightConfig, type ResolvedPtywrightConfig } from "../config";
import { isAgentArtifactCommandMode, runAgentArtifactCommand } from "./agent_artifact_command";
import { parseAgentArgs, shouldLoadAgentConfig, type AgentCliArgs } from "./agent_args";
import { runAgentExecutionCommand } from "./agent_execution_command";

function resolveAgentHeadless(
  args: Pick<AgentCliArgs, "headed">,
  config?: ResolvedPtywrightConfig,
): boolean {
  if (args.headed) return false;
  return config?.agent?.defaults?.headless ?? true;
}

export async function cmdAgent(argv: string[]): Promise<number> {
  const args = parseAgentArgs(argv);
  const config = shouldLoadAgentConfig(args.mode)
    ? await loadPtywrightConfig({ configPath: args.configPath })
    : undefined;
  const headless = resolveAgentHeadless(args, config);

  if (isAgentArtifactCommandMode(args.mode)) {
    return runAgentArtifactCommand(args, { dispatch: cmdAgent });
  }

  return runAgentExecutionCommand(args, { config, headless });
}
