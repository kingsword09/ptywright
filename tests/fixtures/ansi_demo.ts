export {};

const sleep = async (ms: number) => {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
};

process.stdout.write("Hello");
await sleep(30);
process.stdout.write("\rHello world");
await sleep(30);
process.stdout.write("\n");
process.stdout.write("\x1b[2KLine2");
await sleep(30);
process.stdout.write("\nDONE\n");
