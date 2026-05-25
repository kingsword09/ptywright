import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "bun:test";

import { buildAittyExecCommand, extractAittyUrlFromOutput } from "../src/agent/aitty";
import { applyAgentMasks } from "../src/agent/normalize";
import {
  createAgentTemplateSpec,
  resolveAgentFlavor,
  resolveAgentMasks,
} from "../src/agent/presets";
import { normalizeAgentFlowSpec } from "../src/agent/schema";

test("agent flow schema normalizes default viewport", () => {
  const spec = normalizeAgentFlowSpec({
    launch: {
      command: "codex",
    },
    steps: [{ type: "waitForText", text: "ready" }],
  });

  expect(spec.name).toBe("agent-flow");
  expect(spec.viewports?.[0]?.name).toBe("desktop-1440");
});

test("aitty launch command uses print mode and keeps agent args after --", () => {
  const command = buildAittyExecCommand(
    {
      command: "codex",
      args: ["resume", "--last"],
      cwd: ".",
      aitty: {
        command: "aitty",
        project: "demo",
        label: "codex",
        theme: "light",
        fontSize: 14,
      },
    },
    { rootDir: "/repo", env: {} },
  );

  expect(command.file).toBe("aitty");
  expect(command.args).toContain("exec");
  expect(command.args).toContain("--launch");
  expect(command.args).toContain("print");
  expect(command.args.slice(-4)).toEqual(["--", "codex", "resume", "--last"]);
});

test("aitty URL parser extracts first printed session URL", () => {
  expect(
    extractAittyUrlFromOutput("noise\nhttp://codex.aitty.localhost:1234/s/p/c?t=token\n"),
  ).toBe("http://codex.aitty.localhost:1234/s/p/c?t=token");
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

test("agent template specs provide starter launch snapshots for real agent flavors", () => {
  const codex = createAgentTemplateSpec("codex");
  const claude = createAgentTemplateSpec("claude");
  const droid = createAgentTemplateSpec("droid");

  expect(codex.launch.command).toBe("codex");
  expect(claude.launch.agentFlavor).toBe("claude");
  expect(droid.launch.command).toBe("droidx");
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
