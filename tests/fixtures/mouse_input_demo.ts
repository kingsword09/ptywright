export {};

process.stdout.write("READY\n");

process.stdin.setRawMode(true);
process.stdin.resume();

const timeout = setTimeout(() => {
  process.stdout.write("TIMEOUT\n");
  process.exit(1);
}, 5_000);

type Chunk = Uint8Array;

process.stdin.once("data", (chunk: Chunk) => {
  clearTimeout(timeout);
  const text = new TextDecoder().decode(chunk);
  process.stdout.write(`DATA ${JSON.stringify(text)}\nDONE\n`);
  process.exit(0);
});
