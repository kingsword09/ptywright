import { usage } from "./common";

export type RunCommandArgs = {
  scriptPath: string;
  artifactsDir?: string;
  stepsPath?: string;
  updateGoldens: boolean;
};

export type RunAllCommandArgs = {
  dir?: string;
  artifactsRoot?: string;
  stepsPath?: string;
  updateGoldens: boolean;
};

export type ScriptArtifactCommandArgs = {
  mode: "commands" | "exec" | "inspect" | "validate";
  path: string;
  commandName?: string;
  json: boolean;
};

export function parseRunArgs(argv: string[]): RunCommandArgs {
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

  return out as RunCommandArgs;
}

export function parseRunAllArgs(argv: string[]): RunAllCommandArgs {
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

  return out as RunAllCommandArgs;
}

export function parseScriptArgs(argv: string[]): ScriptArtifactCommandArgs {
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
