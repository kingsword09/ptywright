import type { RunAllScriptsResult } from "./run_all";

export function parseRunAllArgs(argv: string[]): {
  dir?: string;
  artifactsRoot?: string;
  stepsPath?: string;
  updateGoldens: boolean;
} {
  const out: {
    dir?: string;
    artifactsRoot?: string;
    stepsPath?: string;
    updateGoldens: boolean;
  } = { updateGoldens: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (!out.dir && arg && !arg.startsWith("-")) {
      out.dir = arg;
      continue;
    }

    if (arg === "--dir" && next) {
      out.dir = next;
      i += 1;
      continue;
    }

    if (arg === "--artifacts-root" && next) {
      out.artifactsRoot = next;
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

  return out;
}

export function printRunAllCliResult(result: RunAllScriptsResult): number {
  const failures = result.entries.filter((e) => !e.result.ok);

  if (failures.length === 0) {
    // eslint-disable-next-line no-console
    console.log(
      `ok count=${result.entries.length} dir=${result.dir}\nreport=${result.reportPath}\nsummary=${result.summaryPath}`,
    );
    return 0;
  }

  // eslint-disable-next-line no-console
  console.error(
    `failed count=${failures.length}/${result.entries.length} dir=${result.dir}\nreport=${result.reportPath}\nsummary=${result.summaryPath}`,
  );
  for (const f of failures) {
    if (f.result.ok) continue;
    // eslint-disable-next-line no-console
    console.error(`- ${f.filePath}: ${f.result.error}`);
    if (f.result.failureArtifacts) {
      // eslint-disable-next-line no-console
      console.error(`  artifacts=${f.result.artifactsDir ?? ""}`);
      // eslint-disable-next-line no-console
      console.error(`  last=${f.result.failureArtifacts.lastViewPath}`);
      // eslint-disable-next-line no-console
      console.error(`  error=${f.result.failureArtifacts.errorPath}`);
    }
  }

  return 1;
}
