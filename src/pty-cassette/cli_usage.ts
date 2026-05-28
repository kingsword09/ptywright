export function ptyUsage(): string {
  return [
    "ptywright pty <command>",
    "",
    "Commands:",
    "  pty record --out <file> -- <command> [args...]  Record a raw PTY cassette",
    "  pty replay <file>                               Replay recorded PTY output",
    "  pty inspect <file>                              Print cassette summary",
    "  pty validate <file>                             Validate cassette schema",
    "",
    "Record options:",
    "  --out <file>             Output cassette JSON path",
    "  --cols <n>               Terminal columns (default: stdout cols or 80)",
    "  --rows <n>               Terminal rows (default: stdout rows or 24)",
    "  --term <name>            TERM/name value (default: xterm-256color)",
    "  --cwd <dir>              Child working directory (default: cwd)",
    "  --backend <name>         auto|bun-terminal|bun-pty",
    "  --env KEY=VALUE          Add/override child env (repeatable)",
    "",
    "Replay/inspect/validate options:",
    "  --speed <n>              Replay timing multiplier; 0 means instant (default: 0)",
    "  --json                   Print machine-readable output",
  ].join("\n");
}

export function isPtyHelpArg(arg: string | undefined): boolean {
  return arg === "-h" || arg === "--help" || arg === "help";
}
