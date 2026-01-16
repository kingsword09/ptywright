export {};

const sleep = async (ms: number) => {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
};

process.stdout.write("NORMAL\n");
await sleep(10);

// Enter alternate screen buffer.
process.stdout.write("\x1b[?1049h");
process.stdout.write("\x1b[H\x1b[2J");
process.stdout.write("ALT SCREEN\n");
process.stdout.write("DONE\n");

await sleep(30);
