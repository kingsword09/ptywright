import { runScriptPath } from "./path";

function parseArgs(argv: string[]): {
  scriptPath: string;
  artifactsDir?: string;
  stepsPath?: string;
  updateGoldens: boolean;
} {
  const out: {
    scriptPath?: string;
    artifactsDir?: string;
    stepsPath?: string;
    updateGoldens: boolean;
  } = {
    updateGoldens: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (!out.scriptPath && arg && !arg.startsWith("-")) {
      out.scriptPath = arg;
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

  if (!out.scriptPath) {
    throw new Error(
      "Usage: bun run src/script/run.ts <file> [--artifacts-dir <dir>] [--steps <module.ts>] [--update-goldens]",
    );
  }

  return out as {
    scriptPath: string;
    artifactsDir?: string;
    stepsPath?: string;
    updateGoldens: boolean;
  };
}

function logLines(lines: Array<string | null | undefined>, stderr: boolean): void {
  const filtered = lines.map((l) => l?.trim()).filter(Boolean) as string[];
  for (const line of filtered) {
    // eslint-disable-next-line no-console
    (stderr ? console.error : console.log)(line);
  }
}

if (import.meta.main) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const result = await runScriptPath(args.scriptPath, {
      artifactsDir: args.artifactsDir,
      updateGoldens: args.updateGoldens,
      stepsPath: args.stepsPath,
    });

    if (!result.ok) {
      logLines(
        [
          result.error,
          result.artifactsDir ? `artifacts=${result.artifactsDir}` : null,
          result.reportPath ? `report=${result.reportPath}` : null,
          result.castPath ? `cast=${result.castPath}` : null,
          result.failureArtifacts?.lastViewPath
            ? `last=${result.failureArtifacts.lastViewPath}`
            : null,
          result.failureArtifacts?.errorPath ? `error=${result.failureArtifacts.errorPath}` : null,
        ],
        true,
      );
      process.exitCode = 1;
    } else {
      logLines(
        [
          `ok artifacts=${result.artifactsDir}`,
          result.reportPath ? `report=${result.reportPath}` : null,
          result.castPath ? `cast=${result.castPath}` : null,
        ],
        false,
      );
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
