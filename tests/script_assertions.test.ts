import { describe, expect, test } from "bun:test";
import { runScript } from "../src/script/runner";

const bunEval = (code: string) => ({
  command: process.execPath,
  args: ["-e", code],
});

describe("Script Assertions", () => {
  test("assert step passes when text matches", async () => {
    const script = {
      name: "test-assert-pass",
      launch: bunEval('console.log("hello world")'),
      steps: [
        { type: "waitForText", text: "hello" },
        { type: "assert", text: "world" },
      ],
    };

    const result = await runScript(script, { artifactsDir: ".tmp/test/assert-pass" });
    expect(result.ok).toBe(true);
  });

  test("assert step fails when text missing", async () => {
    const script = {
      name: "test-assert-fail",
      launch: bunEval('console.log("hello world")'),
      steps: [
        { type: "waitForText", text: "hello" },
        { type: "assert", text: "missing" },
      ],
    };

    try {
      await runScript(script, { artifactsDir: ".tmp/test/assert-fail" });
      expect(true).toBe(false);
    } catch (err) {
      expect((err as Error).message).toContain("assert failed");
    }
  });

  test("assert step passes with regex", async () => {
    const script = {
      name: "test-assert-regex",
      launch: bunEval('console.log("count: 42")'),
      steps: [
        { type: "waitForText", text: "count" },
        { type: "assert", regex: "count: \\d+" },
      ],
    };

    const result = await runScript(script, { artifactsDir: ".tmp/test/assert-regex" });
    expect(result.ok).toBe(true);
  });

  test("assertSemantic step is ignored (no-op) in default runner", async () => {
    const script = {
      name: "test-assert-semantic",
      launch: bunEval('console.log("ok")'),
      steps: [
        { type: "waitForText", text: "ok" },
        { type: "assertSemantic", prompt: "is it ok?" },
      ],
    };

    const result = await runScript(script, { artifactsDir: ".tmp/test/assert-semantic" });
    expect(result.ok).toBe(true);
  });
});
