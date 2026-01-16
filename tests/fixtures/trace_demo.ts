process.stdout.write("READY\n");

setTimeout(() => {
  process.stdout.write("DONE\n");
}, 50);

// Keep the process alive until the test closes the PTY.
setTimeout(() => {}, 60_000);
