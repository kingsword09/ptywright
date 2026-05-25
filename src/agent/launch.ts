import {
  buildCommandLaunchCommand,
  formatBrowserLaunchCommand,
  launchBrowserSessionFromCommand,
  type AgentBrowserSession,
  type BrowserLaunchCommand,
} from "./command_launch";
import { resolveAgentLaunchMode, type AgentLaunch } from "./schema";

export type AgentLaunchTarget =
  | {
      mode: "url";
      url: string;
      session: null;
    }
  | {
      mode: "command";
      url: string;
      session: AgentBrowserSession;
    };

export function buildAgentLaunchCommand(
  launch: AgentLaunch,
  options: {
    env?: NodeJS.ProcessEnv;
    rootDir?: string;
  } = {},
): BrowserLaunchCommand | null {
  const mode = resolveAgentLaunchMode(launch);
  if (mode === "url") return null;
  return buildCommandLaunchCommand(launch, options);
}

export async function resolveAgentLaunchTarget(
  launch: AgentLaunch,
  options: {
    env?: NodeJS.ProcessEnv;
    rootDir?: string;
  } = {},
): Promise<AgentLaunchTarget> {
  const mode = resolveAgentLaunchMode(launch);
  if (mode === "url") {
    return {
      mode,
      url: launch.url!,
      session: null,
    };
  }

  const session = await launchBrowserSessionFromCommand(buildCommandLaunchCommand(launch, options));
  return {
    mode,
    url: session.url,
    session,
  };
}

export function formatAgentLaunchCommand(launch: AgentLaunch): string {
  const command = buildAgentLaunchCommand(launch);
  return command ? formatBrowserLaunchCommand(command) : "launch.mode=url";
}
