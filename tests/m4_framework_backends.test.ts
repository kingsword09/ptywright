import { existsSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

import { expect, test } from "bun:test";

import { runScript } from "../src/script/runner";
import type { Script } from "../src/script/schema";

const COMMON_UI_STEPS = [
  { type: "waitForText", scope: "visible", text: "Screen: Dashboard", timeoutMs: 5_000 },
  { type: "pressKey", key: "Down" },
  { type: "waitForText", scope: "visible", text: "Screen: Permissions", timeoutMs: 5_000 },
  { type: "pressKey", key: "Enter" },
  { type: "waitForText", scope: "visible", regex: "mode=low|Mode: LOW", timeoutMs: 5_000 },
  { type: "snapshot", kind: "text", scope: "visible", trimBottom: true, saveAs: "final" },
  { type: "expect", from: "final", contains: ["Screen: Permissions"] },
  { type: "expect", from: "final", regex: "mode=low|Mode: LOW" },
  { type: "pressKey", key: "q" },
  { type: "waitForExit", timeoutMs: 5_000, exitCode: 0 },
] satisfies Script["steps"];

test("same UI script can run through PTY and ratatui frame backend", async () => {
  const root = resolve(".tmp/test_scripts/m4_framework_same_script");
  rmSync(root, { recursive: true, force: true });

  const pty = await runScript(
    {
      name: "m4_pty_ui",
      launch: {
        backend: "pty",
        command: "bun",
        args: ["run", "tests/fixtures/tui_demo.ts"],
        cwd: ".",
        cols: 70,
        rows: 18,
        name: "xterm-256color",
      },
      trace: { reportMaxFrames: 20 },
      steps: COMMON_UI_STEPS,
    },
    { artifactsDir: join(root, "pty") },
  );
  expect(pty.ok).toBe(true);

  const ratatui = await runScript(
    {
      name: "m4_ratatui_ui",
      launch: {
        backend: "ratatui",
        cols: 70,
        rows: 18,
        frames: [
          renderFrame("Dashboard", "HIGH"),
          renderFrame("Permissions", "HIGH"),
          renderFrame("Permissions", "LOW"),
        ],
      },
      trace: { reportMaxFrames: 20 },
      steps: COMMON_UI_STEPS,
    },
    { artifactsDir: join(root, "ratatui") },
  );
  expect(ratatui.ok).toBe(true);

  expect(readFileSync(join(root, "ratatui", "m4_ratatui_ui.cast"), "utf8")).toContain(
    "ratatui:frame",
  );
  expect(existsSync(join(root, "ratatui", "m4_ratatui_ui.report.html"))).toBe(true);
});

test("ink frameModule can assert a lastFrame without launching a PTY", async () => {
  const artifactsDir = resolve(".tmp/test_scripts/m4_ink_last_frame");
  rmSync(artifactsDir, { recursive: true, force: true });

  const result = await runScript(
    {
      name: "m4_ink_last_frame",
      launch: {
        backend: "ink",
        cwd: ".",
        cols: 60,
        rows: 8,
        frameModule: "tests/fixtures/ink_last_frame.ts",
      },
      steps: [
        { type: "snapshot", kind: "text", scope: "visible", saveAs: "lastFrame" },
        { type: "expect", from: "lastFrame", contains: ["Ink Counter", "Mode: LOW"] },
        {
          type: "expectGolden",
          from: "lastFrame",
          path: join(artifactsDir, "ink.lastFrame.snap.txt"),
        },
      ],
    },
    { artifactsDir, updateGoldens: true },
  );

  expect(result.ok).toBe(true);
  expect(readFileSync(join(artifactsDir, "ink.lastFrame.snap.txt"), "utf8")).toContain(
    "Ink Counter",
  );
});

test("ratatui framePath can assert a TestBackend style snapshot without launching a PTY", async () => {
  const artifactsDir = resolve(".tmp/test_scripts/m4_ratatui_frame_path");
  rmSync(artifactsDir, { recursive: true, force: true });

  const result = await runScript(
    {
      name: "m4_ratatui_frame_path",
      launch: {
        backend: "ratatui",
        cwd: ".",
        cols: 60,
        rows: 8,
        framePath: "tests/fixtures/ratatui_test_backend.snap.txt",
      },
      steps: [
        { type: "waitForText", text: "Screen: Permissions" },
        { type: "snapshot", kind: "text", scope: "visible", saveAs: "ratatui" },
        { type: "expect", from: "ratatui", contains: ["Mode: LOW", "mode=low"] },
      ],
    },
    { artifactsDir },
  );

  expect(result.ok).toBe(true);
  expect(readFileSync(join(artifactsDir, "m4_ratatui_frame_path.cast"), "utf8")).toContain(
    "ratatui:frame",
  );
});

function renderFrame(screen: string, mode: "HIGH" | "LOW"): string {
  return [
    "PTYWRIGHT TUI DEMO",
    "",
    "Menu",
    screen === "Dashboard" ? "> Dashboard" : "  Dashboard",
    screen === "Permissions" ? "> Permissions" : "  Permissions",
    "  Logs",
    "",
    "Details",
    `Screen: ${screen}`,
    `Mode: ${mode}`,
    "",
    `status: ok selected=${screen.toLowerCase()} mode=${mode.toLowerCase()}`,
  ].join("\n");
}
