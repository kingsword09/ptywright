export function renderSnapshotDiff(expected: string, received: string): string {
  const expectedLines = expected.split("\n");
  const receivedLines = received.split("\n");
  const max = Math.max(expectedLines.length, receivedLines.length);
  const out = ["--- expected", "+++ received"];

  for (let i = 0; i < max; i += 1) {
    const before = expectedLines[i];
    const after = receivedLines[i];
    if (before === after) {
      if (before !== undefined) out.push(`  ${before}`);
      continue;
    }
    if (before !== undefined) out.push(`- ${before}`);
    if (after !== undefined) out.push(`+ ${after}`);
  }

  return out.join("\n") + "\n";
}
