import { expect, test } from "bun:test";

import { SessionManager } from "../src/session/session_manager";
import { generateTraceReportHtml } from "../src/trace/report";

test("trace report renders ANSI colors as HTML", async () => {
  const sessions = new SessionManager({ snapshotRingSize: 10 });

  const session = sessions.launchSession({
    command: process.execPath,
    args: ["tests/fixtures/ansi_color_demo.ts"],
    cols: 40,
    rows: 8,
    name: "xterm-256color",
  });

  const wait = await session.waitForText({
    scope: "visible",
    text: "DONE",
    timeoutMs: 5_000,
    intervalMs: 50,
  });
  expect(wait.found).toBe(true);

  const cast = await session.snapshotCast();
  const html = await generateTraceReportHtml(cast.cast);

  expect(html).toContain('<span class="seg"');
  expect(html).toContain("color:");
  expect(html).toContain("background-color:");

  sessions.closeAll();
});
