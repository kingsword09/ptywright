import type { Script } from "./schema";

export type ScriptRunnerTraceArtifacts = {
  saveCast: boolean;
  saveReport: boolean;
  castPath: string;
  reportPath: string;
  reportScope: NonNullable<Script["trace"]>["reportScope"];
  reportMaxFrames: NonNullable<Script["trace"]>["reportMaxFrames"];
};

export function resolveScriptTraceArtifacts(args: {
  script: Script;
  scriptName: string;
  resolveArtifactPath: (path: string) => string;
}): ScriptRunnerTraceArtifacts {
  const trace = args.script.trace ?? {};
  return {
    saveCast: trace.saveCast ?? true,
    saveReport: trace.saveReport ?? true,
    castPath: args.resolveArtifactPath(trace.castPath ?? `${args.scriptName}.cast`),
    reportPath: args.resolveArtifactPath(trace.reportPath ?? `${args.scriptName}.report.html`),
    reportScope: trace.reportScope,
    reportMaxFrames: trace.reportMaxFrames,
  };
}
