import type { TerminalSession } from "../session/terminal_session";
import type { SnapshotScope } from "../terminal/snapshot";
import type { TextMaskRule } from "../terminal/mask";
import { formatSnapshotView } from "../terminal/view";
import { toolError, type ToolErrorResult } from "./tool_result";

type SnapshotArgs = {
  scope?: SnapshotScope;
  trimRight?: boolean;
  trimBottom?: boolean;
  maxLines?: number;
  tailLines?: number;
  mask?: TextMaskRule[];
};

type SnapshotDefaults = {
  trimRight?: boolean;
  trimBottom?: boolean;
};

export function validateLineLimitArgs(
  toolName: string,
  args: Pick<SnapshotArgs, "maxLines" | "tailLines">,
): ToolErrorResult | null {
  if (args.maxLines !== undefined && args.tailLines !== undefined) {
    return toolError(`${toolName}: maxLines and tailLines are mutually exclusive`);
  }
  return null;
}

export async function captureSnapshotText(
  session: TerminalSession,
  args: SnapshotArgs,
  defaults: SnapshotDefaults,
): Promise<{ ok: true; text: string; hash: string } | { ok: false; error: ToolErrorResult }> {
  try {
    const snapshot = await session.snapshotText({
      scope: args.scope,
      trimRight: args.trimRight ?? defaults.trimRight,
      trimBottom: args.trimBottom ?? defaults.trimBottom,
      maxLines: args.maxLines,
      tailLines: args.tailLines,
      mask: args.mask,
    });
    return { ok: true, text: snapshot.text, hash: snapshot.hash };
  } catch (error) {
    return { ok: false, error: toolError((error as Error).message) };
  }
}

export async function captureSnapshotAnsi(
  session: TerminalSession,
  args: SnapshotArgs,
  defaults: SnapshotDefaults,
): Promise<
  { ok: true; ansi: string; plain: string; hash: string } | { ok: false; error: ToolErrorResult }
> {
  try {
    const snapshot = await session.snapshotAnsi({
      scope: args.scope,
      trimRight: args.trimRight ?? defaults.trimRight,
      trimBottom: args.trimBottom ?? defaults.trimBottom,
      maxLines: args.maxLines,
      tailLines: args.tailLines,
      mask: args.mask,
    });
    return { ok: true, ansi: snapshot.ansi, plain: snapshot.plain, hash: snapshot.hash };
  } catch (error) {
    return { ok: false, error: toolError((error as Error).message) };
  }
}

export function formatSnapshotToolView(args: {
  sessionId: string;
  session: TerminalSession;
  scope?: SnapshotScope;
  hash: string;
  text: string;
  lineNumbers?: boolean;
}): string {
  return formatSnapshotView({
    sessionId: args.sessionId,
    scope: args.scope ?? "visible",
    hash: args.hash,
    lines: args.text.split("\n"),
    meta: args.session.getMeta(),
    lineNumbers: args.lineNumbers,
  });
}
