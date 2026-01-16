import { expect, test } from "bun:test";

import { SessionManager } from "../src/session/session_manager";

test("sendMouse emits SGR mouse sequences", async () => {
  const sessions = new SessionManager({ snapshotRingSize: 10 });

  const session = sessions.launchSession({
    command: process.execPath,
    args: ["tests/fixtures/mouse_input_demo.ts"],
    cols: 40,
    rows: 8,
  });

  const ready = await session.waitForText({
    text: "READY",
    timeoutMs: 5_000,
    intervalMs: 50,
  });
  expect(ready.found).toBe(true);

  session.sendMouse({ action: "click", x: 10, y: 5, button: "left" });

  const done = await session.waitForText({
    scope: "buffer",
    text: "DONE",
    timeoutMs: 5_000,
    intervalMs: 50,
  });
  expect(done.found).toBe(true);

  const snap = await session.snapshotText({ scope: "buffer", trimRight: true, trimBottom: true });
  expect(snap.text).toContain('DATA "\\u001b[<0;10;5M\\u001b[<0;10;5m"');

  sessions.closeAll();
});
