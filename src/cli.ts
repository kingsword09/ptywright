import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import type { PtywrightCapability } from "./mcp/server";
import { createPtywrightServer } from "./mcp/server";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { checkAgentRegression, formatAgentCheckJson, formatAgentCheckLines } from "./agent/check";
import {
  formatAgentArtifactCommandLines,
  readAgentArtifactCommandsPath,
  selectAgentArtifactCommand,
  validateAgentCommandArgv,
  validateAgentManifestCommandTargets,
} from "./agent/commands";
import { readAgentManifestPath, validateAgentManifestFiles } from "./agent/manifest";
import { formatAgentInspectLines, inspectAgentArtifactPath } from "./agent/inspect";
import { createAgentTemplateSpec, type AgentFlavor } from "./agent/presets";
import {
  formatAgentPromoteLines,
  formatAgentPromoteSummary,
  promoteAgentCassette,
} from "./agent/promote";
import { recordAgentSpecPath } from "./agent/recorder";
import { formatAgentReplaySummary, replayAllAgentRecords } from "./agent/replay_all";
import { rerunAgentSummary } from "./agent/rerun";
import { readAgentRunRecordPath } from "./agent/run_record";
import { replayAgentRecordPath, runAgentSpecPath } from "./agent/runner";
import { validateAgentArtifactsPath } from "./agent/validate";
import { startPtywrightHttpServer } from "./mcp/http_server";
import { cmdPty } from "./pty-cassette/cli";
import {
  formatScriptArtifactCommandLines,
  readScriptArtifactCommandsPath,
  selectScriptArtifactCommand,
  validateScriptCommandArgv,
} from "./script/commands";
import { formatScriptInspectLines, inspectScriptArtifactPath } from "./script/inspect";
import {
  readScriptManifestPath,
  resolveScriptManifestPath,
  SCRIPT_MANIFEST_FILE_NAME,
  validateScriptManifest,
} from "./script/manifest";
import { runAllScripts } from "./script/run_all";
import { runScriptPath } from "./script/path";
import { readScriptRunSummaryPath, resolveScriptRunSummaryPath } from "./script/summary";

function usage(): string {
  return [
    "ptywright <command>",
    "",
    "Commands:",
    "  mcp                 Start the MCP server over stdio (default)",
    "  mcp-http            Start the MCP server over Streamable HTTP",
    "  agent run <file>    Run a browser-hosted terminal-agent flow",
    "  agent record <file> --out <file>  Record browser interactions into a flow",
    "  agent replay <run>  Replay a recorded terminal-agent flow without AI",
    "  agent promote <run> Promote a run/cassette into the committed cassette suite",
    "  agent replay-all [dir]  Replay all agent cassettes/run records in a directory",
    "  agent rerun <summary>  Rerun from agent replay/check/promote summary metadata",
    "  agent commands <artifact>  Print replay/update argv from an agent artifact",
    "  agent inspect <artifact|dir>  Inspect validation, files, and commands for an agent artifact",
    "  agent exec <artifact> --command <name>  Execute one command from an agent artifact",
    "  agent check [dir]  Validate and replay committed agent cassettes",
    "  agent validate <path>  Validate agent flow/cassette/run-record/summary artifacts",
    "  agent init <flavor> <file>  Write a starter agent flow spec",
    "  pty record --out <file> -- <command> [args...]  Record a raw PTY cassette",
    "  pty replay <file>     Replay a raw PTY cassette without rerunning the command",
    "  pty inspect <file>    Inspect a raw PTY cassette",
    "  pty validate <file>   Validate a raw PTY cassette",
    "  run <file>           Run one script (JSON/TS) and write artifacts",
    "  run-all [dir]        Run all scripts in a directory and write a suite report",
    "  script commands <summary|dir>  Print replay/update argv from a script run summary",
    "  script inspect <summary|dir>  Inspect validation, files, and commands for a script artifact",
    "  script exec <summary|dir> --command <name>  Execute one command from a script summary",
    "  script validate <summary|dir>  Validate a script run summary artifact",
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
    "Script artifact options:",
    "  --command <name>         Select a reusable command (runAll|updateGoldens)",
    "  --json                   Print machine-readable script artifact output",
    "",
    "Agent options:",
    "  --artifacts-dir <dir>    Override agent run artifact directory",
    "  --cassette-dir <dir>     Committed cassette directory for promote/check",
    "  --snapshot-dir <dir>     Snapshot directory for promoted cassettes",
    "  --out <file>             Output path for agent record",
    "  --duration-ms <ms>       Recording window duration",
    "  --artifacts-root <dir>   Override agent replay-all artifact root",
    "  --command <name>          Print one agent artifact command by name",
    "  --update-snapshots       Update terminal/DOM snapshots",
    "  --headed                 Show the browser while running",
    "  --json                   Print machine-readable agent check output",
    "",
    "PTY cassette options:",
    "  --out <file>             Output cassette JSON path",
    "  --cols <n> / --rows <n>  Terminal size for recording",
    "  --term <name>            TERM/name value (default: xterm-256color)",
    "  --backend <name>         auto|bun-terminal|bun-pty",
    "  --speed <n>              Replay timing multiplier; 0 means instant",
    "",
    "MCP options:",
    "  --caps <list>            Capabilities: all|core|debug|script|recording",
    "",
    "MCP HTTP options (mcp-http):",
    "  --host <host>            Bind host (default: 127.0.0.1)",
    "  --port <port>            Bind port (default: 3000)",
    "  --allowed-origins <list> Comma/space separated Origin allowlist",
    "  --no-cors                Disable CORS headers",
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

async function cmdMcpHttp(argv: string[]): Promise<void> {
  let capabilities: PtywrightCapability[] | undefined;
  let hostname: string | undefined;
  let port: number | undefined;
  let allowedOrigins: string[] | undefined;
  let cors = true;

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

    if ((arg === "--host" || arg === "--hostname") && next) {
      hostname = next;
      i += 1;
      continue;
    }

    if (arg === "--port" && next) {
      const value = Number.parseInt(next, 10);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`invalid --port: ${next}`);
      }
      port = value;
      i += 1;
      continue;
    }

    if (arg === "--allowed-origins" && next) {
      allowedOrigins = next
        .split(/[\s,]+/g)
        .map((v) => v.trim())
        .filter(Boolean);
      i += 1;
      continue;
    }

    if (arg === "--no-cors") {
      cors = false;
      continue;
    }

    throw new Error(`unknown arg: ${arg ?? ""}`);
  }

  const handle = await startPtywrightHttpServer({
    hostname,
    port,
    capabilities,
    allowedOrigins,
    cors,
  });

  // eslint-disable-next-line no-console
  console.log(`listening ${handle.url}`);
  // eslint-disable-next-line no-console
  console.log(`health http://${handle.hostname}:${handle.port}/health`);

  function shutdown(): void {
    void handle.close();
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

function parseScriptArgs(argv: string[]): {
  mode: "commands" | "exec" | "inspect" | "validate";
  path: string;
  commandName?: string;
  json: boolean;
} {
  const [mode, ...rest] = argv;
  if (mode !== "commands" && mode !== "exec" && mode !== "inspect" && mode !== "validate") {
    throw new Error("missing script subcommand: commands|inspect|exec|validate\n\n" + usage());
  }

  const out: {
    path?: string;
    commandName?: string;
    json: boolean;
  } = { json: false };

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    const next = rest[i + 1];

    if (!out.path && arg && !arg.startsWith("-")) {
      out.path = arg;
      continue;
    }

    if (arg === "--command" && next) {
      out.commandName = next;
      i += 1;
      continue;
    }

    if (arg === "--json") {
      out.json = true;
      continue;
    }

    throw new Error(`unknown arg: ${arg ?? ""}`);
  }

  if (!out.path) {
    const expected = mode === "validate" ? "<summary|dir>" : "<artifact>";
    throw new Error(`missing ${expected} for script ${mode}\n\n` + usage());
  }

  if (mode === "exec" && !out.commandName) {
    throw new Error(`missing --command <name> for script exec\n\n` + usage());
  }

  return {
    mode,
    path: out.path,
    commandName: out.commandName,
    json: out.json,
  };
}

async function cmdScript(argv: string[]): Promise<number> {
  const args = parseScriptArgs(argv);

  if (args.mode === "validate") {
    const manifestPath = resolveScriptManifestPath(args.path);
    const hasManifest = manifestPath.endsWith(SCRIPT_MANIFEST_FILE_NAME)
      ? readOptionalScriptManifest(manifestPath)
      : null;
    const summaryPath = hasManifest
      ? resolveScriptRunSummaryPath(hasManifest.primaryPath)
      : resolveScriptRunSummaryPath(args.path);
    if (hasManifest) validateScriptManifest(hasManifest, manifestPath);
    const summary = readScriptRunSummaryPath(summaryPath);
    if (args.json) {
      logLines(
        [
          JSON.stringify(
            {
              ok: true,
              kind: hasManifest ? "manifest" : "run-summary",
              path: summaryPath,
              manifestPath: hasManifest ? manifestPath : undefined,
              totalCount: summary.totalCount,
              failureCount: summary.failureCount,
            },
            null,
            2,
          ),
        ],
        false,
      );
    } else {
      logLines(
        [
          "ok script-summary",
          `path=${summaryPath}`,
          hasManifest ? `manifest=${manifestPath}` : null,
          `count=${summary.totalCount}`,
          `failures=${summary.failureCount}`,
        ],
        false,
      );
    }
    return 0;
  }

  if (args.mode === "inspect") {
    const result = inspectScriptArtifactPath(args.path);
    if (args.json) {
      logLines([JSON.stringify(result, null, 2)], false);
    } else {
      logLines(formatScriptInspectLines(result), false);
    }
    return 0;
  }

  const result = readScriptArtifactCommandsPath(args.path);
  if (args.mode === "commands") {
    if (args.commandName) {
      const selected = selectScriptArtifactCommand(result, args.commandName);
      if (args.json) {
        logLines([JSON.stringify(selected, null, 2)], false);
      } else {
        logLines([selected.shell], false);
      }
      return 0;
    }

    if (args.json) {
      logLines([JSON.stringify(result, null, 2)], false);
    } else {
      logLines(formatScriptArtifactCommandLines(result), false);
    }
    return 0;
  }

  const selected = selectScriptArtifactCommand(result, args.commandName!);
  const commandArgv = selected.command.argv;
  validateScriptCommandArgv(commandArgv, selected.name);
  const [, subcommand, ...rest] = commandArgv;
  if (subcommand === "run-all") {
    return cmdRunAll(rest);
  }

  throw new Error(`unsupported script artifact command: ${subcommand ?? ""}`);
}

function readOptionalScriptManifest(
  path: string,
): ReturnType<typeof readScriptManifestPath> | null {
  try {
    return readScriptManifestPath(path);
  } catch {
    return null;
  }
}

function parseAgentArgs(argv: string[]): {
  mode:
    | "run"
    | "replay"
    | "promote"
    | "replay-all"
    | "rerun"
    | "commands"
    | "inspect"
    | "exec"
    | "init"
    | "record"
    | "validate"
    | "check";
  path?: string;
  flavor?: AgentFlavor;
  artifactsDir?: string;
  artifactsRoot?: string;
  cassetteDir?: string;
  snapshotDir?: string;
  outPath?: string;
  durationMs?: number;
  commandName?: string;
  updateSnapshots: boolean;
  headed: boolean;
  json: boolean;
} {
  const [mode, ...rest] = argv;
  if (
    mode !== "run" &&
    mode !== "replay" &&
    mode !== "promote" &&
    mode !== "replay-all" &&
    mode !== "rerun" &&
    mode !== "commands" &&
    mode !== "inspect" &&
    mode !== "exec" &&
    mode !== "init" &&
    mode !== "record" &&
    mode !== "validate" &&
    mode !== "check"
  ) {
    throw new Error(
      "missing agent subcommand: run|record|replay|promote|replay-all|rerun|commands|inspect|exec|check|validate|init\n\n" +
        usage(),
    );
  }

  const out: {
    path?: string;
    flavor?: AgentFlavor;
    artifactsDir?: string;
    artifactsRoot?: string;
    cassetteDir?: string;
    snapshotDir?: string;
    outPath?: string;
    durationMs?: number;
    commandName?: string;
    updateSnapshots: boolean;
    headed: boolean;
    json: boolean;
  } = { updateSnapshots: false, headed: false, json: false };

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    const next = rest[i + 1];

    if (mode === "init" && !out.flavor && arg && !arg.startsWith("-")) {
      out.flavor = parseAgentFlavor(arg);
      continue;
    }

    if (arg === "--artifacts-root" && next) {
      out.artifactsRoot = next;
      i += 1;
      continue;
    }

    if ((arg === "--cassette-dir" || arg === "--dir") && next) {
      out.cassetteDir = next;
      i += 1;
      continue;
    }

    if (arg === "--snapshot-dir" && next) {
      out.snapshotDir = next;
      i += 1;
      continue;
    }

    if (!out.path && arg && !arg.startsWith("-")) {
      out.path = arg;
      continue;
    }

    if (arg === "--artifacts-dir" && next) {
      out.artifactsDir = next;
      i += 1;
      continue;
    }

    if (arg === "--out" && next) {
      out.outPath = next;
      i += 1;
      continue;
    }

    if (arg === "--duration-ms" && next) {
      const value = Number.parseInt(next, 10);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`invalid --duration-ms: ${next}`);
      }
      out.durationMs = value;
      i += 1;
      continue;
    }

    if (arg === "--command" && next) {
      out.commandName = next;
      i += 1;
      continue;
    }

    if (arg === "--update-snapshots") {
      out.updateSnapshots = true;
      continue;
    }

    if (arg === "--headed") {
      out.headed = true;
      continue;
    }

    if (arg === "--json") {
      out.json = true;
      continue;
    }

    throw new Error(`unknown arg: ${arg ?? ""}`);
  }

  if (mode === "init" && !out.flavor) {
    throw new Error(`missing <flavor> for agent init\n\n` + usage());
  }

  if (!out.path && mode !== "replay-all" && mode !== "check") {
    const expected =
      mode === "rerun"
        ? "<summary>"
        : mode === "commands" || mode === "inspect" || mode === "exec"
          ? "<artifact>"
          : "<file>";
    throw new Error(`missing ${expected} for agent ${mode}\n\n` + usage());
  }

  if (mode === "record" && !out.outPath) {
    throw new Error(`missing --out <file> for agent record\n\n` + usage());
  }

  if (mode === "exec" && !out.commandName) {
    throw new Error(`missing --command <name> for agent exec\n\n` + usage());
  }

  return {
    mode,
    path: out.path,
    flavor: out.flavor,
    artifactsDir: out.artifactsDir,
    artifactsRoot: out.artifactsRoot,
    cassetteDir: out.cassetteDir,
    snapshotDir: out.snapshotDir,
    outPath: out.outPath,
    durationMs: out.durationMs,
    commandName: out.commandName,
    updateSnapshots: out.updateSnapshots,
    headed: out.headed,
    json: out.json,
  };
}

async function cmdAgent(argv: string[]): Promise<number> {
  const args = parseAgentArgs(argv);
  if (args.mode === "init") {
    const spec = createAgentTemplateSpec(args.flavor ?? "generic");
    const path = args.path!;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify(
        {
          $schema: "../schemas/ptywright-agent.schema.json",
          ...spec,
        },
        null,
        2,
      ) + "\n",
      "utf8",
    );
    logLines([`ok wrote ${path}`], false);
    return 0;
  }

  if (args.mode === "record") {
    const result = await recordAgentSpecPath(args.path!, {
      outPath: args.outPath!,
      durationMs: args.durationMs,
      headless: !args.headed,
    });
    logLines(
      [
        `${result.ok ? "ok" : "failed"} record=${result.outPath}`,
        `steps=${result.stepCount}`,
        result.url ? `url=${result.url}` : null,
        result.error ? `error=${result.error}` : null,
      ],
      !result.ok,
    );
    return result.ok ? 0 : 1;
  }

  if (args.mode === "validate") {
    const result = await validateAgentArtifactsPath(args.path!, { preferManifestBundle: true });
    if (args.json) {
      logLines([JSON.stringify(result, null, 2)], false);
      return result.ok ? 0 : 1;
    }

    const failures = result.entries.filter((entry) => !entry.ok);
    logLines(
      [
        `${result.ok ? "ok" : "failed"} count=${result.totalCount} path=${result.path}`,
        result.failureCount > 0 ? `failures=${result.failureCount}` : null,
        ...failures.flatMap((entry) => [
          `- ${entry.filePath}`,
          `  kind=${entry.kind}`,
          entry.error ? `  error=${entry.error}` : null,
        ]),
      ],
      !result.ok,
    );
    return result.ok ? 0 : 1;
  }

  if (args.mode === "commands") {
    const result = await readAgentArtifactCommandsPath(args.path!);
    const manifestPath = result.kind === "manifest" ? result.path : result.manifestPath;
    if (manifestPath) {
      const manifest = readAgentManifestPath(manifestPath);
      validateAgentManifestCommandTargets(manifest, manifestPath);
      validateAgentManifestFiles(manifest, manifestPath);
    }
    if (args.commandName) {
      const selected = selectAgentArtifactCommand(result, args.commandName);
      if (args.json) {
        logLines([JSON.stringify(selected, null, 2)], false);
      } else {
        logLines([selected.shell], false);
      }
      return 0;
    }

    if (args.json) {
      logLines([JSON.stringify(result, null, 2)], false);
    } else {
      logLines(formatAgentArtifactCommandLines(result), false);
    }
    return 0;
  }

  if (args.mode === "inspect") {
    const result = await inspectAgentArtifactPath(args.path!);
    if (args.json) {
      logLines([JSON.stringify(result, null, 2)], false);
    } else {
      logLines(formatAgentInspectLines(result), !result.ok);
    }
    return result.ok ? 0 : 1;
  }

  if (args.mode === "exec") {
    const result = await readAgentArtifactCommandsPath(args.path!);
    const manifestPath = result.kind === "manifest" ? result.path : result.manifestPath;
    if (manifestPath) {
      const manifest = readAgentManifestPath(manifestPath);
      validateAgentManifestCommandTargets(manifest, manifestPath);
      validateAgentManifestFiles(manifest, manifestPath);
    }
    const selected = selectAgentArtifactCommand(result, args.commandName!);
    const argv = selected.command.argv;
    validateAgentCommandArgv(argv, selected.name);
    const [, , subcommand, ...rest] = argv;
    return cmdAgent([subcommand ?? "", ...rest]);
  }

  if (args.mode === "check") {
    const result = await checkAgentRegression({
      cassetteDir: args.path ?? args.cassetteDir,
      artifactsRoot: args.artifactsRoot,
      headless: !args.headed,
      updateSnapshots: args.updateSnapshots,
    });
    if (args.json) {
      logLines([JSON.stringify(formatAgentCheckJson(result), null, 2)], false);
    } else {
      logLines(formatAgentCheckLines(result), !result.ok);
    }
    return result.ok ? 0 : 1;
  }

  if (args.mode === "promote") {
    const result = await promoteAgentCassette({
      sourcePath: args.path!,
      cassetteDir: args.cassetteDir,
      snapshotDir: args.snapshotDir,
      artifactsRoot: args.artifactsRoot,
      headless: !args.headed,
      updateSnapshots: args.updateSnapshots,
    });
    if (args.json) {
      logLines([JSON.stringify(formatAgentPromoteSummary(result), null, 2)], false);
    } else {
      logLines(formatAgentPromoteLines(result), !result.ok);
    }
    return result.ok ? 0 : 1;
  }

  if (args.mode === "rerun") {
    const rerun = await rerunAgentSummary({
      path: args.path!,
      artifactsRoot: args.artifactsRoot,
      headless: !args.headed,
      updateSnapshots: args.updateSnapshots,
    });

    if (rerun.kind === "check-summary") {
      if (args.json) {
        logLines([JSON.stringify(formatAgentCheckJson(rerun.result), null, 2)], false);
      } else {
        logLines(formatAgentCheckLines(rerun.result), !rerun.result.ok);
      }
      return rerun.result.ok ? 0 : 1;
    }

    if (rerun.kind === "promote-summary") {
      if (args.json) {
        logLines([JSON.stringify(formatAgentPromoteSummary(rerun.result), null, 2)], false);
      } else {
        logLines(formatAgentPromoteLines(rerun.result), !rerun.result.ok);
      }
      return rerun.result.ok ? 0 : 1;
    }

    const failures = rerun.result.entries.filter((entry) => !entry.result.ok);
    if (args.json) {
      logLines([JSON.stringify(formatAgentReplaySummary(rerun.result), null, 2)], false);
      return failures.length === 0 ? 0 : 1;
    }

    logLines(
      [
        `${failures.length === 0 ? "ok" : "failed"} rerun=${rerun.kind}`,
        `count=${rerun.result.entries.length}`,
        `dir=${rerun.result.dir}`,
        `report=${rerun.result.reportPath}`,
        `summary=${rerun.result.summaryPath}`,
        ...failures.flatMap((entry) => [
          `- ${entry.filePath}`,
          ...entry.result.errors.map((error) => `  error=${error}`),
        ]),
      ],
      failures.length > 0,
    );
    return failures.length === 0 ? 0 : 1;
  }

  if (args.mode === "replay-all") {
    const result = await replayAllAgentRecords({
      dir: args.path,
      artifactsRoot: args.artifactsRoot,
      headless: !args.headed,
      updateSnapshots: args.updateSnapshots,
    });
    const failures = result.entries.filter((entry) => !entry.result.ok);
    if (args.json) {
      logLines([JSON.stringify(formatAgentReplaySummary(result), null, 2)], false);
      return failures.length === 0 ? 0 : 1;
    }

    if (failures.length === 0) {
      logLines(
        [
          `ok count=${result.entries.length} dir=${result.dir}`,
          `report=${result.reportPath}`,
          `summary=${result.summaryPath}`,
        ],
        false,
      );
      return 0;
    }

    logLines(
      [
        `failed count=${failures.length}/${result.entries.length} dir=${result.dir}`,
        `report=${result.reportPath}`,
        `summary=${result.summaryPath}`,
        ...failures.flatMap((entry) => [
          `- ${entry.filePath}`,
          ...entry.result.errors.map((error) => `  error=${error}`),
        ]),
      ],
      true,
    );
    return 1;
  }

  const options = {
    artifactsDir: args.artifactsDir,
    updateSnapshots: args.updateSnapshots,
    headless: !args.headed,
  };
  const result =
    args.mode === "run"
      ? await runAgentSpecPath(args.path!, options)
      : await replayAgentRecordPath(args.path!, options);

  if (args.json) {
    logLines([JSON.stringify(readAgentRunRecordPath(result.recordPath), null, 2)], false);
    return result.ok ? 0 : 1;
  }

  logLines(
    [
      `${result.ok ? "ok" : "failed"} agent=${result.name}`,
      `report=${result.reportPath}`,
      `record=${result.recordPath}`,
      `flow=${result.flowPath}`,
      `cassette=${result.cassettePath}`,
      `snapshots=${result.snapshotDir}`,
      `mode=${result.mode}`,
      `frames=${result.cassetteFrameCount}`,
      result.replayCommand ? `replay=${result.replayCommand}` : null,
      ...result.errors.map((error) => `error=${error}`),
    ],
    !result.ok,
  );

  return result.ok ? 0 : 1;
}

function parseAgentFlavor(value: string): AgentFlavor {
  if (value === "codex" || value === "claude" || value === "droid" || value === "generic") {
    return value;
  }
  if (value === "droidx") return "droid";
  throw new Error(`unknown agent flavor: ${value}`);
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

  if (command === "mcp-http") {
    await cmdMcpHttp(rest);
    return;
  }

  if (command === "agent") {
    process.exitCode = await cmdAgent(rest);
    return;
  }

  if (command === "pty") {
    process.exitCode = await cmdPty(rest);
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

  if (command === "script") {
    process.exitCode = await cmdScript(rest);
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
