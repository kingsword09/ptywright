import { expect, test } from "bun:test";

import { SessionManager } from "../src/session/session_manager";

function parseCast(cast: string): { header: unknown; events: unknown[] } {
  const lines = cast.trimEnd().split("\n");
  const header = JSON.parse(lines[0] ?? "{}");
  const events = lines.slice(1).map((l) => JSON.parse(l));
  return { header, events };
}

test("snapshot_cast records output/input/resize", async () => {
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

  session.sendText("hello", { enter: true });
  session.resize(42, 9);
  session.mark("after_resize");

  const snapshot = await session.snapshotCast();
  const { header, events } = parseCast(snapshot.cast);

  expect((header as { version?: unknown }).version).toBe(2);
  expect((header as { width?: unknown }).width).toBe(40);
  expect((header as { height?: unknown }).height).toBe(8);

  const output = events
    .filter(
      (e): e is [number, "o", string] =>
        Array.isArray(e) && e[1] === "o" && typeof e[2] === "string",
    )
    .map((e) => e[2])
    .join("");

  const inputs = events
    .filter(
      (e): e is [number, "i", string] =>
        Array.isArray(e) && e[1] === "i" && typeof e[2] === "string",
    )
    .map((e) => e[2])
    .join("");

  const resizes = events
    .filter(
      (e): e is [number, "r", string] =>
        Array.isArray(e) && e[1] === "r" && typeof e[2] === "string",
    )
    .map((e) => e[2]);

  const markers = events
    .filter(
      (e): e is [number, "m", string] =>
        Array.isArray(e) && e[1] === "m" && typeof e[2] === "string",
    )
    .map((e) => e[2]);

  expect(output).toContain("READY");
  expect(output).toContain("DONE");
  expect(inputs).toContain("hello");
  expect(resizes).toContain("42x9");
  expect(markers).toContain("after_resize");

  sessions.closeAll();
});
