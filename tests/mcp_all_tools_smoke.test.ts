import { expect, test } from "bun:test";

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function firstTextContent(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const content = (result as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";

  const first = content[0] as { type?: unknown; text?: unknown } | undefined;
  if (!first || typeof first !== "object") return "";
  if (first.type !== "text") return "";
  return typeof first.text === "string" ? first.text : "";
}

test("MCP tools full smoke (core+debug+script+recording)", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ["src/index.ts"],
    cwd: process.cwd(),
    stderr: "pipe",
  });

  const client = new Client({
    name: "ptywright-all-tools-smoke",
    version: "0.0.0",
  });

  await client.connect(transport);

  const list = await client.listTools();
  const toolNames = new Set(list.tools.map((t) => t.name));
  for (const name of [
    "launch_session",
    "select_session",
    "send_text",
    "press_key",
    "snapshot_text",
    "snapshot_view",
    "wait_for_text",
    "wait_for_stable_screen",
    "assert",
    "inspect_failure",
    "close_session",
    "snapshot_ansi",
    "snapshot_view_ansi",
    "run_routine",
    "run_script",
    "run_all_scripts",
    "generate_test_from_doc",
    "start_script_recording",
    "mark",
    "stop_script_recording",
  ]) {
    expect(toolNames.has(name)).toBe(true);
  }

  const tmpRoot = resolve(".tmp/test_scripts/mcp_all_tools");
  mkdirSync(tmpRoot, { recursive: true });

  // generate_test_from_doc
  const generatedDir = join(tmpRoot, "generated");
  mkdirSync(generatedDir, { recursive: true });
  const generated = await client.callTool({
    name: "generate_test_from_doc",
    arguments: {
      source: "tests/fixtures/sample_test_doc.md",
      outputDir: generatedDir,
      outputFormat: "both",
      cols: 80,
      rows: 20,
    },
  });
  expect(generated.isError ?? false).toBe(false);
  const generatedStructured = generated.structuredContent as
    | { ok?: boolean; jsonPath?: string; tsPath?: string }
    | undefined;
  expect(generatedStructured?.ok).toBe(true);
  expect(existsSync(resolve(generatedStructured?.jsonPath ?? ""))).toBe(true);
  expect(existsSync(resolve(generatedStructured?.tsPath ?? ""))).toBe(true);

  // run_script
  const runScriptDir = join(tmpRoot, "run_script");
  const runScript = await client.callTool({
    name: "run_script",
    arguments: {
      scriptPath: "scripts/m5_mask_demo.json",
      artifactsDir: runScriptDir,
    },
  });
  expect(runScript.isError ?? false).toBe(false);
  expect(readFileSync(resolve(runScriptDir, "masked.txt"), "utf8").trimEnd()).toBe(
    "TOKEN: <id>\nDONE",
  );

  // run_all_scripts
  const runAll = await client.callTool({
    name: "run_all_scripts",
    arguments: {
      dir: "tests/fixtures/run_all_scripts",
      artifactsRoot: join(tmpRoot, "run_all"),
      stepsPath: "tests/fixtures/run_all_scripts/custom_steps.ts",
      includeEntries: "failures",
      maxEntries: 20,
    },
  });
  expect(runAll.isError ?? false).toBe(false);
  const runAllStructured = runAll.structuredContent as
    | { ok?: boolean; reportPath?: string; summaryPath?: string }
    | undefined;
  expect(runAllStructured?.ok).toBe(true);
  expect(existsSync(runAllStructured?.reportPath ?? "")).toBe(true);
  expect(existsSync(runAllStructured?.summaryPath ?? "")).toBe(true);

  // start_script_recording -> mark -> stop_script_recording
  const recordingOutPath = join(tmpRoot, "recording/recorded.json");
  const recordingGoldenDir = join(tmpRoot, "recording/goldens");
  mkdirSync(dirname(recordingOutPath), { recursive: true });
  mkdirSync(recordingGoldenDir, { recursive: true });

  const started = await client.callTool({
    name: "start_script_recording",
    arguments: {
      name: "mcp_all_tools_smoke_recording",
      outPath: recordingOutPath,
      goldenDir: recordingGoldenDir,
      overwrite: true,
      mask: [{ regex: "TOKEN: [0-9a-f-]+", flags: "i", replacement: "TOKEN: <id>" }],
    },
  });
  expect(started.isError ?? false).toBe(false);
  const recordingId = (started.structuredContent as { recordingId?: string } | undefined)
    ?.recordingId;
  expect(typeof recordingId).toBe("string");

  const launchedRecording = await client.callTool({
    name: "launch_session",
    arguments: {
      command: "bun",
      args: ["run", "tests/fixtures/random_token_demo.ts"],
      cwd: ".",
      cols: 60,
      rows: 8,
      name: "xterm-256color",
    },
  });
  expect(launchedRecording.isError ?? false).toBe(false);
  const recordingSessionId = (
    launchedRecording.structuredContent as { sessionId?: string } | undefined
  )?.sessionId;
  expect(typeof recordingSessionId).toBe("string");

  await client.callTool({
    name: "wait_for_text",
    arguments: { sessionId: recordingSessionId, text: "DONE", timeoutMs: 5_000, intervalMs: 50 },
  });
  await client.callTool({
    name: "mark",
    arguments: { sessionId: recordingSessionId, label: "done" },
  });

  const stopped = await client.callTool({
    name: "stop_script_recording",
    arguments: { recordingId, writeFiles: true },
  });
  expect(stopped.isError ?? false).toBe(false);
  expect(existsSync(resolve(recordingOutPath))).toBe(true);
  expect(existsSync(resolve(recordingGoldenDir, "done.txt"))).toBe(true);
  await client.callTool({ name: "close_session", arguments: { sessionId: recordingSessionId } });

  // ANSI session for snapshot_ansi + snapshot_view_ansi
  const launchedAnsi = await client.callTool({
    name: "launch_session",
    arguments: {
      command: process.execPath,
      args: ["tests/fixtures/ansi_demo.ts"],
      cols: 40,
      rows: 8,
    },
  });
  expect(launchedAnsi.isError ?? false).toBe(false);
  const ansiSessionId = (launchedAnsi.structuredContent as { sessionId?: string } | undefined)
    ?.sessionId;
  expect(typeof ansiSessionId).toBe("string");

  await client.callTool({
    name: "wait_for_text",
    arguments: { sessionId: ansiSessionId, text: "DONE", timeoutMs: 5_000, intervalMs: 50 },
  });

  const snapAnsi = await client.callTool({
    name: "snapshot_ansi",
    arguments: { sessionId: ansiSessionId, trimRight: true, trimBottom: true },
  });
  expect(snapAnsi.isError ?? false).toBe(false);
  expect(firstTextContent(snapAnsi)).toContain("Hello world");

  const snapAnsiView = await client.callTool({
    name: "snapshot_view_ansi",
    arguments: { sessionId: ansiSessionId, trimRight: true, trimBottom: true, lineNumbers: true },
  });
  expect(snapAnsiView.isError ?? false).toBe(false);
  expect(firstTextContent(snapAnsiView)).toContain("Hello world");

  // Interactive session for send_text + press_key + snapshots + asserts + inspect_failure
  const launchedEcho = await client.callTool({
    name: "launch_session",
    arguments: {
      command: process.execPath,
      args: ["tests/fixtures/input_echo_demo.ts"],
      cols: 60,
      rows: 10,
    },
  });
  expect(launchedEcho.isError ?? false).toBe(false);
  const echoSessionId = (launchedEcho.structuredContent as { sessionId?: string } | undefined)
    ?.sessionId;
  expect(typeof echoSessionId).toBe("string");

  await client.callTool({
    name: "wait_for_text",
    arguments: { sessionId: echoSessionId, text: "READY", timeoutMs: 3_000, intervalMs: 50 },
  });

  // select_session sanity: switch to ansi, then back to echo
  await client.callTool({ name: "select_session", arguments: { sessionId: ansiSessionId } });
  const snapAnsiText = await client.callTool({
    name: "snapshot_text",
    arguments: { trimRight: true, trimBottom: true },
  });
  expect(firstTextContent(snapAnsiText)).toContain("Hello world");
  await client.callTool({ name: "select_session", arguments: { sessionId: echoSessionId } });

  // send_text (with enter)
  await client.callTool({ name: "send_text", arguments: { text: "alpha", enter: true } });
  await client.callTool({
    name: "wait_for_text",
    arguments: { text: "ECHO: alpha", timeoutMs: 2_000, intervalMs: 50 },
  });

  // send_text + press_key
  await client.callTool({ name: "send_text", arguments: { text: "beta" } });
  await client.callTool({ name: "press_key", arguments: { key: "Enter" } });
  await client.callTool({
    name: "wait_for_text",
    arguments: { text: "ECHO: beta", timeoutMs: 2_000, intervalMs: 50 },
  });

  const snapText = await client.callTool({
    name: "snapshot_text",
    arguments: { trimRight: true, trimBottom: true },
  });
  expect(firstTextContent(snapText)).toContain("ECHO: beta");

  const snapView = await client.callTool({
    name: "snapshot_view",
    arguments: { trimRight: true, trimBottom: true, lineNumbers: true },
  });
  expect(firstTextContent(snapView)).toContain("ECHO: beta");

  const stable = await client.callTool({
    name: "wait_for_stable_screen",
    arguments: { timeoutMs: 2_000, quietMs: 200, intervalMs: 50 },
  });
  expect((stable.structuredContent as { stable?: boolean } | undefined)?.stable).toBe(true);

  const okAssert = await client.callTool({ name: "assert", arguments: { text: "ECHO: alpha" } });
  expect(okAssert.isError ?? false).toBe(false);

  const badAssert = await client.callTool({
    name: "assert",
    arguments: { text: "THIS_WILL_NOT_EXIST" },
  });
  expect(badAssert.isError ?? false).toBe(true);

  const inspected = await client.callTool({
    name: "inspect_failure",
    arguments: { includeFrames: true, maxFrames: 2 },
  });
  expect(inspected.isError ?? false).toBe(false);
  const inspectedStructured = inspected.structuredContent as
    | { currentSnapshot?: { text?: string }; isClosed?: boolean }
    | undefined;
  expect(inspectedStructured?.isClosed).toBe(false);
  expect(inspectedStructured?.currentSnapshot?.text).toContain("ECHO: beta");

  // run_routine (creates report)
  const routineDir = join(tmpRoot, "routine");
  mkdirSync(routineDir, { recursive: true });
  const routineReportPath = join(routineDir, "routine.html");

  const launchedTui = await client.callTool({
    name: "launch_session",
    arguments: {
      command: "bun",
      args: ["run", "tests/fixtures/tui_demo.ts"],
      cols: 80,
      rows: 20,
    },
  });
  expect(launchedTui.isError ?? false).toBe(false);
  const tuiSessionId = (launchedTui.structuredContent as { sessionId?: string } | undefined)
    ?.sessionId;
  expect(typeof tuiSessionId).toBe("string");

  const routine = await client.callTool({
    name: "run_routine",
    arguments: {
      sessionId: tuiSessionId,
      saveReport: true,
      reportPath: routineReportPath,
      steps: [
        {
          action: "wait",
          waitFor: "PTYWRIGHT TUI DEMO",
          description: "wait initial",
          timeoutMs: 5_000,
        },
        { action: "pressKey", key: "Enter", description: "toggle" },
        { action: "wait", waitFor: "Mode: LOW", description: "wait low", timeoutMs: 3_000 },
        { action: "assert", waitFor: "Mode: LOW", description: "assert low" },
      ],
    },
  });
  expect(routine.isError ?? false).toBe(false);
  expect(existsSync(routineReportPath)).toBe(true);

  await client.callTool({ name: "close_session", arguments: { sessionId: tuiSessionId } });
  await client.callTool({ name: "close_session", arguments: { sessionId: echoSessionId } });
  await client.callTool({ name: "close_session", arguments: { sessionId: ansiSessionId } });

  await client.close();
  await transport.close();
});
