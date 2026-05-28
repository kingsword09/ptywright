import { z } from "zod";

import type { AssertionToolRegistration } from "./assertion_tool_context";
import { toolError } from "./tool_result";

export function registerWaitAssertionTools(args: AssertionToolRegistration): void {
  const { tool, recordings, requireSession } = args;

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
    async (toolArgs, extra) => {
      const required = requireSession(toolArgs, extra);
      if (!required.ok) return required.error;
      const { sessionId, session } = required;

      if (!toolArgs.text && !toolArgs.regex) {
        return toolError("either text or regex must be provided");
      }

      const regex = toolArgs.regex ? new RegExp(toolArgs.regex) : undefined;
      const result = await session.waitForText({
        scope: toolArgs.scope,
        text: toolArgs.text,
        regex,
        timeoutMs: toolArgs.timeoutMs ?? 10_000,
        intervalMs: toolArgs.intervalMs ?? 100,
      });
      recordings.recordStep({
        type: "waitForText",
        scope: toolArgs.scope,
        text: toolArgs.text,
        regex: toolArgs.regex,
        timeoutMs: toolArgs.timeoutMs,
        intervalMs: toolArgs.intervalMs,
      });

      const structuredContent: Record<string, unknown> = {
        sessionId,
        found: result.found,
        hash: result.hash,
      };
      if (toolArgs.includeText ?? false) {
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
    async (toolArgs, extra) => {
      const required = requireSession(toolArgs, extra);
      if (!required.ok) return required.error;
      const { sessionId, session } = required;

      const result = await session.waitForStableScreen({
        timeoutMs: toolArgs.timeoutMs ?? 10_000,
        quietMs: toolArgs.quietMs ?? 400,
        intervalMs: toolArgs.intervalMs ?? 80,
      });
      recordings.recordStep({ type: "waitForStableScreen", ...toolArgs });

      const structuredContent: Record<string, unknown> = {
        sessionId,
        stable: result.stable,
        hash: result.hash,
      };
      if (toolArgs.includeText ?? false) {
        structuredContent.text = result.text;
      }

      return {
        content: [{ type: "text", text: result.stable ? "stable" : "unstable" }],
        structuredContent,
      };
    },
  );
}
