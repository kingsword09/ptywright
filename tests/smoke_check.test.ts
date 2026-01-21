import { describe, expect, test } from "bun:test";
import { scriptSchema } from "../src/script/schema";

// Simple smoke test to ensure new tool definitions and runner changes didn't break basic imports
describe("Integration Check", () => {
  test("runner schema is valid", () => {
    const script = {
      name: "test",
      launch: { command: "echo" },
      steps: [{ type: "sendText", text: "hello" }],
    };
    expect(() => scriptSchema.parse(script)).not.toThrow();
  });
});
