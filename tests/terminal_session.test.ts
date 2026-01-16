import { expect, test } from "bun:test";

import { SessionManager } from "../src/session/session_manager";

test("PTY + xterm snapshot_text is stable", async () => {
  const sessions = new SessionManager({ snapshotRingSize: 10 });

  const session = sessions.launchSession({
    command: process.execPath,
    args: ["tests/fixtures/ansi_demo.ts"],
    cols: 40,
    rows: 8,
  });

  const wait = await session.waitForText({
    text: "DONE",
    timeoutMs: 5_000,
    intervalMs: 50,
  });
  expect(wait.found).toBe(true);

  const stable = await session.waitForStableScreen({
    quietMs: 200,
    timeoutMs: 5_000,
    intervalMs: 50,
  });
  expect(stable.stable).toBe(true);

  const snap = await session.snapshotText({ trimRight: true });
  const lines = snap.text.split("\n");
  expect(lines[0]).toBe("Hello world");
  expect(lines[1]).toBe("Line2");
  expect(lines[2]).toBe("DONE");

  sessions.closeAll();
});

test("snapshot_grid returns structured rows/cols", async () => {
  const sessions = new SessionManager({ snapshotRingSize: 10 });

  const session = sessions.launchSession({
    command: process.execPath,
    args: ["tests/fixtures/ansi_demo.ts"],
    cols: 20,
    rows: 6,
  });

  const wait = await session.waitForText({
    text: "DONE",
    timeoutMs: 5_000,
    intervalMs: 50,
  });
  expect(wait.found).toBe(true);

  const { grid } = await session.snapshotGrid({ trimRight: true });
  expect(grid.cols).toBe(20);
  expect(grid.rows).toBe(6);
  expect(grid.lines[0]).toBe("Hello world");
  expect(grid.lines[1]).toBe("Line2");
  expect(grid.lines[2]).toBe("DONE");

  sessions.closeAll();
});
