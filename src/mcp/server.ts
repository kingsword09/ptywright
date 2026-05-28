import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { SessionManager } from "../session/session_manager";
import { ScriptRecordingManager } from "./script_recording";
import pkg from "../../package.json";
import { registerAssertionTools } from "./assertion_tools";
import { resolveCapabilities, type PtywrightCapability } from "./capabilities";
import { registerInspectionTools } from "./inspection_tools";
import { registerRecordingTools } from "./recording_tools";
import { registerRoutineTools } from "./routine";
import { registerScriptTools } from "./script_tools";
import { registerSessionTools } from "./session_tools";
import { registerSnapshotTools } from "./snapshot_tools";
import type { RegisterPtywrightTool, RequireSession, ToolExtra } from "./tool_context";
import { toolError } from "./tool_result";

export type { PtywrightCapability } from "./capabilities";

export type PtywrightServerOptions = {
  sessionManager?: SessionManager;
  capabilities?: PtywrightCapability[];
};

export function createPtywrightServer(options?: PtywrightServerOptions): {
  server: McpServer;
  sessions: SessionManager;
} {
  const sessions = options?.sessionManager ?? new SessionManager();
  const recordings = new ScriptRecordingManager();

  const server = new McpServer({
    name: "ptywright",
    version: pkg.version,
  });

  const caps = resolveCapabilities(options?.capabilities, process.env.PTYWRIGHT_CAPS);

  const selectedSessionByTransport = new Map<string, string>();

  function transportKey(extra: ToolExtra): string {
    return extra.sessionId ?? "default";
  }

  function getSelectedSessionId(extra: ToolExtra): string | undefined {
    return selectedSessionByTransport.get(transportKey(extra));
  }

  function setSelectedSessionId(extra: ToolExtra, sessionId: string): void {
    selectedSessionByTransport.set(transportKey(extra), sessionId);
  }

  function clearSelectedSessionId(extra: ToolExtra): void {
    selectedSessionByTransport.delete(transportKey(extra));
  }

  function isEnabled(category: Exclude<PtywrightCapability, "all">): boolean {
    return caps.all || caps.enabled.has(category);
  }

  const tool: RegisterPtywrightTool = <Shape extends z.ZodRawShape>(
    category: Exclude<PtywrightCapability, "all">,
    name: string,
    description: string,
    schema: Shape,
    annotations: ToolAnnotations | undefined,
    handler: (args: z.infer<z.ZodObject<Shape>>, extra: ToolExtra) => unknown,
  ): void => {
    if (!isEnabled(category)) return;
    const { title, ...rest } = annotations ?? {};
    const cleanedAnnotations = Object.keys(rest).length ? (rest as ToolAnnotations) : undefined;

    server.registerTool(
      name,
      {
        title,
        description,
        inputSchema: schema,
        annotations: cleanedAnnotations,
        _meta: { category },
      },
      handler as any,
    );
  };

  const requireSession: RequireSession = (args, extra) => {
    const sessionId = args.sessionId ?? getSelectedSessionId(extra);
    if (!sessionId) {
      return {
        ok: false,
        error: toolError("sessionId is required (provide sessionId or call select_session)"),
      };
    }

    const session = sessions.getSession(sessionId);
    if (!session) {
      return { ok: false, error: toolError(`session not found: ${sessionId}`) };
    }

    return { ok: true, sessionId, session };
  };

  registerSessionTools({
    tool,
    sessions,
    recordings,
    requireSession,
    getSelectedSessionId,
    setSelectedSessionId,
    clearSelectedSessionId,
  });

  registerRecordingTools({
    tool,
    recordings,
    requireSession,
  });

  registerSnapshotTools({
    tool,
    requireSession,
  });

  registerScriptTools({ tool });

  registerAssertionTools({
    tool,
    recordings,
    requireSession,
  });

  registerInspectionTools({
    tool,
    requireSession,
  });

  registerRoutineTools({
    tool,
    requireSession,
  });

  // Hidden low-level tool: send_mouse
  /*
  tool(
    "core",
    "send_mouse",
    ...
  );
  */

  // Hidden low-level tool: resize
  /*
  tool(
    "core",
    "resize",
    ...
  );
  */

  // Hidden low-level tool: snapshot_grid (use snapshot_view instead)
  // Hidden low-level tool: snapshot_cast (used internally for reports)

  return { server, sessions };
}
