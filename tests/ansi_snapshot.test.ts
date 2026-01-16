import { expect, test } from "bun:test";

import { SessionManager } from "../src/session/session_manager";

test("snapshot_ansi preserves styled spaces", async () => {
  const sessions = new SessionManager({ snapshotRingSize: 10 });

  const session = sessions.launchSession({
    command: process.execPath,
    args: ["tests/fixtures/ansi_color_demo.ts"],
    cols: 20,
    rows: 8,
  });

  const wait = await session.waitForText({
    text: "DONE",
    timeoutMs: 5_000,
    intervalMs: 50,
  });
  expect(wait.found).toBe(true);

  const snap = await session.snapshotAnsi({ trimRight: true, trimBottom: true });
  expect(snap.plain).toContain("Red Normal");
  expect(snap.ansi).toContain("\x1b[");

  expect(snap.lines[0]?.plain).toBe("Plain");
  expect(snap.lines[1]?.plain).toBe("Red Normal");
  expect(snap.lines[2]?.plain).toBe("     ");
  expect(snap.lines[2]?.hasStyle).toBe(true);
  expect(snap.lines[3]?.plain).toBe("DONE");

  sessions.closeAll();
});
