import { runScenarioFile } from "./runner";

function parseArgs(argv: string[]): {
  scenarioPath: string;
  artifactsDir?: string;
  updateGoldens: boolean;
} {
  const out: { scenarioPath?: string; artifactsDir?: string; updateGoldens: boolean } = {
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

    if (arg === "--update-goldens") {
      out.updateGoldens = true;
      continue;
    }

    throw new Error(`unknown arg: ${arg ?? ""}`);
  }

  if (!out.scenarioPath) {
    throw new Error(
      "Usage: bun run src/scenario/run.ts <scenario.json> [--artifacts-dir <dir>] [--update-goldens]",
    );
  }

  return out as { scenarioPath: string; artifactsDir?: string; updateGoldens: boolean };
}

if (import.meta.main) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await runScenarioFile(args.scenarioPath, {
      artifactsDir: args.artifactsDir,
      updateGoldens: args.updateGoldens,
    });
    // eslint-disable-next-line no-console
    console.log(`ok artifacts=${result.artifactsDir}`);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
