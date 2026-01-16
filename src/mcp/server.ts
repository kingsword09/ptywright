import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { SessionManager } from "../session/session_manager";
import { formatSnapshotView } from "../terminal/view";

export type TerminalDriverServerOptions = {
  sessionManager?: SessionManager;
};

export function createTerminalDriverServer(options?: TerminalDriverServerOptions): {
  server: McpServer;
  sessions: SessionManager;
} {
  const sessions = options?.sessionManager ?? new SessionManager();

  const server = new McpServer({
    name: "terminal-driver-mcp",
    version: "0.1.0",
  });

  server.tool(
    "launch_session",
    {
      command: z.string().min(1),
      args: z.array(z.string()).optional(),
      cwd: z.string().optional(),
      env: z.record(z.string()).optional(),
      cols: z.number().int().optional(),
      rows: z.number().int().optional(),
      name: z.string().optional(),
    },
    async (args) => {
      const session = sessions.launchSession(args);
      return {
        content: [{ type: "text", text: `launched ${session.id}` }],
        structuredContent: {
          sessionId: session.id,
        },
      };
    },
  );

  server.tool(
    "send_text",
    {
      sessionId: z.string().min(1),
      text: z.string(),
      enter: z.boolean().optional(),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }
      session.sendText(args.text, { enter: args.enter });
      return { content: [{ type: "text", text: "ok" }] };
    },
  );

  server.tool(
    "press_key",
    {
      sessionId: z.string().min(1),
      key: z.string().min(1),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }
      try {
        session.pressKey(args.key);
        return { content: [{ type: "text", text: "ok" }] };
      } catch (error) {
        return toolError((error as Error).message);
      }
    },
  );

  server.tool(
    "resize",
    {
      sessionId: z.string().min(1),
      cols: z.number().int(),
      rows: z.number().int(),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }
      session.resize(args.cols, args.rows);
      return { content: [{ type: "text", text: "ok" }] };
    },
  );

  server.tool(
    "snapshot_text",
    {
      sessionId: z.string().min(1),
      scope: z.enum(["visible", "buffer"]).optional(),
      trimRight: z.boolean().optional(),
      trimBottom: z.boolean().optional(),
      maxLines: z.number().int().positive().optional(),
      tailLines: z.number().int().positive().optional(),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }
      if (args.maxLines !== undefined && args.tailLines !== undefined) {
        return toolError("snapshot_text: maxLines and tailLines are mutually exclusive");
      }
      const { text, hash } = await session.snapshotText({
        scope: args.scope,
        trimRight: args.trimRight,
        trimBottom: args.trimBottom,
        maxLines: args.maxLines,
        tailLines: args.tailLines,
      });
      return {
        content: [{ type: "text", text }],
        structuredContent: { sessionId: args.sessionId, hash, text },
      };
    },
  );

  server.tool(
    "snapshot_ansi",
    {
      sessionId: z.string().min(1),
      scope: z.enum(["visible", "buffer"]).optional(),
      trimRight: z.boolean().optional(),
      trimBottom: z.boolean().optional(),
      maxLines: z.number().int().positive().optional(),
      tailLines: z.number().int().positive().optional(),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }
      if (args.maxLines !== undefined && args.tailLines !== undefined) {
        return toolError("snapshot_ansi: maxLines and tailLines are mutually exclusive");
      }

      const { ansi, plain, hash } = await session.snapshotAnsi({
        scope: args.scope,
        trimRight: args.trimRight,
        trimBottom: args.trimBottom,
        maxLines: args.maxLines,
        tailLines: args.tailLines,
      });

      return {
        content: [{ type: "text", text: ansi }],
        structuredContent: { sessionId: args.sessionId, hash, plain },
      };
    },
  );

  server.tool(
    "snapshot_grid",
    {
      sessionId: z.string().min(1),
      trimRight: z.boolean().optional(),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }
      const { grid, hash } = await session.snapshotGrid({ trimRight: args.trimRight });
      return {
        content: [{ type: "text", text: grid.lines.join("\n") }],
        structuredContent: { sessionId: args.sessionId, hash, grid },
      };
    },
  );

  server.tool(
    "wait_for_text",
    {
      sessionId: z.string().min(1),
      scope: z.enum(["visible", "buffer"]).optional(),
      text: z.string().optional(),
      regex: z.string().optional(),
      timeoutMs: z.number().int().optional(),
      intervalMs: z.number().int().optional(),
      includeText: z.boolean().optional(),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }

      if (!args.text && !args.regex) {
        return toolError("either text or regex must be provided");
      }

      const regex = args.regex ? new RegExp(args.regex) : undefined;
      const result = await session.waitForText({
        scope: args.scope,
        text: args.text,
        regex,
        timeoutMs: args.timeoutMs ?? 10_000,
        intervalMs: args.intervalMs ?? 100,
      });

      const structuredContent: Record<string, unknown> = {
        sessionId: args.sessionId,
        found: result.found,
        hash: result.hash,
      };
      if (args.includeText ?? false) {
        structuredContent.text = result.text;
      }

      return {
        content: [{ type: "text", text: result.found ? "found" : "not_found" }],
        structuredContent,
      };
    },
  );

  server.tool(
    "wait_for_stable_screen",
    {
      sessionId: z.string().min(1),
      timeoutMs: z.number().int().optional(),
      quietMs: z.number().int().optional(),
      intervalMs: z.number().int().optional(),
      includeText: z.boolean().optional(),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }

      const result = await session.waitForStableScreen({
        timeoutMs: args.timeoutMs ?? 10_000,
        quietMs: args.quietMs ?? 400,
        intervalMs: args.intervalMs ?? 80,
      });

      const structuredContent: Record<string, unknown> = {
        sessionId: args.sessionId,
        stable: result.stable,
        hash: result.hash,
      };
      if (args.includeText ?? false) {
        structuredContent.text = result.text;
      }

      return {
        content: [{ type: "text", text: result.stable ? "stable" : "unstable" }],
        structuredContent,
      };
    },
  );

  server.tool(
    "snapshot_view",
    {
      sessionId: z.string().min(1),
      scope: z.enum(["visible", "buffer"]).optional(),
      trimRight: z.boolean().optional(),
      trimBottom: z.boolean().optional(),
      maxLines: z.number().int().positive().optional(),
      tailLines: z.number().int().positive().optional(),
      lineNumbers: z.boolean().optional(),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }
      if (args.maxLines !== undefined && args.tailLines !== undefined) {
        return toolError("snapshot_view: maxLines and tailLines are mutually exclusive");
      }

      const { text, hash } = await session.snapshotText({
        scope: args.scope,
        trimRight: args.trimRight,
        trimBottom: args.trimBottom ?? true,
        maxLines: args.maxLines,
        tailLines: args.tailLines,
      });

      const view = formatSnapshotView({
        sessionId: args.sessionId,
        scope: args.scope ?? "visible",
        hash,
        lines: text.split("\n"),
        meta: session.getMeta(),
        lineNumbers: args.lineNumbers,
      });

      return {
        content: [{ type: "text", text: view }],
        structuredContent: { sessionId: args.sessionId, hash },
      };
    },
  );

  server.tool(
    "snapshot_view_ansi",
    {
      sessionId: z.string().min(1),
      scope: z.enum(["visible", "buffer"]).optional(),
      trimRight: z.boolean().optional(),
      trimBottom: z.boolean().optional(),
      maxLines: z.number().int().positive().optional(),
      tailLines: z.number().int().positive().optional(),
      lineNumbers: z.boolean().optional(),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }
      if (args.maxLines !== undefined && args.tailLines !== undefined) {
        return toolError("snapshot_view_ansi: maxLines and tailLines are mutually exclusive");
      }

      const { ansi, hash } = await session.snapshotAnsi({
        scope: args.scope,
        trimRight: args.trimRight,
        trimBottom: args.trimBottom ?? true,
        maxLines: args.maxLines,
        tailLines: args.tailLines,
      });

      const view = formatSnapshotView({
        sessionId: args.sessionId,
        scope: args.scope ?? "visible",
        hash,
        lines: ansi.split("\n"),
        meta: session.getMeta(),
        lineNumbers: args.lineNumbers,
      });

      return {
        content: [{ type: "text", text: view }],
        structuredContent: { sessionId: args.sessionId, hash },
      };
    },
  );

  server.tool(
    "close_session",
    {
      sessionId: z.string().min(1),
    },
    async (args) => {
      const ok = sessions.closeSession(args.sessionId);
      if (!ok) {
        return toolError(`session not found: ${args.sessionId}`);
      }
      return { content: [{ type: "text", text: "closed" }] };
    },
  );

  server.tool("list_sessions", {}, async () => {
    const sessionIds = sessions.listSessionIds();
    return {
      content: [{ type: "text", text: sessionIds.join("\n") }],
      structuredContent: { sessionIds },
    };
  });

  return { server, sessions };
}

function toolError(message: string): {
  isError: true;
  content: { type: "text"; text: string }[];
  structuredContent: { error: string };
} {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: { error: message },
  };
}
