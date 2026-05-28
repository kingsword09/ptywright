import { z } from "zod";

import type { ScriptRecordingManager } from "./script_recording";
import { textMaskRuleSchema } from "./tool_schemas";
import { toolError } from "./tool_result";
import type { RegisterPtywrightTool, RequireSession } from "./tool_context";

export function registerRecordingTools(args: {
  tool: RegisterPtywrightTool;
  recordings: ScriptRecordingManager;
  requireSession: RequireSession;
}): void {
  const { tool, recordings, requireSession } = args;

  tool(
    "recording",
    "mark",
    "Add a marker to the session trace (used for recording/checkpoints).",
    {
      sessionId: z.string().min(1).optional(),
      label: z.string().optional(),
    },
    { title: "Mark Trace" },
    async (toolArgs, extra) => {
      const required = requireSession(toolArgs, extra);
      if (!required.ok) return required.error;
      const { session } = required;

      session.mark(toolArgs.label);
      recordings.recordStep({ type: "mark", label: toolArgs.label });
      await recordings.recordCheckpoint({ session, label: toolArgs.label });
      return { content: [{ type: "text", text: "ok" }] };
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
    async (toolArgs) => {
      try {
        const status = recordings.start({
          name: toolArgs.name,
          outPath: toolArgs.outPath,
          goldenDir: toolArgs.goldenDir,
          overwrite: toolArgs.overwrite,
          checkpoint: {
            scope: toolArgs.scope ?? "visible",
            trimRight: toolArgs.trimRight ?? true,
            trimBottom: toolArgs.trimBottom ?? true,
            mask: toolArgs.mask,
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
    async (toolArgs) => {
      try {
        const result = recordings.stop({
          recordingId: toolArgs.recordingId,
          writeFiles: toolArgs.writeFiles,
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
}
