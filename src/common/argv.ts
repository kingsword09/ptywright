export function formatArgv(argv: readonly string[]): string {
  return argv.map(formatArg).join(" ");
}

function formatArg(arg: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(arg)) return arg;
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
