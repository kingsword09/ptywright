import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { TerminalSession } from "../session/terminal_session";
import type { PtywrightCapability } from "./capabilities";
import type { ToolErrorResult } from "./tool_result";

export type ToolExtra = { sessionId?: string };

export type RegisterPtywrightTool = <Shape extends z.ZodRawShape>(
  category: Exclude<PtywrightCapability, "all">,
  name: string,
  description: string,
  schema: Shape,
  annotations: ToolAnnotations | undefined,
  handler: (args: z.infer<z.ZodObject<Shape>>, extra: ToolExtra) => unknown,
) => void;

export type RequireSession = (
  args: { sessionId?: string },
  extra: ToolExtra,
) =>
  | { ok: true; sessionId: string; session: TerminalSession }
  | { ok: false; error: ToolErrorResult };
