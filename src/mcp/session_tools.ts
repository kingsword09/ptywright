import { z } from "zod";

import type { SessionManager } from "../session/session_manager";
import type { ScriptRecordingManager } from "./script_recording";
import { toolError } from "./tool_result";
import type { RegisterPtywrightTool, RequireSession, ToolExtra } from "./tool_context";

export function registerSessionTools(args: {
  tool: RegisterPtywrightTool;
  sessions: SessionManager;
  recordings: ScriptRecordingManager;
  requireSession: RequireSession;
  getSelectedSessionId(extra: ToolExtra): string | undefined;
  setSelectedSessionId(extra: ToolExtra, sessionId: string): void;
  clearSelectedSessionId(extra: ToolExtra): void;
}): void {
  const {
    tool,
    sessions,
    recordings,
    requireSession,
    getSelectedSessionId,
    setSelectedSessionId,
    clearSelectedSessionId,
  } = args;

  tool(
    "core",
    "select_session",
    "Select the default session for subsequent tool calls (so other tools can omit sessionId).",
    {
      sessionId: z.string().min(1),
    },
    { title: "Select Session" },
    async (toolArgs, extra) => {
      const session = sessions.getSession(toolArgs.sessionId);
      if (!session) {
        return toolError(`session not found: ${toolArgs.sessionId}`);
      }
      setSelectedSessionId(extra, toolArgs.sessionId);
      return {
        content: [{ type: "text", text: `selected ${toolArgs.sessionId}` }],
        structuredContent: { sessionId: toolArgs.sessionId },
      };
    },
  );

  tool(
    "core",
    "launch_session",
    "Start here! Launch a CLI/TUI command to begin testing (e.g., 'vim', 'top', 'npm start'). Returns a sessionId required for other tools.",
    {
      command: z.string().min(1),
      args: z.array(z.string()).optional(),
      cwd: z.string().optional(),
      env: z.record(z.string()).optional(),
      cols: z.number().int().optional(),
      rows: z.number().int().optional(),
      name: z.string().optional(),
    },
    {
      title: "Launch Session",
      openWorldHint: true,
    },
    async (toolArgs, extra) => {
      const session = sessions.launchSession(toolArgs);
      setSelectedSessionId(extra, session.id);
      recordings.recordLaunch(
        {
          command: toolArgs.command,
          args: toolArgs.args,
          cwd: toolArgs.cwd,
          env: toolArgs.env,
          cols: toolArgs.cols,
          rows: toolArgs.rows,
          name: toolArgs.name,
        },
        session.id,
      );
      return {
        content: [{ type: "text", text: `launched ${session.id}` }],
        structuredContent: {
          sessionId: session.id,
        },
      };
    },
  );

  tool(
    "core",
    "send_text",
    "Send text input to a session (optionally press Enter).",
    {
      sessionId: z.string().min(1).optional(),
      text: z.string(),
      enter: z.boolean().optional(),
    },
    { title: "Send Text" },
    async (toolArgs, extra) => {
      const required = requireSession(toolArgs, extra);
      if (!required.ok) return required.error;
      const { session } = required;

      session.sendText(toolArgs.text, { enter: toolArgs.enter });
      recordings.recordStep({ type: "sendText", text: toolArgs.text, enter: toolArgs.enter });
      return { content: [{ type: "text", text: "ok" }] };
    },
  );

  tool(
    "core",
    "press_key",
    "Send a key or key chord to a session (e.g. Enter, Ctrl+C, Shift+Tab).",
    {
      sessionId: z.string().min(1).optional(),
      key: z.string().min(1),
    },
    { title: "Press Key" },
    async (toolArgs, extra) => {
      const required = requireSession(toolArgs, extra);
      if (!required.ok) return required.error;
      const { session } = required;

      try {
        session.pressKey(toolArgs.key);
        recordings.recordStep({ type: "pressKey", key: toolArgs.key });
        return { content: [{ type: "text", text: "ok" }] };
      } catch (error) {
        return toolError((error as Error).message);
      }
    },
  );

  tool(
    "core",
    "close_session",
    "Close a running session.",
    {
      sessionId: z.string().min(1).optional(),
    },
    {
      title: "Close Session",
      destructiveHint: true,
    },
    async (toolArgs, extra) => {
      const required = requireSession(toolArgs, extra);
      if (!required.ok) return required.error;
      const { sessionId } = required;

      sessions.closeSession(sessionId);
      if (getSelectedSessionId(extra) === sessionId) {
        clearSelectedSessionId(extra);
      }
      return { content: [{ type: "text", text: "closed" }] };
    },
  );

  tool(
    "core",
    "list_sessions",
    "List all active sessions.",
    {},
    { title: "List Sessions" },
    async () => {
      const all = sessions.listSessions().map((session) => ({
        id: session.id,
        cols: session.cols,
        rows: session.rows,
        meta: session.getMeta(),
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(all, null, 2) }],
        structuredContent: { sessions: all },
      };
    },
  );
}
