process.stdin.setEncoding("utf8");

let promptCount = 0;

function renderPrompt(): void {
  promptCount += 1;
  process.stdout.write(`agent[${promptCount}]> `);
}

process.stdout.write("Deterministic Agent Ready\n");
process.stdout.write("Type help or status. Ctrl+C exits.\n");
renderPrompt();

let buffer = "";

process.stdin.on("data", (chunk) => {
  buffer += chunk;

  while (buffer.includes("\n")) {
    const index = buffer.indexOf("\n");
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);

    if (line === "help") {
      process.stdout.write("\nCommands: help, status, clear\n");
    } else if (line === "status") {
      process.stdout.write("\nStatus: stable\nMode: browser regression\n");
    } else if (line === "clear") {
      process.stdout.write("\x1b[2J\x1b[H");
      process.stdout.write("Deterministic Agent Ready\n");
    } else if (line.length > 0) {
      process.stdout.write(`\nEcho: ${line}\n`);
    } else {
      process.stdout.write("\n");
    }

    renderPrompt();
  }
});

process.on("SIGINT", () => {
  process.stdout.write("\nbye\n");
  process.exit(0);
});
