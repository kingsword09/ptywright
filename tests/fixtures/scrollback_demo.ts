for (let i = 1; i <= 60; i += 1) {
  process.stdout.write(`L${String(i).padStart(3, "0")}\n`);
}
process.stdout.write("DONE\n");
