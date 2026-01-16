import { expect, test } from "bun:test";

import { SessionManager } from "../src/session/session_manager";

test("styled trailing spaces are preserved in snapshot_grid", async () => {
  const sessions = new SessionManager({ snapshotRingSize: 10 });

  try {
    const session = sessions.launchSession({
      command: process.execPath,
      args: ["tests/fixtures/ansi_color_demo.ts"],
      cols: 40,
      rows: 8,
    });

    const wait = await session.waitForText({
      scope: "visible",
      text: "DONE",
      timeoutMs: 5_000,
      intervalMs: 50,
    });
    expect(wait.found).toBe(true);

    const { grid } = await session.snapshotGrid({ trimRight: true, includeStyles: true });

    expect(grid.lines[2]).toBe("     ");

    const line2Runs = grid.styleRuns?.[1] ?? [];
    expect(line2Runs.length).toBe(1);
    expect(line2Runs[0].startCol).toBe(0);
    expect(line2Runs[0].endCol).toBe(3);
    expect(line2Runs[0].style.fg).toEqual({ mode: "palette", value: 1 });

    const line3Runs = grid.styleRuns?.[2] ?? [];
    expect(line3Runs.length).toBe(1);
    expect(line3Runs[0].startCol).toBe(0);
    expect(line3Runs[0].endCol).toBe(5);
    expect(line3Runs[0].style.bg).toEqual({ mode: "palette", value: 4 });
  } finally {
    sessions.closeAll();
  }
});

test("alternate screen buffer is detected", async () => {
  const sessions = new SessionManager({ snapshotRingSize: 10 });

  try {
    const session = sessions.launchSession({
      command: process.execPath,
      args: ["tests/fixtures/alt_screen_demo.ts"],
      cols: 40,
      rows: 8,
    });

    const wait = await session.waitForText({
      scope: "visible",
      text: "DONE",
      timeoutMs: 5_000,
      intervalMs: 50,
    });
    expect(wait.found).toBe(true);

    const { grid } = await session.snapshotGrid({ trimRight: true });
    expect(grid.bufferType).toBe("alternate");
    expect(grid.lines.join("\n")).toContain("ALT SCREEN");
  } finally {
    sessions.closeAll();
  }
});

test("buffer scope includes scrollback", async () => {
  const sessions = new SessionManager({ snapshotRingSize: 10 });

  try {
    const session = sessions.launchSession({
      command: process.execPath,
      args: ["tests/fixtures/scrollback_demo.ts"],
      cols: 40,
      rows: 8,
    });

    const wait = await session.waitForText({
      scope: "visible",
      text: "DONE",
      timeoutMs: 5_000,
      intervalMs: 50,
    });
    expect(wait.found).toBe(true);

    const bufferSnap = await session.snapshotText({
      scope: "buffer",
      trimRight: true,
      maxLines: 5,
      captureFrame: false,
    });
    expect(bufferSnap.text).toContain("L001");

    const { grid } = await session.snapshotGrid({ trimRight: true, captureFrame: false });
    expect(grid.lines.join("\n")).toContain("DONE");
  } finally {
    sessions.closeAll();
  }
});

test("unicode output is stable in snapshots", async () => {
  const sessions = new SessionManager({ snapshotRingSize: 10 });

  try {
    const session = sessions.launchSession({
      command: process.execPath,
      args: ["tests/fixtures/unicode_demo.ts"],
      cols: 40,
      rows: 8,
    });

    const wait = await session.waitForText({
      scope: "visible",
      text: "DONE",
      timeoutMs: 5_000,
      intervalMs: 50,
    });
    expect(wait.found).toBe(true);

    const snap = await session.snapshotText({ trimRight: true, captureFrame: false });
    expect(snap.text).toContain("combining: Á");
  } finally {
    sessions.closeAll();
  }
});

test("DSR cursor position query receives a response", async () => {
  const sessions = new SessionManager({ snapshotRingSize: 10 });

  try {
    const session = sessions.launchSession({
      command: process.execPath,
      args: ["tests/fixtures/dsr_demo.ts"],
      cols: 40,
      rows: 8,
    });

    const wait = await session.waitForText({
      scope: "visible",
      text: "RESP:",
      timeoutMs: 5_000,
      intervalMs: 50,
    });

    expect(wait.found).toBe(true);

    const snap = await session.snapshotText({ trimRight: true, captureFrame: false });
    expect(snap.text).toContain("RESP:");
    expect(snap.text).toContain("DONE");
  } finally {
    sessions.closeAll();
  }
});

test("resize updates terminal dimensions", async () => {
  const sessions = new SessionManager({ snapshotRingSize: 10 });

  try {
    const session = sessions.launchSession({
      command: process.execPath,
      args: ["tests/fixtures/ansi_demo.ts"],
      cols: 40,
      rows: 8,
    });

    session.resize(60, 10);

    const wait = await session.waitForText({
      scope: "visible",
      text: "DONE",
      timeoutMs: 5_000,
      intervalMs: 50,
    });
    expect(wait.found).toBe(true);

    const { grid } = await session.snapshotGrid({ trimRight: true, captureFrame: false });
    expect(grid.cols).toBe(60);
    expect(grid.rows).toBe(10);
    expect(grid.lines.join("\n")).toContain("DONE");
  } finally {
    sessions.closeAll();
  }
});
