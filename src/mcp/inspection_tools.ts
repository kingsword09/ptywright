import { z } from "zod";

import { formatSnapshotView } from "../terminal/view";
import type { RegisterPtywrightTool, RequireSession } from "./tool_context";

export function registerInspectionTools(args: {
  tool: RegisterPtywrightTool;
  requireSession: RequireSession;
}): void {
  const { tool, requireSession } = args;

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
    async (toolArgs, extra) => {
      const required = requireSession(toolArgs, extra);
      if (!required.ok) return required.error;
      const { sessionId, session } = required;

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
        // Session may be closed.
      }

      const frames = session.getSnapshotFrames();
      const includeFrames = toolArgs.includeFrames ?? false;
      const maxFrames = toolArgs.maxFrames ?? 5;

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
          recentFrames: recentFrames.map((frame) => ({ atMs: frame.atMs, hash: frame.hash })),
          isClosed: session.isClosed(),
        },
      };
    },
  );
}
