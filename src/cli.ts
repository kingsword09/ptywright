import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import type { PtywrightCapability } from "./mcp/server";
import { createPtywrightServer } from "./mcp/server";
import { runAllScripts } from "./script/run_all";
import { runScriptPath } from "./script/path";

function usage(): string {
  return [
    "ptywright <command>",
    "",
    "Commands:",
    "  mcp                 Start the MCP server over stdio (default)",
    "  run <file>           Run one script (JSON/TS) and write artifacts",
    "  run-all [dir]        Run all scripts in a directory and write a suite report",
    "  help                Show help",
    "",
    "Run options:",
    "  --artifacts-dir <dir>    Override artifacts directory",
    "  --steps <module.ts>      Inject custom step handlers",
    "  --update-goldens         Update golden snapshots",
    "",
    "Run-all options:",
    "  --dir <dir>              Directory to scan (default: scripts)",
    "  --artifacts-root <dir>   Suite artifacts root (default: .tmp/run-all)",
    "  --steps <module.ts>      Inject custom step handlers",
    "  --update-goldens         Update golden snapshots",
    "",
    "MCP options:",
    "  --caps <list>            Capabilities: all|core|debug|script|recording",
  ].join("\n");
}

function isHelp(arg: string | undefined): boolean {
  return arg === "-h" || arg === "--help" || arg === "help";
}

function logLines(lines: Array<string | null | undefined>, stderr: boolean): void {
  const filtered = lines.map((l) => l?.trim()).filter(Boolean) as string[];
  for (const line of filtered) {
    // eslint-disable-next-line no-console
    (stderr ? console.error : console.log)(line);
  }
}

function parseCaps(value: string): PtywrightCapability[] {
  const parts = value
    .split(/[\s,]+/g)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const out: PtywrightCapability[] = [];
  for (const p of parts) {
    if (p === "all") out.push("all");
    else if (p === "core") out.push("core");
    else if (p === "debug") out.push("debug");
    else if (p === "script" || p === "scripts" || p === "runner" || p === "run") out.push("script");
    else if (p === "recording" || p === "record" || p === "rec") out.push("recording");
    else throw new Error(`unknown capability: ${p}`);
  }
  return out;
}

function parseRunArgs(argv: string[]): {
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
  } = { updateGoldens: false };

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
    throw new Error("missing <file>\n\n" + usage());
  }

  return out as {
    scriptPath: string;
    artifactsDir?: string;
    stepsPath?: string;
    updateGoldens: boolean;
  };
}

function parseRunAllArgs(argv: string[]): {
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

  return out as {
    dir?: string;
    artifactsRoot?: string;
    stepsPath?: string;
    updateGoldens: boolean;
  };
}

async function cmdMcp(argv: string[]): Promise<void> {
  let capabilities: PtywrightCapability[] | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (isHelp(arg)) {
      // eslint-disable-next-line no-console
      console.log(usage());
      return;
    }

    if (arg === "--caps" && next) {
      capabilities = parseCaps(next);
      i += 1;
      continue;
    }

    throw new Error(`unknown arg: ${arg ?? ""}`);
  }

  const { server, sessions } = createPtywrightServer({ capabilities });
  const transport = new StdioServerTransport();
  await server.connect(transport);

  function shutdown(): void {
    sessions.closeAll();
    void server.close();
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function cmdRun(argv: string[]): Promise<number> {
  const args = parseRunArgs(argv);
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
    return 1;
  }

  logLines(
    [
      `ok artifacts=${result.artifactsDir}`,
      result.reportPath ? `report=${result.reportPath}` : null,
      result.castPath ? `cast=${result.castPath}` : null,
    ],
    false,
  );
  return 0;
}

async function cmdRunAll(argv: string[]): Promise<number> {
  const args = parseRunAllArgs(argv);
  const result = await runAllScripts({
    dir: args.dir,
    artifactsRoot: args.artifactsRoot,
    stepsPath: args.stepsPath,
    updateGoldens: args.updateGoldens,
  });

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

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;

  if (!command) {
    await cmdMcp([]);
    return;
  }

  if (isHelp(command)) {
    // eslint-disable-next-line no-console
    console.log(usage());
    return;
  }

  if (command === "mcp") {
    await cmdMcp(rest);
    return;
  }

  if (command === "run") {
    process.exitCode = await cmdRun(rest);
    return;
  }

  if (command === "run-all") {
    process.exitCode = await cmdRunAll(rest);
    return;
  }

  throw new Error(`unknown command: ${command}\n\n` + usage());
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
