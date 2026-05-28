import type { ScriptRecordingManager } from "./script_recording";
import type { RegisterPtywrightTool, RequireSession } from "./tool_context";

export type AssertionToolRegistration = {
  tool: RegisterPtywrightTool;
  recordings: ScriptRecordingManager;
  requireSession: RequireSession;
};
