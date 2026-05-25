import { expect, test } from "bun:test";

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { runScript } from "../src/script/runner";

test("script JSON schema is valid JSON", () => {
  const raw = readFileSync(resolve("schemas/ptywright-script.schema.json"), "utf8");
  const schema = JSON.parse(raw) as Record<string, any>;
  expect(schema).toBeTruthy();
  expect(schema.$defs.launch.properties.backend.enum).toEqual(["pty", "frames", "ink", "ratatui"]);
  expect(schema.$defs.launch.properties.frameModule.type).toBe("string");
});

test("script run summary schema constrains replay/update commands", () => {
  const schema = JSON.parse(
    readFileSync(resolve("schemas/ptywright-script-run-summary.schema.json"), "utf8"),
  ) as Record<string, any>;

  expect(schema.$id).toContain("ptywright-script-run-summary.schema.json");
  expect(schema.properties.commands.$ref).toBe("#/$defs/commands");
  expect(schema.$defs.runAllArgv.prefixItems).toMatchObject([
    { const: "ptywright" },
    { const: "run-all" },
  ]);
  expect(schema.$defs.runAllArgv.contains).toEqual({ const: "--artifacts-root" });
  expect(schema.$defs.updateGoldensArgv.allOf).toContainEqual({
    contains: { const: "--update-goldens" },
  });
});

test("script manifest schema constrains portable hashed artifacts", () => {
  const schema = JSON.parse(
    readFileSync(resolve("schemas/ptywright-script-manifest.schema.json"), "utf8"),
  ) as Record<string, any>;

  expect(schema.$id).toContain("ptywright-script-manifest.schema.json");
  expect(schema.properties.kind).toEqual({ const: "run-suite" });
  expect(schema.properties.files.items.$ref).toBe("#/$defs/file");
  expect(schema.$defs.file.required).toContain("sha256");
  expect(schema.$defs.file.properties.kind.enum).toContain("run-summary");
  expect(schema.$defs.runAllArgv.prefixItems).toMatchObject([
    { const: "ptywright" },
    { const: "run-all" },
  ]);
});

test("runner supports built-in steps: sleep/expectMeta/waitForExit", async () => {
  const artifactsDir = resolve(".tmp/test_scripts/m7_script_built_in_steps");

  const result = await runScript(
    {
      name: "m7_script_built_in_steps",
      launch: {
        command: "bun",
        args: ["run", "tests/fixtures/alt_screen_demo.ts"],
        cwd: ".",
        cols: 40,
        rows: 8,
        name: "xterm-256color",
      },
      steps: [
        { type: "waitForText", scope: "visible", text: "ALT SCREEN", timeoutMs: 5_000 },
        { type: "expectMeta", bufferType: "alternate", cols: 40, rows: 8 },
        { type: "sleep", ms: 20 },
        { type: "waitForExit", timeoutMs: 5_000, exitCode: 0 },
      ],
    },
    { artifactsDir },
  );
  expect(result.ok).toBe(true);

  const castPath = join(artifactsDir, "m7_script_built_in_steps.cast");
  const reportPath = join(artifactsDir, "m7_script_built_in_steps.report.html");

  expect(existsSync(castPath)).toBe(true);
  expect(existsSync(reportPath)).toBe(true);
});
