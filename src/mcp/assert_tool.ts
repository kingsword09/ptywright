import { z } from "zod";

import type { AssertionToolRegistration } from "./assertion_tool_context";
import { toolError } from "./tool_result";

export function registerAssertTool(args: AssertionToolRegistration): void {
  const { tool, recordings, requireSession } = args;

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
    async (toolArgs, extra) => {
      const required = requireSession(toolArgs, extra);
      if (!required.ok) return required.error;
      const { sessionId, session } = required;

      if (!toolArgs.text && !toolArgs.regex && !toolArgs.useAI) {
        return toolError("must provide text, regex, or useAI: true");
      }

      const snapshot = await session.snapshotText({
        scope: toolArgs.scope ?? "visible",
        captureFrame: true,
      });

      let found = true;
      if (toolArgs.text || toolArgs.regex) {
        found = false;

        if (toolArgs.text && snapshot.text.includes(toolArgs.text)) {
          found = true;
        }

        if (toolArgs.regex) {
          let re: RegExp;
          try {
            re = new RegExp(toolArgs.regex);
          } catch {
            return toolError(`invalid regex: ${toolArgs.regex}`);
          }

          if (re.test(snapshot.text)) {
            found = true;
          }
        }
      }

      if (toolArgs.text || toolArgs.regex) {
        recordings.recordStep({
          type: "assert",
          scope: toolArgs.scope,
          text: toolArgs.text,
          regex: toolArgs.regex,
          description: toolArgs.description,
        });
      }

      if (toolArgs.useAI) {
        recordings.recordStep({
          type: "assertSemantic",
          prompt: toolArgs.description || "Check screen content",
          description: toolArgs.description,
        });
      }

      if (!found) {
        return toolError(`assertion failed: ${toolArgs.description || "pattern match"}`, {
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
}
