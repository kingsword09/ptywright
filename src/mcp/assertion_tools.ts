import { registerAssertTool } from "./assert_tool";
import type { AssertionToolRegistration } from "./assertion_tool_context";
import { registerWaitAssertionTools } from "./wait_assertion_tools";

export function registerAssertionTools(args: AssertionToolRegistration): void {
  registerWaitAssertionTools(args);
  registerAssertTool(args);
}
