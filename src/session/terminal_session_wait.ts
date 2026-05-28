import { sleep } from "../util/sleep";
import type {
  SnapshotTextOptions,
  SnapshotTextResult,
  WaitForStableScreenArgs,
  WaitForStableScreenResult,
  WaitForTextArgs,
  WaitForTextResult,
} from "./terminal_session_types";

type WaitHost = {
  snapshotText(options?: SnapshotTextOptions): Promise<SnapshotTextResult>;
  isClosed(): boolean;
};

export async function waitForSessionText(
  host: WaitHost,
  args: WaitForTextArgs,
): Promise<WaitForTextResult> {
  const startedAt = Date.now();
  let closedSince: number | null = null;

  while (Date.now() - startedAt <= args.timeoutMs) {
    const snapshot = await host.snapshotText({ captureFrame: true, scope: args.scope });
    if (args.text && snapshot.text.includes(args.text)) {
      return { found: true, ...snapshot };
    }
    if (args.regex && args.regex.test(snapshot.text)) {
      return { found: true, ...snapshot };
    }

    if (host.isClosed()) {
      closedSince ??= Date.now();
      const drainMs = Math.max(500, args.intervalMs * 4);
      if (Date.now() - closedSince >= drainMs) {
        break;
      }
    }

    await sleep(args.intervalMs);
  }

  const snapshot = await host.snapshotText({ captureFrame: true, scope: args.scope });
  return { found: false, ...snapshot };
}

export async function waitForStableSessionScreen(
  host: Pick<WaitHost, "snapshotText">,
  args: WaitForStableScreenArgs,
): Promise<WaitForStableScreenResult> {
  const startedAt = Date.now();
  let stableSince: number | null = null;
  let lastHash: string | null = null;

  while (Date.now() - startedAt <= args.timeoutMs) {
    const snapshot = await host.snapshotText({ captureFrame: true });
    if (snapshot.hash === lastHash) {
      stableSince ??= Date.now();
    } else {
      stableSince = null;
      lastHash = snapshot.hash;
    }

    if (stableSince !== null && Date.now() - stableSince >= args.quietMs) {
      return { stable: true, ...snapshot };
    }

    await sleep(args.intervalMs);
  }

  const snapshot = await host.snapshotText({ captureFrame: true });
  return { stable: false, ...snapshot };
}
