export function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function sameArgv(left: readonly string[], right: readonly string[]): boolean {
  return sameStringList(left, right);
}

export type CommandArgvMap = Record<string, { argv: readonly string[] }>;

export function diffCommandMaps(args: {
  actual: CommandArgvMap;
  expected: CommandArgvMap;
  onNameMismatch: (expectedNames: readonly string[]) => string;
  onArgvMismatch: (name: string, expectedArgv: readonly string[]) => string;
}): string[] {
  const failures: string[] = [];
  const actualNames = Object.keys(args.actual).sort();
  const expectedNames = Object.keys(args.expected).sort();
  if (!sameStringList(actualNames, expectedNames)) {
    failures.push(args.onNameMismatch(expectedNames));
  }

  for (const [name, command] of Object.entries(args.expected)) {
    const actualCommand = args.actual[name];
    if (!actualCommand) continue;
    if (!sameArgv(actualCommand.argv, command.argv)) {
      failures.push(args.onArgvMismatch(name, command.argv));
    }
  }

  return failures;
}
