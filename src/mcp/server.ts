import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { SessionManager } from "../session/session_manager";
import { formatSnapshotView } from "../terminal/view";
import { runScriptPath } from "../script/path";
import { runAllScripts } from "../script/run_all";
import { ensureAsciinemaPlayerAssets } from "../trace/asciinema_player_assets";
import { generateTraceReportHtml } from "../trace/report";
import { generateTestFromDoc } from "../generator/generate";
import { ScriptRecordingManager } from "./script_recording";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import pkg from "../../package.json";

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
    version: pkg.version,
  });

  const caps = resolveCapabilities(options?.capabilities, process.env.PTYWRIGHT_CAPS);

  type ToolExtra = { sessionId?: string };

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

  function tool<Shape extends z.ZodRawShape>(
    category: Exclude<PtywrightCapability, "all">,
    name: string,
    description: string,
    schema: Shape,
    annotations: ToolAnnotations | undefined,
    handler: (args: z.infer<z.ZodObject<Shape>>, extra: ToolExtra) => unknown,
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
    "select_session",
    "Select the default session for subsequent tool calls (so other tools can omit sessionId).",
    {
      sessionId: z.string().min(1),
    },
    { title: "Select Session" },
    async (args, extra) => {
      const session = sessions.getSession(args.sessionId);
      if (!session) {
        return toolError(`session not found: ${args.sessionId}`);
      }
      setSelectedSessionId(extra, args.sessionId);
      return {
        content: [{ type: "text", text: `selected ${args.sessionId}` }],
        structuredContent: { sessionId: args.sessionId },
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
    async (args, extra) => {
      const session = sessions.launchSession(args);
      setSelectedSessionId(extra, session.id);
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
      sessionId: z.string().min(1).optional(),
      text: z.string(),
      enter: z.boolean().optional(),
    },
    { title: "Send Text" },
    async (args, extra) => {
      const sessionId = args.sessionId ?? getSelectedSessionId(extra);
      if (!sessionId) {
        return toolError("sessionId is required (provide sessionId or call select_session)");
      }

      const session = sessions.getSession(sessionId);
      if (!session) {
        return toolError(`session not found: ${sessionId}`);
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
      sessionId: z.string().min(1).optional(),
      key: z.string().min(1),
    },
    { title: "Press Key" },
    async (args, extra) => {
      const sessionId = args.sessionId ?? getSelectedSessionId(extra);
      if (!sessionId) {
        return toolError("sessionId is required (provide sessionId or call select_session)");
      }

      const session = sessions.getSession(sessionId);
      if (!session) {
        return toolError(`session not found: ${sessionId}`);
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

  tool(
    "core",
    "snapshot_text",
    "Capture plain text from the visible screen or full buffer (best for stable assertions/goldens).",
    {
      sessionId: z.string().min(1).optional(),
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
    async (args, extra) => {
      const sessionId = args.sessionId ?? getSelectedSessionId(extra);
      if (!sessionId) {
        return toolError("sessionId is required (provide sessionId or call select_session)");
      }

      const session = sessions.getSession(sessionId);
      if (!session) {
        return toolError(`session not found: ${sessionId}`);
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
        structuredContent: { sessionId, hash },
      };
    },
  );

  tool(
    "debug",
    "snapshot_ansi",
    "Capture ANSI-rendered snapshot (debug/human inspection; less stable than plain text).",
    {
      sessionId: z.string().min(1).optional(),
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
    async (args, extra) => {
      const sessionId = args.sessionId ?? getSelectedSessionId(extra);
      if (!sessionId) {
        return toolError("sessionId is required (provide sessionId or call select_session)");
      }

      const session = sessions.getSession(sessionId);
      if (!session) {
        return toolError(`session not found: ${sessionId}`);
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
        structuredContent: { sessionId, hash, plain },
      };
    },
  );

  // Hidden low-level tool: snapshot_grid (use snapshot_view instead)
  // Hidden low-level tool: snapshot_cast (used internally for reports)

  tool(
    "recording",
    "mark",
    "Add a marker to the session trace (used for recording/checkpoints).",
    {
      sessionId: z.string().min(1).optional(),
      label: z.string().optional(),
    },
    { title: "Mark Trace" },
    async (args, extra) => {
      const sessionId = args.sessionId ?? getSelectedSessionId(extra);
      if (!sessionId) {
        return toolError("sessionId is required (provide sessionId or call select_session)");
      }

      const session = sessions.getSession(sessionId);
      if (!session) {
        return toolError(`session not found: ${sessionId}`);
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
      sessionId: z.string().min(1).optional(),
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
    async (args, extra) => {
      const sessionId = args.sessionId ?? getSelectedSessionId(extra);
      if (!sessionId) {
        return toolError("sessionId is required (provide sessionId or call select_session)");
      }

      const session = sessions.getSession(sessionId);
      if (!session) {
        return toolError(`session not found: ${sessionId}`);
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
        sessionId,
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
      sessionId: z.string().min(1).optional(),
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
    async (args, extra) => {
      const sessionId = args.sessionId ?? getSelectedSessionId(extra);
      if (!sessionId) {
        return toolError("sessionId is required (provide sessionId or call select_session)");
      }

      const session = sessions.getSession(sessionId);
      if (!session) {
        return toolError(`session not found: ${sessionId}`);
      }

      const result = await session.waitForStableScreen({
        timeoutMs: args.timeoutMs ?? 10_000,
        quietMs: args.quietMs ?? 400,
        intervalMs: args.intervalMs ?? 80,
      });
      recordings.recordStep({ type: "waitForStableScreen", ...args });

      const structuredContent: Record<string, unknown> = {
        sessionId,
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
    "assert",
    "Verify screen content. Use this to check if a test passed or failed (e.g., 'check if X is visible'). Supports exact text, regex, or semantic AI verification.",
    {
      sessionId: z.string().min(1).optional(),
      scope: z.enum(["visible", "buffer"]).optional(),
      description: z.string().optional(),
      text: z.string().optional(),
      regex: z.string().optional(),
      useAI: z.boolean().optional(),
    },
    {
      title: "Assert",
      readOnlyHint: true,
      idempotentHint: true,
    },
    async (args, extra) => {
      const sessionId = args.sessionId ?? getSelectedSessionId(extra);
      if (!sessionId) {
        return toolError("sessionId is required (provide sessionId or call select_session)");
      }

      const session = sessions.getSession(sessionId);
      if (!session) {
        return toolError(`session not found: ${sessionId}`);
      }

      if (!args.text && !args.regex && !args.useAI) {
        return toolError("must provide text, regex, or useAI: true");
      }

      const snapshot = await session.snapshotText({
        scope: args.scope ?? "visible",
        captureFrame: true,
      });

      // Pattern semantics match script runner: text OR regex.
      let found = true;
      if (args.text || args.regex) {
        found = false;

        if (args.text && snapshot.text.includes(args.text)) {
          found = true;
        }

        if (args.regex) {
          let re: RegExp;
          try {
            re = new RegExp(args.regex);
          } catch {
            return toolError(`invalid regex: ${args.regex}`);
          }

          if (re.test(snapshot.text)) {
            found = true;
          }
        }
      }

      // Record for the script: keep playback deterministic.
      if (args.text || args.regex) {
        recordings.recordStep({
          type: "assert",
          scope: args.scope,
          text: args.text,
          regex: args.regex,
          description: args.description,
        });
      }

      if (args.useAI) {
        recordings.recordStep({
          type: "assertSemantic",
          prompt: args.description || "Check screen content",
          description: args.description,
        });
      }

      if (!found) {
        return toolError(`assertion failed: ${args.description || "pattern match"}`, {
          sessionId,
          text: snapshot.text,
        });
      }

      return {
        content: [{ type: "text", text: "ok" }],
        structuredContent: { sessionId, found },
      };
    },
  );

  tool(
    "core",
    "snapshot_view",
    "Capture a formatted, human-readable snapshot view (includes meta + optional line numbers).",
    {
      sessionId: z.string().min(1).optional(),
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
    async (args, extra) => {
      const sessionId = args.sessionId ?? getSelectedSessionId(extra);
      if (!sessionId) {
        return toolError("sessionId is required (provide sessionId or call select_session)");
      }

      const session = sessions.getSession(sessionId);
      if (!session) {
        return toolError(`session not found: ${sessionId}`);
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
        sessionId,
        scope: args.scope ?? "visible",
        hash,
        lines: text.split("\n"),
        meta: session.getMeta(),
        lineNumbers: args.lineNumbers,
      });

      return {
        content: [{ type: "text", text: view }],
        structuredContent: { sessionId, hash },
      };
    },
  );

  tool(
    "debug",
    "snapshot_view_ansi",
    "Capture a formatted ANSI snapshot view (includes meta + optional line numbers).",
    {
      sessionId: z.string().min(1).optional(),
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
    async (args, extra) => {
      const sessionId = args.sessionId ?? getSelectedSessionId(extra);
      if (!sessionId) {
        return toolError("sessionId is required (provide sessionId or call select_session)");
      }

      const session = sessions.getSession(sessionId);
      if (!session) {
        return toolError(`session not found: ${sessionId}`);
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
        sessionId,
        scope: args.scope ?? "visible",
        hash,
        lines: ansi.split("\n"),
        meta: session.getMeta(),
        lineNumbers: args.lineNumbers,
      });

      return {
        content: [{ type: "text", text: view }],
        structuredContent: { sessionId, hash },
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
      const result = await runScriptPath(args.scriptPath, {
        artifactsDir: args.artifactsDir,
        stepsPath: args.stepsPath,
        updateGoldens: args.updateGoldens,
      });

      if (!result.ok) {
        return toolError(result.error, {
          scriptName: result.scriptName,
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
    "Run all ptywright scripts (JSON/TS) recursively and generate a Playwright-like suite report: index.html + run.summary.json. 用于：一键批量回归 / 生成总览报告 / CI。Call with no args to use defaults (dir='scripts', suite report in .tmp/run-all/). Returns reportPath+summaryPath; open reportPath in a browser to view. Tip: keep includeEntries='failures' (default) and maxEntries to avoid context bloat.",
    {
      dir: z.string().optional(),
      artifactsRoot: z.string().optional(),
      stepsPath: z.string().optional(),
      updateGoldens: z.boolean().optional(),
      includeEntries: z.enum(["none", "failures", "all"]).optional(),
      maxEntries: z.number().int().nonnegative().optional(),
    },
    {
      title: "Run All Scripts (Suite Report)",
      openWorldHint: true,
      destructiveHint: true,
    },
    async (args) => {
      try {
        const includeEntries = args.includeEntries ?? "failures";
        const maxEntries = args.maxEntries ?? 20;

        const result = await runAllScripts({
          dir: args.dir,
          artifactsRoot: args.artifactsRoot,
          stepsPath: args.stepsPath,
          updateGoldens: args.updateGoldens,
        });

        const failures = result.entries.filter((e) => !e.result.ok);
        let entries: typeof result.entries = [];
        if (includeEntries === "all") entries = result.entries;
        else if (includeEntries === "failures") entries = failures;

        let truncatedCount = 0;
        if (entries.length > maxEntries) {
          truncatedCount = entries.length - maxEntries;
          entries = entries.slice(0, maxEntries);
        }

        const summaryLines = [
          result.ok ? "ok" : "failed",
          `count=${result.entries.length}`,
          `failures=${failures.length}`,
          `dir=${result.dir}`,
          `entries=${entries.length}`,
          `report=${result.reportPath}`,
          `summary=${result.summaryPath}`,
          truncatedCount > 0 ? `truncated=${truncatedCount}` : null,
        ];

        if (entries.length > 0 && failures.length > 0) {
          for (const f of entries) {
            if (f.result.ok) continue;
            summaryLines.push(`- ${f.filePath}: ${f.result.error}`);
          }
        }

        return {
          content: [{ type: "text", text: summaryLines.filter(Boolean).join("\n") }],
          structuredContent: {
            ok: result.ok,
            dir: result.dir,
            suiteDir: result.suiteDir,
            reportPath: result.reportPath,
            summaryPath: result.summaryPath,
            totalCount: result.entries.length,
            failureCount: failures.length,
            includeEntries,
            maxEntries,
            truncatedCount,
            entries,
          },
        };
      } catch (error) {
        return toolError((error as Error).message);
      }
    },
  );

  tool(
    "script",
    "generate_test_from_doc",
    "Generate test script from documentation (local file or URL). Parses Markdown/HTML/JSON docs to extract test steps and generates executable ptywright scripts.",
    {
      source: z.string().min(1).describe("Document path (local file) or URL"),
      sourceType: z
        .enum(["local", "url", "auto"])
        .optional()
        .describe("Source type (auto-detected if not specified)"),
      outputDir: z.string().optional().describe("Output directory for generated scripts"),
      outputFormat: z
        .enum(["json", "ts", "both"])
        .optional()
        .describe("Output format (default: both)"),
      targetCommand: z
        .string()
        .optional()
        .describe("Command to test (overrides auto-detected command)"),
      targetArgs: z.array(z.string()).optional().describe("Arguments for target command"),
      name: z
        .string()
        .optional()
        .describe("Test name (auto-generated from doc title if not specified)"),
      cols: z.number().int().positive().optional().describe("Terminal columns (default: 80)"),
      rows: z.number().int().positive().optional().describe("Terminal rows (default: 24)"),
    },
    {
      title: "Generate Test from Documentation",
      openWorldHint: true,
      destructiveHint: true,
    },
    async (args) => {
      try {
        const result = await generateTestFromDoc({
          source: args.source,
          sourceType: args.sourceType,
          outputDir: args.outputDir,
          outputFormat: args.outputFormat,
          targetCommand: args.targetCommand,
          targetArgs: args.targetArgs,
          name: args.name,
          cols: args.cols,
          rows: args.rows,
        });

        if (!result.ok) {
          return toolError(result.error ?? "Failed to generate test", {
            warnings: result.warnings,
            parsed: result.parsed,
          });
        }

        const summaryLines = [
          `Generated test: ${result.name}`,
          `Steps: ${result.stepCount}`,
          result.jsonPath ? `JSON: ${result.jsonPath}` : null,
          result.tsPath ? `TypeScript: ${result.tsPath}` : null,
          result.warnings.length > 0 ? `Warnings: ${result.warnings.join("; ")}` : null,
        ].filter(Boolean);

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
      scope: z.enum(["visible", "buffer"]).optional(),
      trimRight: z.boolean().optional(),
      trimBottom: z.boolean().optional(),
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
            scope: args.scope ?? "visible",
            trimRight: args.trimRight ?? true,
            trimBottom: args.trimBottom ?? true,
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
      sessionId: z.string().min(1).optional(),
    },
    {
      title: "Close Session",
      destructiveHint: true,
    },
    async (args, extra) => {
      const sessionId = args.sessionId ?? getSelectedSessionId(extra);
      if (!sessionId) {
        return toolError("sessionId is required (provide sessionId or call select_session)");
      }

      const ok = sessions.closeSession(sessionId);
      if (!ok) {
        return toolError(`session not found: ${sessionId}`);
      }
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
    async (_args, _extra) => {
      const all = sessions.listSessions().map((s) => ({
        id: s.id,
        cols: s.cols,
        rows: s.rows,
        meta: s.getMeta(),
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(all, null, 2) }],
        structuredContent: { sessions: all },
      };
    },
  );

  // High-level tool: run_routine - batch execute steps with full snapshots
  const routineStepSchema = z.object({
    action: z.enum(["sendText", "pressKey", "wait", "assert", "snapshot"]),
    text: z.string().optional(),
    enter: z.boolean().optional(),
    key: z.string().optional(),
    waitFor: z.string().optional(),
    regex: z.string().optional(),
    timeoutMs: z.number().int().optional(),
    description: z.string().optional(),
  });

  tool(
    "script",
    "run_routine",
    "PRIMARY INTERACTION TOOL. Execute a multi-step test scenario (type, key, wait, assert) in one go. Use this whenever asked to 'test', 'verify', 'do', or 'check' a workflow. It handles delays and snapshots automatically.",
    {
      sessionId: z.string().min(1).optional(),
      steps: z.array(routineStepSchema).min(1),
      saveReport: z.boolean().optional(),
      reportPath: z.string().optional(),
    },
    {
      title: "Run Routine",
      openWorldHint: true,
    },
    async (args, extra) => {
      const sessionId = args.sessionId ?? getSelectedSessionId(extra);
      if (!sessionId) {
        return toolError("sessionId is required (provide sessionId or call select_session)");
      }

      const session = sessions.getSession(sessionId);
      if (!session) {
        return toolError(`session not found: ${sessionId}`);
      }

      type StepResult = {
        index: number;
        action: string;
        description?: string;
        ok: boolean;
        error?: string;
        snapshot?: string;
        hash?: string;
      };

      const results: StepResult[] = [];
      let failed = false;
      let failedStep: number | null = null;

      for (let i = 0; i < args.steps.length; i++) {
        const step = args.steps[i];
        if (!step) continue;

        const result: StepResult = {
          index: i + 1,
          action: step.action,
          description: step.description,
          ok: true,
        };

        try {
          if (step.action === "sendText" && step.text !== undefined) {
            session.sendText(step.text, { enter: step.enter });
          } else if (step.action === "pressKey" && step.key) {
            session.pressKey(step.key);
          } else if (step.action === "wait") {
            if (step.waitFor || step.regex) {
              const regex = step.regex ? new RegExp(step.regex) : undefined;
              const waitResult = await session.waitForText({
                text: step.waitFor,
                regex,
                timeoutMs: step.timeoutMs ?? 10_000,
                intervalMs: 100,
              });
              if (!waitResult.found) {
                throw new Error(`wait failed: ${step.waitFor || step.regex}`);
              }
            } else {
              await session.waitForStableScreen({
                timeoutMs: step.timeoutMs ?? 5_000,
                quietMs: 300,
                intervalMs: 80,
              });
            }
          } else if (step.action === "assert") {
            const regex = step.regex ? new RegExp(step.regex) : undefined;
            const assertResult = await session.waitForText({
              text: step.waitFor,
              regex,
              timeoutMs: 0,
              intervalMs: 0,
            });
            if (!assertResult.found) {
              throw new Error(`assert failed: ${step.description || step.waitFor || step.regex}`);
            }
          }

          // Always capture snapshot after each step
          const snapshot = await session.snapshotText({
            scope: "visible",
            trimRight: true,
            trimBottom: true,
            captureFrame: true,
          });
          result.snapshot = snapshot.text;
          result.hash = snapshot.hash;
        } catch (error) {
          result.ok = false;
          result.error = (error as Error).message;
          failed = true;
          failedStep = i + 1;

          // Capture snapshot on failure too
          try {
            const snapshot = await session.snapshotText({
              scope: "visible",
              trimRight: true,
              trimBottom: true,
              captureFrame: true,
            });
            result.snapshot = snapshot.text;
            result.hash = snapshot.hash;
          } catch {
            // ignore
          }
        }

        results.push(result);

        if (failed) break;
      }

      const summary = failed
        ? `failed at step ${failedStep}: ${results[results.length - 1]?.error}`
        : `ok, ${results.length} steps completed`;

      let reportPath = args.reportPath;
      // Default to saving report unless explicitly disabled (though schema only allows true/false/undefined)
      // Actually let's just default to true if undefined
      const saveReport = args.saveReport ?? true;

      if (saveReport) {
        try {
          // Generate an ad-hoc report using the captured steps and snapshots.
          // Use the session trace so Cast Playback is fully playable.
          const castSnapshot = await session.snapshotCast();

          const html = await generateTraceReportHtml(castSnapshot.cast, {
            scriptName: "routine",
            result: { ok: !failed, error: results[results.length - 1]?.error },
            steps: results.map((r) => ({
              index: r.index,
              step: { type: r.action, description: r.description },
              ok: r.ok,
              error: r.error,
              after: r.snapshot
                ? { text: r.snapshot, hash: r.hash ?? "", kind: "view" }
                : undefined,
            })),
          });

          if (!reportPath) {
            const tmpDir = join(tmpdir(), "ptywright-routines");
            mkdirSync(tmpDir, { recursive: true });
            reportPath = join(tmpDir, `routine-${sessionId}-${Date.now()}.html`);
          }

          writeFileSync(reportPath, html);
          ensureAsciinemaPlayerAssets(reportPath);
        } catch {
          // Don't fail the routine if reporting fails, but log it
          // In MCP we can append to the text content
          // summary += `\n(Report generation failed: ${(err as Error).message})`;
        }
      }

      const contentText = reportPath
        ? `${summary}

Report generated: ${reportPath}
Open in browser to view step-by-step timeline.`
        : summary;

      return {
        content: [{ type: "text", text: contentText }],
        structuredContent: {
          sessionId,
          ok: !failed,
          stepCount: results.length,
          failedStep,
          reportPath,
          results,
        },
      };
    },
  );

  tool(
    "core",
    "inspect_failure",
    "Inspect the last failure state of a session. Returns the last screen snapshot and any error information captured.",
    {
      sessionId: z.string().min(1).optional(),
      includeFrames: z.boolean().optional(),
      maxFrames: z.number().int().positive().optional(),
    },
    {
      title: "Inspect Failure",
      readOnlyHint: true,
      idempotentHint: true,
    },
    async (args, extra) => {
      const sessionId = args.sessionId ?? getSelectedSessionId(extra);
      if (!sessionId) {
        return toolError("sessionId is required (provide sessionId or call select_session)");
      }

      const session = sessions.getSession(sessionId);
      if (!session) {
        return toolError(`session not found: ${sessionId}`);
      }

      const closeReason = session.getCloseReason();
      const meta = session.getMeta();

      let currentSnapshot: { text: string; hash: string } | null = null;
      try {
        currentSnapshot = await session.snapshotText({
          scope: "visible",
          trimRight: true,
          trimBottom: true,
          captureFrame: true,
        });
      } catch {
        // Session may be closed
      }

      const frames = session.getSnapshotFrames();
      const includeFrames = args.includeFrames ?? false;
      const maxFrames = args.maxFrames ?? 5;

      const recentFrames = includeFrames ? frames.slice(-maxFrames) : [];

      const view = currentSnapshot
        ? formatSnapshotView({
            sessionId,
            scope: "visible",
            hash: currentSnapshot.hash,
            lines: currentSnapshot.text.split("\n"),
            meta,
            lineNumbers: true,
          })
        : "(no snapshot available)";

      return {
        content: [{ type: "text", text: view }],
        structuredContent: {
          sessionId,
          closeReason,
          meta,
          currentSnapshot: currentSnapshot
            ? { text: currentSnapshot.text, hash: currentSnapshot.hash }
            : null,
          recentFrames: recentFrames.map((f) => ({ atMs: f.atMs, hash: f.hash })),
          isClosed: session.isClosed(),
        },
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
    all = true;
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
