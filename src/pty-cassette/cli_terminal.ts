export function terminalCols(fallback = 80): number {
  return process.stdout.columns && process.stdout.columns > 0 ? process.stdout.columns : fallback;
}

export function terminalRows(fallback = 24): number {
  return process.stdout.rows && process.stdout.rows > 0 ? process.stdout.rows : fallback;
}
