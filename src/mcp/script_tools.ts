import { registerGenerateTestFromDocTool } from "./script_generate_tool";
import { registerRunAllScriptsTool } from "./script_run_all_tool";
import { registerRunScriptTool } from "./script_run_tool";
import type { ScriptToolRegistration } from "./script_tool_context";

export function registerScriptTools(args: ScriptToolRegistration): void {
  registerRunScriptTool(args);
  registerRunAllScriptsTool(args);
  registerGenerateTestFromDocTool(args);
}
