import type { RegisterPtywrightTool, RequireSession } from "./tool_context";
import {
  captureSnapshotAnsi,
  captureSnapshotText,
  formatSnapshotToolView,
  validateLineLimitArgs,
} from "./snapshot_tool_helpers";
import { snapshotArgsShape, snapshotViewArgsShape } from "./snapshot_tool_schemas";

export function registerSnapshotTools(args: {
  tool: RegisterPtywrightTool;
  requireSession: RequireSession;
}): void {
  const { tool, requireSession } = args;

  tool(
    "core",
    "snapshot_text",
    "Capture plain text from the visible screen or full buffer (best for stable assertions/goldens).",
    snapshotArgsShape,
    {
      title: "Snapshot Text",
      readOnlyHint: true,
      idempotentHint: true,
    },
    async (toolArgs, extra) => {
      const required = requireSession(toolArgs, extra);
      if (!required.ok) return required.error;
      const { sessionId, session } = required;

      const lineLimitError = validateLineLimitArgs("snapshot_text", toolArgs);
      if (lineLimitError) return lineLimitError;

      const snapshot = await captureSnapshotText(session, toolArgs, {
        trimRight: true,
        trimBottom: true,
      });
      if (!snapshot.ok) return snapshot.error;

      return {
        content: [{ type: "text", text: snapshot.text }],
        structuredContent: { sessionId, hash: snapshot.hash },
      };
    },
  );

  tool(
    "debug",
    "snapshot_ansi",
    "Capture ANSI-rendered snapshot (debug/human inspection; less stable than plain text).",
    snapshotArgsShape,
    {
      title: "Snapshot ANSI",
      readOnlyHint: true,
      idempotentHint: true,
    },
    async (toolArgs, extra) => {
      const required = requireSession(toolArgs, extra);
      if (!required.ok) return required.error;
      const { sessionId, session } = required;

      const lineLimitError = validateLineLimitArgs("snapshot_ansi", toolArgs);
      if (lineLimitError) return lineLimitError;

      const snapshot = await captureSnapshotAnsi(session, toolArgs, {
        trimRight: true,
        trimBottom: true,
      });
      if (!snapshot.ok) return snapshot.error;

      return {
        content: [{ type: "text", text: snapshot.ansi }],
        structuredContent: { sessionId, hash: snapshot.hash, plain: snapshot.plain },
      };
    },
  );

  tool(
    "core",
    "snapshot_view",
    "Capture a formatted, human-readable snapshot view (includes meta + optional line numbers).",
    snapshotViewArgsShape,
    {
      title: "Snapshot View",
      readOnlyHint: true,
      idempotentHint: true,
    },
    async (toolArgs, extra) => {
      const required = requireSession(toolArgs, extra);
      if (!required.ok) return required.error;
      const { sessionId, session } = required;

      const lineLimitError = validateLineLimitArgs("snapshot_view", toolArgs);
      if (lineLimitError) return lineLimitError;

      const snapshot = await captureSnapshotText(session, toolArgs, {
        trimBottom: true,
      });
      if (!snapshot.ok) return snapshot.error;

      const view = formatSnapshotToolView({
        sessionId,
        session,
        scope: toolArgs.scope,
        hash: snapshot.hash,
        text: snapshot.text,
        lineNumbers: toolArgs.lineNumbers,
      });

      return {
        content: [{ type: "text", text: view }],
        structuredContent: { sessionId, hash: snapshot.hash },
      };
    },
  );

  tool(
    "debug",
    "snapshot_view_ansi",
    "Capture a formatted ANSI snapshot view (includes meta + optional line numbers).",
    snapshotViewArgsShape,
    {
      title: "Snapshot View (ANSI)",
      readOnlyHint: true,
      idempotentHint: true,
    },
    async (toolArgs, extra) => {
      const required = requireSession(toolArgs, extra);
      if (!required.ok) return required.error;
      const { sessionId, session } = required;

      const lineLimitError = validateLineLimitArgs("snapshot_view_ansi", toolArgs);
      if (lineLimitError) return lineLimitError;

      const snapshot = await captureSnapshotAnsi(session, toolArgs, {
        trimBottom: true,
      });
      if (!snapshot.ok) return snapshot.error;

      const view = formatSnapshotToolView({
        sessionId,
        session,
        scope: toolArgs.scope,
        hash: snapshot.hash,
        text: snapshot.ansi,
        lineNumbers: toolArgs.lineNumbers,
      });

      return {
        content: [{ type: "text", text: view }],
        structuredContent: { sessionId, hash: snapshot.hash },
      };
    },
  );
}
