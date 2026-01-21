import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { parseDocument } from "../src/generator/doc_parser";
import { extractSteps } from "../src/generator/step_extractor";
import {
  generateScript,
  generateJsonScript,
  generateTypeScriptScript,
} from "../src/generator/script_generator";
import { generateTestFromDoc } from "../src/generator/generate";
import { runScriptPath } from "../src/script/path";

const TEST_OUTPUT_DIR = resolve(".tmp/test-generator");

describe("generator", () => {
  beforeAll(() => {
    mkdirSync(TEST_OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(TEST_OUTPUT_DIR)) {
      rmSync(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  describe("parseDocument", () => {
    it("should parse markdown with code blocks", async () => {
      const content = `
# Test Doc

Some description.

\`\`\`bash
echo "hello"
echo "world"
\`\`\`
`;
      const result = await parseDocument({ type: "raw", content });

      expect(result.format).toBe("markdown");
      expect(result.title).toBe("Test Doc");
      expect(result.codeBlocks.length).toBe(1);
      expect(result.codeBlocks[0]?.language).toBe("bash");
      expect(result.codeBlocks[0]?.code).toContain('echo "hello"');
    });

    it("should parse markdown with numbered steps", async () => {
      const content = `
# Steps

1. Run the command
2. Wait for output
3. Check result
`;
      const result = await parseDocument({ type: "raw", content });

      expect(result.steps.length).toBe(3);
      expect(result.steps[0]).toBe("Run the command");
    });

    it("should parse JSON content", async () => {
      const content = JSON.stringify({
        commands: ["echo test", "ls -la"],
        steps: [{ command: "npm install" }],
      });

      const result = await parseDocument({ type: "raw", content });

      expect(result.format).toBe("json");
    });

    it("should detect format from file extension", async () => {
      const result = await parseDocument({
        type: "local",
        path: resolve("tests/fixtures/sample_test_doc.md"),
      });

      expect(result.format).toBe("markdown");
      expect(result.title).toBe("Testing Echo Command");
    });
  });

  describe("extractSteps", () => {
    it("should extract steps from shell code blocks", async () => {
      const doc = await parseDocument({
        type: "raw",
        content: `
\`\`\`bash
$ echo "step 1"
$ echo "step 2"
\`\`\`
`,
      });

      const result = extractSteps(doc);

      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.steps[0]?.type).toBe("sendText");
    });

    it("should extract launch command", async () => {
      const doc = await parseDocument({
        type: "raw",
        content: `
\`\`\`bash
node app.js
echo "ready"
\`\`\`
`,
      });

      const result = extractSteps(doc);

      expect(result.launch).toBeDefined();
      expect(result.launch?.command).toBe("node");
      expect(result.launch?.args).toContain("app.js");
    });

    it("should extract from text steps", async () => {
      const doc = await parseDocument({
        type: "raw",
        content: `
1. type "hello"
2. press Enter
3. wait for "done"
`,
      });

      const result = extractSteps(doc);

      expect(result.steps.length).toBeGreaterThan(0);
    });

    it("should insert default waits between input steps", async () => {
      const doc = await parseDocument({
        type: "raw",
        content: `
\`\`\`bash
echo "one"
echo "two"
\`\`\`
`,
      });

      const result = extractSteps(doc);

      const waitSteps = result.steps.filter((s) => s.type === "waitForStableScreen");
      expect(waitSteps.length).toBeGreaterThan(0);
    });
  });

  describe("generateScript", () => {
    it("should generate JSON script", () => {
      const steps = [
        {
          type: "sendText" as const,
          params: { text: "hello", enter: true },
          source: "code_block" as const,
          confidence: "high" as const,
        },
      ];

      const result = generateScript(steps, {
        name: "test_script",
        outputDir: TEST_OUTPUT_DIR,
        format: "json",
      });

      expect(result.jsonPath).toBeDefined();
      expect(existsSync(result.jsonPath!)).toBe(true);

      const content = readFileSync(result.jsonPath!, "utf8");
      const parsed = JSON.parse(content);
      const expectedSchema = (() => {
        let rel = relative(TEST_OUTPUT_DIR, resolve("schemas/ptywright-script.schema.json"));
        if (!rel.startsWith(".")) rel = `./${rel}`;
        return rel.replaceAll("\\", "/");
      })();
      expect(parsed.$schema).toBe(expectedSchema);
      expect(parsed.name).toBe("test_script");
    });

    it("should generate TypeScript script", () => {
      const steps = [
        {
          type: "sendText" as const,
          params: { text: "test", enter: true },
          source: "code_block" as const,
          confidence: "high" as const,
        },
      ];

      const result = generateScript(steps, {
        name: "test_ts_script",
        outputDir: TEST_OUTPUT_DIR,
        format: "ts",
      });

      expect(result.tsPath).toBeDefined();
      expect(existsSync(result.tsPath!)).toBe(true);

      const content = readFileSync(result.tsPath!, "utf8");
      expect(content).toContain("export default");
      expect(content).toContain('"type": "sendText"');
    });

    it("should generate runnable TypeScript script", async () => {
      const steps = [
        {
          type: "waitForText" as const,
          params: { text: "ready", timeoutMs: 1000 },
          source: "text_step" as const,
          confidence: "high" as const,
        },
      ];

      const result = generateScript(steps, {
        name: "test_ts_runnable",
        outputDir: TEST_OUTPUT_DIR,
        format: "ts",
        targetCommand: process.execPath,
        targetArgs: ["-e", "console.log('ready'); setTimeout(() => {}, 1000);"],
        trace: { saveCast: false, saveReport: false },
      });

      expect(result.tsPath).toBeDefined();
      const run = await runScriptPath(result.tsPath!, {
        artifactsDir: resolve(TEST_OUTPUT_DIR, "runs"),
      });
      expect(run.ok).toBe(true);
    });

    it("should generate both formats", () => {
      const steps = [
        {
          type: "pressKey" as const,
          params: { key: "Enter" },
          source: "text_step" as const,
          confidence: "medium" as const,
        },
      ];

      const result = generateScript(steps, {
        name: "test_both",
        outputDir: TEST_OUTPUT_DIR,
        format: "both",
      });

      expect(result.jsonPath).toBeDefined();
      expect(result.tsPath).toBeDefined();
    });
  });

  describe("generateTestFromDoc", () => {
    it("should generate test from markdown file", async () => {
      const result = await generateTestFromDoc({
        source: resolve("tests/fixtures/sample_test_doc.md"),
        outputDir: TEST_OUTPUT_DIR,
        name: "from_md_test",
      });

      expect(result.ok).toBe(true);
      expect(result.stepCount).toBeGreaterThan(0);
      expect(result.jsonPath).toBeDefined();
      expect(result.tsPath).toBeDefined();
    });

    it("should treat sourceType=auto as detection for URL sources", async () => {
      const markdown = `
# URL Doc

\`\`\`bash
echo "hello from url"
\`\`\`
`;

      const srv = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: () =>
          new Response(markdown, {
            headers: { "content-type": "text/markdown; charset=utf-8" },
          }),
      });

      try {
        const url = `http://127.0.0.1:${srv.port}/doc.md`;
        const result = await generateTestFromDoc({
          source: url,
          sourceType: "auto",
          outputDir: TEST_OUTPUT_DIR,
          name: "from_url_auto_test",
        });

        expect(result.ok).toBe(true);
        expect(result.jsonPath).toBeDefined();
        expect(result.tsPath).toBeDefined();
      } finally {
        await srv.stop();
      }
    });

    it("should handle missing file", async () => {
      const result = await generateTestFromDoc({
        source: "/nonexistent/file.md",
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain("not found");
    });

    it("should use targetCommand override", async () => {
      const result = await generateTestFromDoc({
        source: resolve("tests/fixtures/sample_test_doc.md"),
        outputDir: TEST_OUTPUT_DIR,
        name: "target_cmd_test",
        targetCommand: "custom-cmd",
        targetArgs: ["--flag"],
      });

      expect(result.ok).toBe(true);

      const content = readFileSync(result.jsonPath!, "utf8");
      expect(content).toContain('"command": "custom-cmd"');
    });
  });

  describe("generateJsonScript", () => {
    it("should produce valid JSON with schema reference", () => {
      const script = {
        name: "test",
        launch: { command: "bash" },
        steps: [{ type: "sendText" as const, text: "test" }],
      };

      const json = generateJsonScript(script);
      const parsed = JSON.parse(json);

      expect(parsed.$schema).toBeDefined();
      expect(parsed.name).toBe("test");
    });
  });

  describe("generateTypeScriptScript", () => {
    it("should produce valid TypeScript syntax", () => {
      const script = {
        name: "ts_test",
        launch: { command: "node", args: ["app.js"], cols: 80, rows: 24 },
        trace: { saveCast: true, saveReport: true },
        steps: [
          { type: "sendText" as const, text: "hello", enter: true },
          { type: "waitForText" as const, text: "ready", timeoutMs: 5000 },
          { type: "snapshot" as const, kind: "view" as const },
        ],
      };

      const ts = generateTypeScriptScript(script);

      expect(ts).toContain("export default");
      expect(ts).toContain('"name": "ts_test"');
      expect(ts).toContain('"type": "waitForText"');
    });
  });
});
