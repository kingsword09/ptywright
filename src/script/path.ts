import { basename, extname, isAbsolute, resolve } from "node:path";

import { loadScriptModule, loadStepHandlersModule } from "./module";
import { runScript } from "./runner";
import type { CustomStepHandler } from "./runner";
import { scriptSchema } from "./schema";
import type { Script } from "./schema";

export type RunScriptPathOptions = {
  artifactsDir?: string;
  updateGoldens?: boolean;
  stepsPath?: string;
};

export type RunScriptPathSuccess = {
  ok: true;
  scriptName: string;
  artifactsDir: string;
  castPath?: string;
  reportPath?: string;
};

export type RunScriptPathFailure = {
  ok: false;
  error: string;
  scriptName?: string;
  artifactsDir?: string;
  castPath?: string;
  reportPath?: string;
  failureArtifacts?: {
    lastTextPath: string;
    lastViewPath: string;
    stepPath: string;
    errorPath: string;
  };
};

export type RunScriptPathResult = RunScriptPathSuccess | RunScriptPathFailure;

export async function runScriptPath(
  scriptPath: string,
  options?: RunScriptPathOptions,
): Promise<RunScriptPathResult> {
  let scriptName: string | undefined;
  let artifactsDir: string | undefined;
  let castPath: string | undefined;
  let reportPath: string | undefined;

  try {
    const ext = extname(scriptPath).toLowerCase();
    const baseName = basename(scriptPath, extname(scriptPath));

    const extraSteps = options?.stepsPath
      ? (await loadStepHandlersModule(options.stepsPath)).steps
      : undefined;

    const loaded = await loadScriptInput(scriptPath, ext);
    const stepsFromModule = loaded.steps;
    const mergedSteps =
      stepsFromModule && extraSteps
        ? { ...stepsFromModule, ...extraSteps }
        : (stepsFromModule ?? extraSteps);

    const built = loaded.script;
    const withName =
      built && typeof built === "object" && !Array.isArray(built) && !("name" in built)
        ? { ...built, name: baseName }
        : built;

    const parsed = scriptSchema.parse(withName) as Script;
    scriptName = parsed.name ?? baseName;
    artifactsDir = resolveArtifactsDir(parsed, scriptName, options?.artifactsDir);

    const trace = parsed.trace ?? {};
    const saveCast = trace.saveCast ?? true;
    const saveReport = trace.saveReport ?? true;
    castPath = saveCast
      ? resolveArtifactPath(artifactsDir, trace.castPath ?? `${scriptName}.cast`)
      : undefined;
    reportPath = saveReport
      ? resolveArtifactPath(artifactsDir, trace.reportPath ?? `${scriptName}.report.html`)
      : undefined;

    try {
      await runScript(parsed, {
        artifactsDir,
        updateGoldens: options?.updateGoldens,
        steps: mergedSteps,
      });

      return { ok: true, scriptName, artifactsDir, castPath, reportPath };
    } catch (error) {
      return {
        ok: false,
        error: (error as Error).message,
        scriptName,
        artifactsDir,
        castPath,
        reportPath,
        failureArtifacts: {
          lastTextPath: resolveArtifactPath(artifactsDir, "failure.last.txt"),
          lastViewPath: resolveArtifactPath(artifactsDir, "failure.last.view.txt"),
          stepPath: resolveArtifactPath(artifactsDir, "failure.step.json"),
          errorPath: resolveArtifactPath(artifactsDir, "failure.error.txt"),
        },
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: (error as Error).message,
      scriptName,
      artifactsDir,
      castPath,
      reportPath,
    };
  }
}

async function loadScriptInput(
  scriptPath: string,
  ext: string,
): Promise<{ script: unknown; steps?: Record<string, CustomStepHandler> }> {
  if (ext === ".json") {
    const raw = await Bun.file(scriptPath).text();
    return { script: JSON.parse(raw) as unknown };
  }

  const loaded = await loadScriptModule(scriptPath);
  const script = loaded.script;
  if (
    script &&
    typeof script === "object" &&
    "build" in script &&
    typeof (script as { build?: unknown }).build === "function"
  ) {
    return { script: (script as { build: () => unknown }).build(), steps: loaded.steps };
  }
  return { script, steps: loaded.steps };
}

function resolveArtifactsDir(script: Script, scriptName: string, override?: string): string {
  if (override?.trim()) return resolve(override.trim());
  if (script.artifactsDir?.trim()) return resolve(script.artifactsDir.trim());
  return resolve(".tmp", "runs", scriptName);
}

function resolveArtifactPath(artifactsDir: string, path: string): string {
  if (isAbsolute(path)) return path;
  return resolve(artifactsDir, path);
}
