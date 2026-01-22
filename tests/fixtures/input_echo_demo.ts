export {};

function cleanupAndExit(code: number): void {
  try {
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
  } catch {
    // ignore
  }
  process.exit(code);
}

process.stdout.write("READY\n");
process.stdout.write("Type a line and press Enter. Type 'quit' to exit.\n");

process.stdin.setEncoding("utf8");
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();

let buffer = "";

process.stdin.on("data", (chunk: string) => {
  for (const ch of chunk) {
    if (ch === "\x03") {
      process.stdout.write("CTRL_C\nDONE\n");
      cleanupAndExit(0);
      return;
    }

    if (ch === "\r" || ch === "\n") {
      const line = buffer;
      buffer = "";

      if (line.trim().toLowerCase() === "quit") {
        process.stdout.write("BYE\nDONE\n");
        cleanupAndExit(0);
        return;
      }

      process.stdout.write(`ECHO: ${line}\n`);
      continue;
    }

    // Handle backspace in raw mode
    if (ch === "\b" || ch === "\x7f") {
      buffer = buffer.slice(0, -1);
      continue;
    }

    buffer += ch;
  }
});

process.on("SIGTERM", () => cleanupAndExit(143));
process.on("SIGINT", () => cleanupAndExit(130));
