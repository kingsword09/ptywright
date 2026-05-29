import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "bun:test";

import { buildCommandLaunchCommand, extractUrlFromOutput } from "../src/agent/command_launch";
import { formatAgentLaunchCommand } from "../src/agent/launch";
import { applyAgentMasks, normalizeDomSnapshot } from "../src/agent/normalize";
import {
  createAgentTemplateSpec,
  resolveAgentFlavor,
  resolveAgentMasks,
} from "../src/agent/presets";
import { normalizeAgentFlowSpec, resolveAgentLaunchMode } from "../src/agent/schema";

test("agent flow schema normalizes default viewport", () => {
  const spec = normalizeAgentFlowSpec({
    launch: {
      command: "codex",
    },
    steps: [{ type: "waitForText", text: "ready" }],
  });

  expect(spec.name).toBe("agent-flow");
  expect(spec.viewports?.[0]?.name).toBe("desktop-1440");
  expect(resolveAgentLaunchMode(spec.launch)).toBe("command");
});

test("generic command launch preserves command process options", () => {
  const command = buildCommandLaunchCommand(
    {
      mode: "command",
      command: "serve-browser-terminal",
      args: ["--port", "0"],
      cwd: "packages/demo",
      env: { DEMO: "1" },
      urlRegex: "url=(https?://\\S+)",
      waitForUrlMs: 1234,
    },
    { rootDir: "/repo", env: { BASE: "1" } },
  );

  expect(command).toMatchObject({
    file: "serve-browser-terminal",
    args: ["--port", "0"],
    cwd: "/repo/packages/demo",
    label: "serve-browser-terminal",
    urlRegex: "url=(https?://\\S+)",
    waitForUrlMs: 1234,
  });
  expect(command.env?.BASE).toBe("1");
  expect(command.env?.DEMO).toBe("1");
});

test("generic URL parser extracts printed browser URL", () => {
  expect(extractUrlFromOutput("noise\nurl=http://localhost:1234/session\n")).toBe(
    "http://localhost:1234/session",
  );
  expect(extractUrlFromOutput("ready url=https://example.test/s/1\n", "url=(https?://\\S+)")).toBe(
    "https://example.test/s/1",
  );
});

test("launch command formatter uses generic command mode by default", () => {
  expect(
    formatAgentLaunchCommand({
      command: "serve-browser-terminal",
      args: ["--launch", "print"],
    }),
  ).toBe("serve-browser-terminal --launch print");
});

test("agent launch schema rejects unsupported launch modes and fields", () => {
  expect(() =>
    normalizeAgentFlowSpec({
      launch: {
        mode: "legacy",
        command: "codex",
      },
      steps: [{ type: "waitForStableDom" }],
    }),
  ).toThrow();
  expect(() =>
    normalizeAgentFlowSpec({
      launch: {
        command: "codex",
        launcherOptions: { project: "demo" },
      },
      steps: [{ type: "waitForStableDom" }],
    }),
  ).toThrow();
});

test("agent flavor is inferred from common agent command names", () => {
  const steps = [{ type: "waitForStableDom" }];

  expect(resolveAgentFlavor(normalizeAgentFlowSpec({ launch: { command: "codex" }, steps }))).toBe(
    "codex",
  );
  expect(
    resolveAgentFlavor(normalizeAgentFlowSpec({ launch: { command: "claude-code" }, steps })),
  ).toBe("claude");
  expect(resolveAgentFlavor(normalizeAgentFlowSpec({ launch: { command: "droidx" }, steps }))).toBe(
    "droid",
  );
});

test("agent mask presets include common ids and flavor model names", () => {
  const spec = normalizeAgentFlowSpec({
    launch: { agentFlavor: "claude", command: "claude" },
    steps: [{ type: "waitForStableDom" }],
  });
  const masked = applyAgentMasks(
    "model claude-3-5-sonnet-20241022 request req_abc123456789 at 2026-05-24T06:00:00Z",
    resolveAgentMasks(spec),
  );

  expect(masked).toContain("<model>");
  expect(masked).toContain("<id>");
  expect(masked).toContain("<timestamp>");
});

test("agent codex model masks do not redact ordinary CSS properties", () => {
  const spec = normalizeAgentFlowSpec({
    launch: { agentFlavor: "codex", command: "codex" },
    steps: [{ type: "waitForStableDom" }],
  });

  const masked = applyAgentMasks(
    'style="overflow: hidden;" model gpt-5.5 and o3 request req_abc123456789',
    resolveAgentMasks(spec),
  );

  expect(masked).toContain("overflow: hidden");
  expect(masked).toContain("model <model> and <model>");
  expect(masked).toContain("request <id>");
});

test("agent DOM masks escape replacement text as HTML", () => {
  const dom = normalizeDomSnapshot(
    '<div class="term-grid"><div class="term-row"><span style="overflow: hidden;">gpt-5.5</span></div></div>',
    [{ regex: "\\bgpt-[A-Za-z0-9._:-]+\\b", flags: "gi", replacement: "<model>" }],
  );

  expect(dom).toContain("overflow: hidden");
  expect(dom).toContain("&lt;model&gt;");
  expect(dom).not.toContain("<model>");
});

test("agent template specs provide starter launch snapshots for real agent flavors", () => {
  const codex = createAgentTemplateSpec("codex");
  const claude = createAgentTemplateSpec("claude");
  const droid = createAgentTemplateSpec("droid");

  expect(codex.launch.mode).toBe("command");
  expect(codex.launch.command).toBe("your-browser-terminal-launcher");
  expect(codex.launch.args).toEqual(["--agent", "codex", "--print-url"]);
  expect(claude.launch.agentFlavor).toBe("claude");
  expect(droid.launch.args).toContain("droidx");
  expect(codex.steps.at(-1)).toMatchObject({
    type: "snapshot",
    name: "launch",
    targets: ["terminal", "dom", "screenshot"],
  });
});

test("agent artifact schemas constrain stored command argv contracts", () => {
  const runSchema = readAgentSchema("ptywright-agent-run.schema.json");
  const checkSchema = readAgentSchema("ptywright-agent-check.schema.json");
  const promoteSchema = readAgentSchema("ptywright-agent-promote.schema.json");
  const replaySummarySchema = readAgentSchema("ptywright-agent-replay-summary.schema.json");
  const manifestSchema = readAgentSchema("ptywright-agent-manifest.schema.json");

  expect(runSchema.$defs.replayArgv.prefixItems).toMatchObject([
    { const: "ptywright" },
    { const: "agent" },
    { const: "replay" },
  ]);
  expect(runSchema.$defs.commands.properties.updateSnapshots.$ref).toBe(
    "#/$defs/replayUpdateCommand",
  );

  expect(checkSchema.$defs.checkArgv.prefixItems).toMatchObject([
    { const: "ptywright" },
    { const: "agent" },
    { const: "check" },
  ]);
  expect(checkSchema.$defs.rerunArgv.prefixItems).toMatchObject([
    { const: "ptywright" },
    { const: "agent" },
    { const: "rerun" },
  ]);
  expect(checkSchema.$defs.checkUpdateCommand.properties.argv.allOf).toContainEqual({
    contains: { const: "--update-snapshots" },
  });

  expect(promoteSchema.$defs.promoteArgv.prefixItems).toMatchObject([
    { const: "ptywright" },
    { const: "agent" },
    { const: "promote" },
  ]);
  expect(promoteSchema.$defs.commands.properties.rerun.$ref).toBe("#/$defs/rerunCommand");

  expect(replaySummarySchema.$defs.replayAllArgv.prefixItems).toMatchObject([
    { const: "ptywright" },
    { const: "agent" },
    { const: "replay-all" },
  ]);
  expect(replaySummarySchema.$defs.replayAllUpdateCommand.properties.argv.allOf).toContainEqual({
    contains: { const: "--update-snapshots" },
  });

  expect(manifestSchema.$defs.agentArgv.prefixItems).toMatchObject([
    { const: "ptywright" },
    { const: "agent" },
  ]);
  expect(manifestSchema.$defs.file.required).toContain("sha256");
  expect(manifestSchema.$defs.file.properties.path.description).toContain("relative");
  expect(manifestSchema.properties.commands.additionalProperties.$ref).toBe("#/$defs/command");
});

function readAgentSchema(name: string): Record<string, any> {
  return JSON.parse(readFileSync(resolve("schemas", name), "utf8")) as Record<string, any>;
}
