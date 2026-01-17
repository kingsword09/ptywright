import { basename, extname, isAbsolute, resolve } from "node:path";

import { loadScenarioModule, loadStepHandlersModule } from "./module";
import { runScenario } from "./runner";
import type { CustomStepHandler } from "./runner";
import { scenarioSchema } from "./schema";
import type { Scenario } from "./schema";

export type RunScenarioPathOptions = {
  artifactsDir?: string;
  updateGoldens?: boolean;
  stepsPath?: string;
};

export type RunScenarioPathSuccess = {
  ok: true;
  scenarioName: string;
  artifactsDir: string;
  castPath?: string;
  reportPath?: string;
};

export type RunScenarioPathFailure = {
  ok: false;
  error: string;
  scenarioName?: string;
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

export type RunScenarioPathResult = RunScenarioPathSuccess | RunScenarioPathFailure;

export async function runScenarioPath(
  scenarioPath: string,
  options?: RunScenarioPathOptions,
): Promise<RunScenarioPathResult> {
  let scenarioName: string | undefined;
  let artifactsDir: string | undefined;
  let castPath: string | undefined;
  let reportPath: string | undefined;

  try {
    const ext = extname(scenarioPath).toLowerCase();
    const baseName = basename(scenarioPath, extname(scenarioPath));

    const extraSteps = options?.stepsPath
      ? (await loadStepHandlersModule(options.stepsPath)).steps
      : undefined;

    const loaded = await loadScenarioInput(scenarioPath, ext);
    const stepsFromModule = loaded.steps;
    const mergedSteps =
      stepsFromModule && extraSteps
        ? { ...stepsFromModule, ...extraSteps }
        : (stepsFromModule ?? extraSteps);

    const built = loaded.scenario;
    const withName =
      built && typeof built === "object" && !Array.isArray(built) && !("name" in built)
        ? { ...built, name: baseName }
        : built;

    const parsed = scenarioSchema.parse(withName) as Scenario;
    scenarioName = parsed.name ?? baseName;
    artifactsDir = resolveArtifactsDir(parsed, scenarioName, options?.artifactsDir);

    const trace = parsed.trace ?? {};
    const saveCast = trace.saveCast ?? true;
    const saveReport = trace.saveReport ?? true;
    castPath = saveCast
      ? resolveArtifactPath(artifactsDir, trace.castPath ?? `${scenarioName}.cast`)
      : undefined;
    reportPath = saveReport
      ? resolveArtifactPath(artifactsDir, trace.reportPath ?? `${scenarioName}.report.html`)
      : undefined;

    try {
      await runScenario(parsed, {
        artifactsDir,
        updateGoldens: options?.updateGoldens,
        steps: mergedSteps,
      });

      return { ok: true, scenarioName, artifactsDir, castPath, reportPath };
    } catch (error) {
      return {
        ok: false,
        error: (error as Error).message,
        scenarioName,
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
      scenarioName,
      artifactsDir,
      castPath,
      reportPath,
    };
  }
}

async function loadScenarioInput(
  scenarioPath: string,
  ext: string,
): Promise<{ scenario: unknown; steps?: Record<string, CustomStepHandler> }> {
  if (ext === ".json") {
    const raw = await Bun.file(scenarioPath).text();
    return { scenario: JSON.parse(raw) as unknown };
  }

  const loaded = await loadScenarioModule(scenarioPath);
  const scenario = loaded.scenario;
  if (
    scenario &&
    typeof scenario === "object" &&
    "build" in scenario &&
    typeof (scenario as { build?: unknown }).build === "function"
  ) {
    return { scenario: (scenario as { build: () => unknown }).build(), steps: loaded.steps };
  }
  return { scenario, steps: loaded.steps };
}

function resolveArtifactsDir(scenario: Scenario, scenarioName: string, override?: string): string {
  if (override?.trim()) return resolve(override.trim());
  if (scenario.artifactsDir?.trim()) return resolve(scenario.artifactsDir.trim());
  return resolve(".tmp", "runs", scenarioName);
}

function resolveArtifactPath(artifactsDir: string, path: string): string {
  if (isAbsolute(path)) return path;
  return resolve(artifactsDir, path);
}
