import { describe, expect, test } from "bun:test";
import { scriptSchema, scriptStepSchema } from "../src/script/schema";

describe("Script Schema Extensions", () => {
  test("validates assert step with text", () => {
    const step = {
      type: "assert" as const,
      text: "success",
      description: "check success message",
    };
    const parsed = scriptStepSchema.parse(step);
    expect(parsed).toEqual(step);
  });

  test("validates assert step with regex", () => {
    const step = {
      type: "assert" as const,
      regex: "status: \\d+",
      scope: "buffer" as const,
    };
    const parsed = scriptStepSchema.parse(step);
    expect(parsed).toEqual(step);
  });

  test("assert step fails without text/regex", () => {
    const step = {
      type: "assert",
      description: "invalid",
    };
    const result = scriptStepSchema.safeParse(step);
    expect(result.success).toBe(false);
  });

  test("validates assertSemantic step", () => {
    const step = {
      type: "assertSemantic" as const,
      prompt: "is the user logged in?",
      description: "check login status",
    };
    const parsed = scriptStepSchema.parse(step);
    expect(parsed).toEqual(step);
  });

  test("full script validation with new steps", () => {
    const script = {
      name: "test-assertions",
      launch: { command: "echo ok" },
      steps: [
        { type: "sendText" as const, text: "hello" },
        { type: "assert" as const, text: "hello" },
        { type: "assertSemantic" as const, prompt: "check greeting" },
      ],
    };
    const parsed = scriptSchema.parse(script);
    expect(parsed.steps).toHaveLength(3);
  });
});
