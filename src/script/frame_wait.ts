import type { SnapshotScope } from "../terminal/snapshot";
import { sleep } from "../util/sleep";
import type { SnapshotTextOptions } from "./frame_session_types";

type SnapshotTextResult = {
  text: string;
  hash: string;
};

type SnapshotTextReader = (options?: SnapshotTextOptions) => Promise<SnapshotTextResult>;

export type WaitForFrameTextArgs = {
  scope?: SnapshotScope;
  text?: string;
  regex?: RegExp;
  timeoutMs: number;
  intervalMs: number;
};

export async function waitForFrameText(
  snapshotText: SnapshotTextReader,
  args: WaitForFrameTextArgs,
): Promise<{ found: boolean; text: string; hash: string }> {
  const startedAt = Date.now();

  while (true) {
    const snapshot = await snapshotText({ scope: args.scope, captureFrame: true });
    if (args.text && snapshot.text.includes(args.text)) {
      return { found: true, ...snapshot };
    }
    if (args.regex && args.regex.test(snapshot.text)) {
      return { found: true, ...snapshot };
    }
    if (Date.now() - startedAt >= args.timeoutMs) {
      return { found: false, ...snapshot };
    }
    await sleep(Math.max(1, args.intervalMs));
  }
}

export async function waitForFrameStableScreen(
  snapshotText: SnapshotTextReader,
): Promise<{ stable: boolean; text: string; hash: string }> {
  const snapshot = await snapshotText({ captureFrame: true });
  return { stable: true, ...snapshot };
}
