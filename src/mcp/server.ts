import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { SessionManager } from "../session/session_manager";
import { formatSnapshotView } from "../terminal/view";
import { runScenarioPath } from "../scenario/path";
import { ScriptRecordingManager } from "./script_recording";

export type PtywrightServerOptions = {
  sessionManager?: SessionManager;
};

const textMaskRuleSchema = z.object({
  regex: z.string().min(1),
  flags: z.string().optional(),
  replacement: z.string().optional(),
  preserveLength: z.boolean().optional(),
});

export function createPtywrightServer(options?: PtywrightServerOptions): {
  server: McpServer;
  sessions: SessionManager;
} {
  const sessions = options?.sessionManager ?? new SessionManager();
  const recordings = new ScriptRecordingManager();

  const server = new McpServer({
    name: "ptywright",
    version: "0.1.0",
  });

  server.tool(
    "launch_session",
    "Launch a new PTY session running a command (returns sessionId).",
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
      recordings.recordLaunch(
        {
          command: args.command,
          args: args.args,
          cwd: args.cwd,
          env: args.env,
          cols: args.cols,
          rows: args.rows,
          name: args.name,
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

  server.tool(
    "send_text",
    "Send text input to a session (optionally press Enter).",
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
      recordings.recordStep({ type: "sendText", text: args.text, enter: args.enter });
      return { content: [{ type: "text", text: "ok" }] };
    },
  );

  server.tool(
    "press_key",
    "Send a key or key chord to a session (e.g. Enter, Ctrl+C, Shift+Tab).",
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
        recordings.recordStep({ type: "pressKey", key: args.key });
        return { content: [{ type: "text", text: "ok" }] };
      } catch (error) {
        return toolError((error as Error).message);
      }
    },
  );

  server.tool(
    "send_mouse",
    "Send an SGR mouse event (click/move/scroll) to a session.",
    {
      sessionId: z.string().min(1),
      action: z.enum(["down", "up", "move", "click", "scroll_up", "scroll_down"]),
      x: z.number().int(),
      y: z.number().int(),
      button: z.enum(["left", "middle", "right"]).optional(),
      shift: z.boolean().optional(),
      alt: z.boolean().optional(),
      ctrl: z.boolean().optional(),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }

      const modifiers =
        args.shift || args.alt || args.ctrl
          ? { shift: args.shift, alt: args.alt, ctrl: args.ctrl }
          : undefined;

      session.sendMouse({
        action: args.action,
        x: args.x,
        y: args.y,
        button: args.button,
        modifiers,
      });

      recordings.recordStep({
        type: "sendMouse",
        action: args.action,
        x: args.x,
        y: args.y,
        button: args.button,
        shift: args.shift,
        alt: args.alt,
        ctrl: args.ctrl,
      });

      return { content: [{ type: "text", text: "ok" }] };
    },
  );

  server.tool(
    "resize",
    "Resize the session terminal (cols/rows).",
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
      recordings.recordStep({ type: "resize", cols: args.cols, rows: args.rows });
      return { content: [{ type: "text", text: "ok" }] };
    },
  );

  server.tool(
    "snapshot_text",
    "Capture plain text from the visible screen or full buffer (best for stable assertions/goldens).",
    {
      sessionId: z.string().min(1),
      scope: z.enum(["visible", "buffer"]).optional(),
      trimRight: z.boolean().optional(),
      trimBottom: z.boolean().optional(),
      maxLines: z.number().int().positive().optional(),
      tailLines: z.number().int().positive().optional(),
      mask: z.array(textMaskRuleSchema).optional(),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }
      if (args.maxLines !== undefined && args.tailLines !== undefined) {
        return toolError("snapshot_text: maxLines and tailLines are mutually exclusive");
      }
      let text: string;
      let hash: string;
      try {
        ({ text, hash } = await session.snapshotText({
          scope: args.scope,
          trimRight: args.trimRight,
          trimBottom: args.trimBottom,
          maxLines: args.maxLines,
          tailLines: args.tailLines,
          mask: args.mask,
        }));
      } catch (error) {
        return toolError((error as Error).message);
      }
      return {
        content: [{ type: "text", text }],
        structuredContent: { sessionId: args.sessionId, hash, text },
      };
    },
  );

  server.tool(
    "snapshot_ansi",
    "Capture ANSI-rendered snapshot (debug/human inspection; less stable than plain text).",
    {
      sessionId: z.string().min(1),
      scope: z.enum(["visible", "buffer"]).optional(),
      trimRight: z.boolean().optional(),
      trimBottom: z.boolean().optional(),
      maxLines: z.number().int().positive().optional(),
      tailLines: z.number().int().positive().optional(),
      mask: z.array(textMaskRuleSchema).optional(),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }
      if (args.maxLines !== undefined && args.tailLines !== undefined) {
        return toolError("snapshot_ansi: maxLines and tailLines are mutually exclusive");
      }

      let ansi: string;
      let plain: string;
      let hash: string;
      try {
        ({ ansi, plain, hash } = await session.snapshotAnsi({
          scope: args.scope,
          trimRight: args.trimRight,
          trimBottom: args.trimBottom,
          maxLines: args.maxLines,
          tailLines: args.tailLines,
          mask: args.mask,
        }));
      } catch (error) {
        return toolError((error as Error).message);
      }

      return {
        content: [{ type: "text", text: ansi }],
        structuredContent: { sessionId: args.sessionId, hash, plain },
      };
    },
  );

  server.tool(
    "snapshot_grid",
    "Capture a structured grid snapshot (rows/cols/cursor/lines).",
    {
      sessionId: z.string().min(1),
      trimRight: z.boolean().optional(),
      includeStyles: z.boolean().optional(),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }
      const { grid, hash } = await session.snapshotGrid({
        trimRight: args.trimRight,
        includeStyles: args.includeStyles,
      });
      return {
        content: [{ type: "text", text: grid.lines.join("\n") }],
        structuredContent: { sessionId: args.sessionId, hash, grid },
      };
    },
  );

  server.tool(
    "snapshot_cast",
    "Export the asciicast v2 trace (useful for debugging/report playback).",
    {
      sessionId: z.string().min(1),
      tailEvents: z.number().int().positive().optional(),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }

      const snapshot = await session.snapshotCast({
        tailEvents: args.tailEvents,
      });

      return {
        content: [{ type: "text", text: snapshot.cast }],
        structuredContent: {
          sessionId: args.sessionId,
          eventCount: snapshot.events.length,
          droppedEvents: snapshot.droppedEvents,
          droppedDataChars: snapshot.droppedDataChars,
          closeReason: session.getCloseReason(),
        },
      };
    },
  );

  server.tool(
    "mark",
    "Add a marker to the session trace (used for recording/checkpoints).",
    {
      sessionId: z.string().min(1),
      label: z.string().optional(),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }

      session.mark(args.label);
      recordings.recordStep({ type: "mark", label: args.label });
      await recordings.recordCheckpoint({ session, label: args.label });
      return { content: [{ type: "text", text: "ok" }] };
    },
  );

  server.tool(
    "wait_for_text",
    "Wait until a text/regex appears in the session (polling).",
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
      recordings.recordStep({
        type: "waitForText",
        scope: args.scope,
        text: args.text,
        regex: args.regex,
        timeoutMs: args.timeoutMs,
        intervalMs: args.intervalMs,
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
    "Wait until consecutive text snapshots remain unchanged for a quiet window (reduce flakiness).",
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
      recordings.recordStep({
        type: "waitForStableScreen",
        timeoutMs: args.timeoutMs,
        quietMs: args.quietMs,
        intervalMs: args.intervalMs,
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
    "Capture a formatted, human-readable snapshot view (includes meta + optional line numbers).",
    {
      sessionId: z.string().min(1),
      scope: z.enum(["visible", "buffer"]).optional(),
      trimRight: z.boolean().optional(),
      trimBottom: z.boolean().optional(),
      maxLines: z.number().int().positive().optional(),
      tailLines: z.number().int().positive().optional(),
      lineNumbers: z.boolean().optional(),
      mask: z.array(textMaskRuleSchema).optional(),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }
      if (args.maxLines !== undefined && args.tailLines !== undefined) {
        return toolError("snapshot_view: maxLines and tailLines are mutually exclusive");
      }

      let text: string;
      let hash: string;
      try {
        ({ text, hash } = await session.snapshotText({
          scope: args.scope,
          trimRight: args.trimRight,
          trimBottom: args.trimBottom ?? true,
          maxLines: args.maxLines,
          tailLines: args.tailLines,
          mask: args.mask,
        }));
      } catch (error) {
        return toolError((error as Error).message);
      }

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
    "Capture a formatted ANSI snapshot view (includes meta + optional line numbers).",
    {
      sessionId: z.string().min(1),
      scope: z.enum(["visible", "buffer"]).optional(),
      trimRight: z.boolean().optional(),
      trimBottom: z.boolean().optional(),
      maxLines: z.number().int().positive().optional(),
      tailLines: z.number().int().positive().optional(),
      lineNumbers: z.boolean().optional(),
      mask: z.array(textMaskRuleSchema).optional(),
    },
    async (args) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }
      if (args.maxLines !== undefined && args.tailLines !== undefined) {
        return toolError("snapshot_view_ansi: maxLines and tailLines are mutually exclusive");
      }

      let ansi: string;
      let hash: string;
      try {
        ({ ansi, hash } = await session.snapshotAnsi({
          scope: args.scope,
          trimRight: args.trimRight,
          trimBottom: args.trimBottom ?? true,
          maxLines: args.maxLines,
          tailLines: args.tailLines,
          mask: args.mask,
        }));
      } catch (error) {
        return toolError((error as Error).message);
      }

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

  function registerRunScriptTool(name: "run_scenario" | "run_script"): void {
    server.tool(
      name,
      "Run a JSON/TS script via the runner and return artifact paths (prefer this for regression runs).",
      {
        scenarioPath: z.string().min(1),
        artifactsDir: z.string().optional(),
        stepsPath: z.string().optional(),
        updateGoldens: z.boolean().optional(),
      },
      async (args) => {
        const result = await runScenarioPath(args.scenarioPath, {
          artifactsDir: args.artifactsDir,
          stepsPath: args.stepsPath,
          updateGoldens: args.updateGoldens,
        });

        if (!result.ok) {
          return toolError(result.error, {
            scenarioName: result.scenarioName,
            artifactsDir: result.artifactsDir,
            castPath: result.castPath,
            reportPath: result.reportPath,
            failureArtifacts: result.failureArtifacts,
          });
        }

        return {
          content: [{ type: "text", text: `ok artifacts=${result.artifactsDir}` }],
          structuredContent: result,
        };
      },
    );
  }

  registerRunScriptTool("run_scenario");
  registerRunScriptTool("run_script");

  server.tool(
    "start_script_recording",
    "Start recording MCP tool calls into a replayable script (with optional golden checkpoints via mark()).",
    {
      name: z.string().min(1),
      outPath: z.string().optional(),
      goldenDir: z.string().optional(),
      overwrite: z.boolean().optional(),
      mask: z.array(textMaskRuleSchema).optional(),
    },
    async (args) => {
      try {
        const status = recordings.start({
          name: args.name,
          outPath: args.outPath,
          goldenDir: args.goldenDir,
          overwrite: args.overwrite,
          checkpoint: {
            scope: "visible",
            trimRight: true,
            trimBottom: true,
            mask: args.mask,
          },
        });
        return {
          content: [{ type: "text", text: `recording ${status.recordingId}` }],
          structuredContent: status,
        };
      } catch (error) {
        return toolError((error as Error).message);
      }
    },
  );

  server.tool(
    "stop_script_recording",
    "Stop recording and optionally write the script + goldens to disk.",
    {
      recordingId: z.string().min(1),
      writeFiles: z.boolean().optional(),
    },
    async (args) => {
      try {
        const result = recordings.stop({
          recordingId: args.recordingId,
          writeFiles: args.writeFiles,
        });
        return {
          content: [{ type: "text", text: `ok script=${result.scriptPath ?? ""}` }],
          structuredContent: {
            scriptPath: result.scriptPath,
            goldenPaths: result.goldenPaths,
          },
        };
      } catch (error) {
        return toolError((error as Error).message);
      }
    },
  );

  server.tool(
    "close_session",
    "Close a running session.",
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

  server.tool("list_sessions", "List active session IDs.", {}, async () => {
    const sessionIds = sessions.listSessionIds();
    return {
      content: [{ type: "text", text: sessionIds.join("\n") }],
      structuredContent: { sessionIds },
    };
  });

  return { server, sessions };
}

function toolError(
  message: string,
  extra: Record<string, unknown> = {},
): {
  isError: true;
  content: { type: "text"; text: string }[];
  structuredContent: Record<string, unknown> & { error: string };
} {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
    structuredContent: { error: message, ...extra },
  };
}
