import type { ScriptRunSummaryCommands } from "./summary_schema";

export function makeScriptRunSummaryCommands(args: {
  dir: string;
  suiteDir: string;
  stepsPath?: string;
}): ScriptRunSummaryCommands {
  const runAll = [
    "ptywright",
    "run-all",
    args.dir,
    "--artifacts-root",
    args.suiteDir,
    ...(args.stepsPath ? ["--steps", args.stepsPath] : []),
  ];
  return {
    runAll: { argv: runAll },
    updateGoldens: { argv: [...runAll, "--update-goldens"] },
  };
}
