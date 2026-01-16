import { expect, test } from "bun:test";

import { SessionManager } from "../src/session/session_manager";
import { generateTraceReportHtml } from "../src/trace/report";

test("trace report contains frames and final screen", async () => {
  const sessions = new SessionManager({ snapshotRingSize: 10 });

  const session = sessions.launchSession({
    command: process.execPath,
    args: ["tests/fixtures/trace_demo.ts"],
    cols: 40,
    rows: 8,
  });

  const wait = await session.waitForText({
    text: "DONE",
    timeoutMs: 5_000,
    intervalMs: 50,
  });
  expect(wait.found).toBe(true);

  session.mark("after_done");

  const cast = await session.snapshotCast();
  const html = await generateTraceReportHtml(cast.cast);

  expect(html).toContain("Raw header JSON");
  expect(html).toContain("mark after_done");
  expect(html).toContain("READY");
  expect(html).toContain("DONE");
  expect(html).toContain("final");

  sessions.closeAll();
});
