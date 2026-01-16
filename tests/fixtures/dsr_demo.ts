export {};

function waitForCursorResponse(timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let buffer = "";

    const timeout = setTimeout(() => {
      cleanup();
      resolve(null);
    }, timeoutMs);

    const cleanup = () => {
      clearTimeout(timeout);
      process.stdin.off("data", onData);
      try {
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
      } catch {
        // ignore
      }
    };

    const esc = String.fromCharCode(27);
    const re = new RegExp(`${esc}\\[(\\d+);(\\d+)R`);

    const onData = (chunk: string) => {
      buffer += chunk;
      const match = buffer.match(re);
      if (!match) return;
      cleanup();
      resolve(`${match[1]},${match[2]}`);
    };

    process.stdin.setEncoding("utf8");
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.on("data", onData);
    process.stdin.resume();
  });
}

process.stdout.write("\x1b[H\x1b[2J");
process.stdout.write("QUERY\n");
process.stdout.write("\x1b[6n");

const resp = await waitForCursorResponse(1000);
if (!resp) {
  process.stdout.write("NO_RESP\nDONE\n");
} else {
  process.stdout.write(`RESP:${resp}\nDONE\n`);
}
