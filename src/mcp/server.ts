import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { SessionManager } from "../session/session_manager";
import { formatSnapshotView } from "../terminal/view";
import { runScenarioPath } from "../scenario/path";
import { runAllScripts } from "../scenario/run_all";
import { ScriptRecordingManager } from "./script_recording";

export type PtywrightCapability = "core" | "debug" | "script" | "recording" | "all";

export type PtywrightServerOptions = {
  sessionManager?: SessionManager;
  capabilities?: PtywrightCapability[];
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

  const caps = resolveCapabilities(options?.capabilities, process.env.PTYWRIGHT_CAPS);

  function isEnabled(category: Exclude<PtywrightCapability, "all">): boolean {
    return caps.all || caps.enabled.has(category);
  }

  function tool<Shape extends z.ZodRawShape>(
    category: Exclude<PtywrightCapability, "all">,
    name: string,
    description: string,
    schema: Shape,
    annotations: ToolAnnotations | undefined,
    handler: (args: z.infer<z.ZodObject<Shape>>) => unknown,
  ): void {
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
  }

  tool(
    "core",
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
    {
      title: "Launch Session",
      openWorldHint: true,
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

  tool(
    "core",
    "send_text",
    "Send text input to a session (optionally press Enter).",
    {
      sessionId: z.string().min(1),
      text: z.string(),
      enter: z.boolean().optional(),
    },
    { title: "Send Text" },
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

  tool(
    "core",
    "press_key",
    "Send a key or key chord to a session (e.g. Enter, Ctrl+C, Shift+Tab).",
    {
      sessionId: z.string().min(1),
      key: z.string().min(1),
    },
    { title: "Press Key" },
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

  tool(
    "core",
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
    { title: "Send Mouse Event" },
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

  tool(
    "core",
    "resize",
    "Resize the session terminal (cols/rows).",
    {
      sessionId: z.string().min(1),
      cols: z.number().int(),
      rows: z.number().int(),
    },
    { title: "Resize Terminal" },
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

  tool(
    "core",
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
    {
      title: "Snapshot Text",
      readOnlyHint: true,
      idempotentHint: true,
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
          trimRight: args.trimRight ?? true,
          trimBottom: args.trimBottom ?? true,
          maxLines: args.maxLines,
          tailLines: args.tailLines,
          mask: args.mask,
        }));
      } catch (error) {
        return toolError((error as Error).message);
      }
      return {
        content: [{ type: "text", text }],
        structuredContent: { sessionId: args.sessionId, hash },
      };
    },
  );

  tool(
    "debug",
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
    {
      title: "Snapshot ANSI",
      readOnlyHint: true,
      idempotentHint: true,
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
          trimRight: args.trimRight ?? true,
          trimBottom: args.trimBottom ?? true,
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

  tool(
    "debug",
    "snapshot_grid",
    "Capture a structured grid snapshot (rows/cols/cursor/lines).",
    {
      sessionId: z.string().min(1),
      trimRight: z.boolean().optional(),
      includeStyles: z.boolean().optional(),
    },
    {
      title: "Snapshot Grid",
      readOnlyHint: true,
      idempotentHint: true,
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

  tool(
    "debug",
    "snapshot_cast",
    "Export the asciicast v2 trace (useful for debugging/report playback).",
    {
      sessionId: z.string().min(1),
      tailEvents: z.number().int().positive().optional(),
    },
    {
      title: "Snapshot Asciicast",
      readOnlyHint: true,
      idempotentHint: true,
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

  tool(
    "recording",
    "mark",
    "Add a marker to the session trace (used for recording/checkpoints).",
    {
      sessionId: z.string().min(1),
      label: z.string().optional(),
    },
    { title: "Mark Trace" },
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

  tool(
    "core",
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
    {
      title: "Wait For Text",
      readOnlyHint: true,
      idempotentHint: true,
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

  tool(
    "core",
    "wait_for_stable_screen",
    "Wait until consecutive text snapshots remain unchanged for a quiet window (reduce flakiness).",
    {
      sessionId: z.string().min(1),
      timeoutMs: z.number().int().optional(),
      quietMs: z.number().int().optional(),
      intervalMs: z.number().int().optional(),
      includeText: z.boolean().optional(),
    },
    {
      title: "Wait For Stable Screen",
      readOnlyHint: true,
      idempotentHint: true,
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

  tool(
    "core",
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
    {
      title: "Snapshot View",
      readOnlyHint: true,
      idempotentHint: true,
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

  tool(
    "debug",
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
    {
      title: "Snapshot View (ANSI)",
      readOnlyHint: true,
      idempotentHint: true,
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

  tool(
    "script",
    "run_script",
    "Run a JSON/TS script via the runner and return artifact paths (prefer this for regression runs).",
    {
      scriptPath: z.string().min(1),
      artifactsDir: z.string().optional(),
      stepsPath: z.string().optional(),
      updateGoldens: z.boolean().optional(),
    },
    {
      title: "Run Script",
      openWorldHint: true,
      destructiveHint: true,
    },
    async (args) => {
      const result = await runScenarioPath(args.scriptPath, {
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

  tool(
    "script",
    "run_all_scripts",
    "Run all JSON/TS scripts in a directory (recursive) and return a summary + artifact paths.",
    {
      dir: z.string().optional(),
      artifactsRoot: z.string().optional(),
      stepsPath: z.string().optional(),
      updateGoldens: z.boolean().optional(),
    },
    {
      title: "Run All Scripts",
      openWorldHint: true,
      destructiveHint: true,
    },
    async (args) => {
      try {
        const result = await runAllScripts({
          dir: args.dir,
          artifactsRoot: args.artifactsRoot,
          stepsPath: args.stepsPath,
          updateGoldens: args.updateGoldens,
        });

        const failures = result.entries.filter((e) => !e.result.ok);
        const summaryLines = [
          result.ok ? "ok" : "failed",
          `count=${result.entries.length}`,
          `failures=${failures.length}`,
          `dir=${result.dir}`,
        ];

        if (failures.length > 0) {
          for (const f of failures) {
            if (f.result.ok) continue;
            summaryLines.push(`- ${f.filePath}: ${f.result.error}`);
          }
        }

        return {
          content: [{ type: "text", text: summaryLines.join("\n") }],
          structuredContent: result,
        };
      } catch (error) {
        return toolError((error as Error).message);
      }
    },
  );

  tool(
    "recording",
    "start_script_recording",
    "Start recording MCP tool calls into a replayable script (with optional golden checkpoints via mark()).",
    {
      name: z.string().min(1),
      outPath: z.string().optional(),
      goldenDir: z.string().optional(),
      overwrite: z.boolean().optional(),
      mask: z.array(textMaskRuleSchema).optional(),
    },
    {
      title: "Start Script Recording",
      openWorldHint: true,
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

  tool(
    "recording",
    "stop_script_recording",
    "Stop recording and optionally write the script + goldens to disk.",
    {
      recordingId: z.string().min(1),
      writeFiles: z.boolean().optional(),
    },
    {
      title: "Stop Script Recording",
      destructiveHint: true,
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

  tool(
    "core",
    "close_session",
    "Close a running session.",
    {
      sessionId: z.string().min(1),
    },
    {
      title: "Close Session",
      destructiveHint: true,
    },
    async (args) => {
      const ok = sessions.closeSession(args.sessionId);
      if (!ok) {
        return toolError(`session not found: ${args.sessionId}`);
      }
      return { content: [{ type: "text", text: "closed" }] };
    },
  );

  tool(
    "core",
    "list_sessions",
    "List active session IDs.",
    {},
    {
      title: "List Sessions",
      readOnlyHint: true,
      idempotentHint: true,
    },
    async (_args) => {
      const sessionIds = sessions.listSessionIds();
      return {
        content: [{ type: "text", text: sessionIds.join("\n") }],
        structuredContent: { sessionIds },
      };
    },
  );

  return { server, sessions };
}

function resolveCapabilities(
  capabilities: PtywrightCapability[] | undefined,
  envValue: string | undefined,
): { all: boolean; enabled: Set<Exclude<PtywrightCapability, "all">> } {
  const requested = capabilities?.length ? capabilities : parseCapabilitiesEnv(envValue);
  const normalized = new Set<Exclude<PtywrightCapability, "all">>();
  let all = false;

  for (const cap of requested) {
    if (cap === "all") {
      all = true;
      continue;
    }
    normalized.add(cap);
  }

  if (!all && normalized.size === 0) {
    normalized.add("core");
  }

  return { all, enabled: normalized };
}

function parseCapabilitiesEnv(envValue: string | undefined): PtywrightCapability[] {
  if (!envValue?.trim()) return [];
  const parts = envValue
    .split(/[,\s]+/g)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const out: PtywrightCapability[] = [];

  for (const p of parts) {
    if (p === "all") out.push("all");
    else if (p === "core") out.push("core");
    else if (p === "debug") out.push("debug");
    else if (p === "script" || p === "scripts" || p === "runner" || p === "run") out.push("script");
    else if (p === "recording" || p === "record" || p === "rec") out.push("recording");
    else throw new Error(`unknown PTYWRIGHT_CAPS capability: ${p}`);
  }

  return out;
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
