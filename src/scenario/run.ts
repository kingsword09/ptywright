import { basename, extname } from "node:path";

import { loadScenarioModule, loadStepHandlersModule } from "./module";
import { runScenario, runScenarioFile } from "./runner";

function parseArgs(argv: string[]): {
  scenarioPath: string;
  artifactsDir?: string;
  stepsPath?: string;
  updateGoldens: boolean;
} {
  const out: {
    scenarioPath?: string;
    artifactsDir?: string;
    stepsPath?: string;
    updateGoldens: boolean;
  } = {
    updateGoldens: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (!out.scenarioPath && arg && !arg.startsWith("-")) {
      out.scenarioPath = arg;
      continue;
    }

    if (arg === "--artifacts-dir" && next) {
      out.artifactsDir = next;
      i += 1;
      continue;
    }

    if (arg === "--steps" && next) {
      out.stepsPath = next;
      i += 1;
      continue;
    }

    if (arg === "--update-goldens") {
      out.updateGoldens = true;
      continue;
    }

    throw new Error(`unknown arg: ${arg ?? ""}`);
  }

  if (!out.scenarioPath) {
    throw new Error(
      "Usage: bun run src/scenario/run.ts <scenario.json|scenario.ts> [--artifacts-dir <dir>] [--steps <module.ts>] [--update-goldens]",
    );
  }

  return out as {
    scenarioPath: string;
    artifactsDir?: string;
    stepsPath?: string;
    updateGoldens: boolean;
  };
}

if (import.meta.main) {
  try {
    const args = parseArgs(process.argv.slice(2));

    const ext = extname(args.scenarioPath).toLowerCase();
    const baseName = basename(args.scenarioPath, extname(args.scenarioPath));
    const isJson = ext === ".json";

    const extraSteps = args.stepsPath
      ? (await loadStepHandlersModule(args.stepsPath)).steps
      : undefined;

    const result = isJson
      ? await runScenarioFile(args.scenarioPath, {
          artifactsDir: args.artifactsDir,
          updateGoldens: args.updateGoldens,
          steps: extraSteps,
        })
      : await (async () => {
          const loaded = await loadScenarioModule(args.scenarioPath);
          const built =
            loaded.scenario &&
            typeof loaded.scenario === "object" &&
            "build" in loaded.scenario &&
            typeof (loaded.scenario as { build?: unknown }).build === "function"
              ? (loaded.scenario as { build: () => unknown }).build()
              : loaded.scenario;

          const withName =
            built && typeof built === "object" && !Array.isArray(built) && !("name" in built)
              ? { ...built, name: baseName }
              : built;

          const mergedSteps =
            loaded.steps && extraSteps
              ? { ...loaded.steps, ...extraSteps }
              : (loaded.steps ?? extraSteps);

          return runScenario(withName, {
            artifactsDir: args.artifactsDir,
            updateGoldens: args.updateGoldens,
            steps: mergedSteps,
          });
        })();

    // eslint-disable-next-line no-console
    console.log(`ok artifacts=${result.artifactsDir}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
