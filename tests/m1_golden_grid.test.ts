import { test } from "bun:test";

import { SessionManager } from "../src/session/session_manager";
import { assertGoldenJson } from "./golden";

test("snapshot_grid (with styles) matches golden for ansi_color_demo", async () => {
  const sessions = new SessionManager({ snapshotRingSize: 10 });

  try {
    const session = sessions.launchSession({
      command: process.execPath,
      args: ["tests/fixtures/ansi_color_demo.ts"],
      cols: 40,
      rows: 8,
      name: "xterm-256color",
    });

    await session.waitForText({
      scope: "visible",
      text: "DONE",
      timeoutMs: 5_000,
      intervalMs: 50,
    });

    const { grid } = await session.snapshotGrid({
      trimRight: true,
      includeStyles: true,
      captureFrame: false,
    });

    assertGoldenJson("tests/golden/ansi_color_demo.grid.json", grid);
  } finally {
    sessions.closeAll();
  }
});
