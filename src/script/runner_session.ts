import { resolve } from "node:path";

import { SessionManager } from "../session/session_manager";
import { createFrameSessionFromLaunch } from "./frame_session";
import type { ScriptSession } from "./frame_session_types";
import type { Script } from "./schema";

export type LaunchedScriptSession = {
  session: ScriptSession;
  closeSession(): void;
};

export async function launchScriptSession(args: {
  launch: Script["launch"];
  scriptName: string;
}): Promise<LaunchedScriptSession> {
  const { launch, scriptName } = args;
  // Resolve relative paths from the runner's working directory (not the script file).
  const cwd = launch.cwd ? resolve(process.cwd(), launch.cwd) : process.cwd();
  const backend = launch.backend ?? "pty";

  if (backend === "pty") {
    const sessions = new SessionManager({ snapshotRingSize: 50 });
    if (!launch.command) {
      throw new Error("launch.command is required when backend=pty");
    }

    const session = sessions.launchSession({
      command: launch.command,
      args: launch.args ?? [],
      cwd,
      env: launch.env,
      cols: launch.cols,
      rows: launch.rows,
      name: launch.name,
    });

    return {
      session,
      closeSession: () => sessions.closeAll(),
    };
  }

  const session = await createFrameSessionFromLaunch({
    launch,
    cwd,
    title: scriptName,
  });

  return {
    session,
    closeSession: () => session.close(),
  };
}
