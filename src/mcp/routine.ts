import { z } from "zod";

import type { TerminalSession } from "../session/terminal_session";
import type { RegisterPtywrightTool, RequireSession } from "./tool_context";
import { tryWriteRoutineReport } from "./routine_report";
import { captureRoutineSnapshot, runRoutineStep, tryCaptureRoutineSnapshot } from "./routine_step";
import { routineStepSchema, type RoutineStep, type RoutineStepResult } from "./routine_types";
export { routineStepSchema } from "./routine_types";

export function registerRoutineTools(args: {
  tool: RegisterPtywrightTool;
  requireSession: RequireSession;
}): void {
  const { tool, requireSession } = args;

  tool(
    "script",
    "run_routine",
    "PRIMARY INTERACTION TOOL. Execute a multi-step test scenario (type, key, wait, assert) in one go. Use this whenever asked to 'test', 'verify', 'do', or 'check' a workflow. It handles delays and snapshots automatically.",
    {
      sessionId: z.string().min(1).optional(),
      steps: z.array(routineStepSchema).min(1),
      saveReport: z.boolean().optional(),
      reportPath: z.string().optional(),
    },
    {
      title: "Run Routine",
      openWorldHint: true,
    },
    async (toolArgs, extra) => {
      const required = requireSession(toolArgs, extra);
      if (!required.ok) return required.error;
      const { sessionId, session } = required;

      return await runRoutine({
        sessionId,
        session,
        steps: toolArgs.steps,
        saveReport: toolArgs.saveReport,
        reportPath: toolArgs.reportPath,
      });
    },
  );
}

export async function runRoutine(args: {
  sessionId: string;
  session: TerminalSession;
  steps: RoutineStep[];
  saveReport?: boolean;
  reportPath?: string;
}): Promise<{
  content: { type: "text"; text: string }[];
  structuredContent: {
    sessionId: string;
    ok: boolean;
    stepCount: number;
    failedStep: number | null;
    reportPath?: string;
    results: RoutineStepResult[];
  };
}> {
  const results: RoutineStepResult[] = [];
  let failed = false;
  let failedStep: number | null = null;

  for (let i = 0; i < args.steps.length; i += 1) {
    const step = args.steps[i];
    if (!step) continue;

    const result: RoutineStepResult = {
      index: i + 1,
      action: step.action,
      description: step.description,
      ok: true,
    };

    try {
      await runRoutineStep(args.session, step);
      const snapshot = await captureRoutineSnapshot(args.session);
      result.snapshot = snapshot.text;
      result.hash = snapshot.hash;
    } catch (error) {
      result.ok = false;
      result.error = error instanceof Error ? error.message : String(error);
      failed = true;
      failedStep = i + 1;

      const snapshot = await tryCaptureRoutineSnapshot(args.session);
      result.snapshot = snapshot?.text;
      result.hash = snapshot?.hash;
    }

    results.push(result);

    if (failed) break;
  }

  const summary = failed
    ? `failed at step ${failedStep}: ${results[results.length - 1]?.error}`
    : `ok, ${results.length} steps completed`;

  let reportPath = args.reportPath;
  if (args.saveReport ?? true) {
    reportPath = await tryWriteRoutineReport({
      sessionId: args.sessionId,
      session: args.session,
      results,
      failed,
      reportPath,
    });
  }

  const contentText = reportPath
    ? `${summary}

Report generated: ${reportPath}
Open in browser to view step-by-step timeline.`
    : summary;

  return {
    content: [{ type: "text", text: contentText }],
    structuredContent: {
      sessionId: args.sessionId,
      ok: !failed,
      stepCount: results.length,
      failedStep,
      reportPath,
      results,
    },
  };
}
