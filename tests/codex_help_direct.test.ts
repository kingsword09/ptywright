import { expect, test } from "bun:test";

import { SessionManager } from "../src/session/session_manager";

test("codex --help contains Usage: codex (direct driver)", async () => {
  const sessions = new SessionManager({ snapshotRingSize: 10 });

  const session = sessions.launchSession({
    command: "codex",
    args: ["--help"],
    cols: 120,
    rows: 300,
    name: "xterm-256color",
  });

  const wait = await session.waitForText({
    text: "Usage: codex",
    timeoutMs: 10_000,
    intervalMs: 50,
  });

  expect(wait.found).toBe(true);
  sessions.closeAll();
});
