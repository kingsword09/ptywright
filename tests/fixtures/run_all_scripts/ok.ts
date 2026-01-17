export default {
  launch: {
    command: "bun",
    args: ["-e", "process.stdout.write('ts-ok\\n')"],
    cols: 80,
    rows: 20,
  },
  trace: { saveCast: false, saveReport: false },
  steps: [
    { type: "waitForExit", timeoutMs: 10_000, exitCode: 0 },
    {
      type: "snapshot",
      kind: "text",
      scope: "buffer",
      trimRight: true,
      trimBottom: true,
      saveAs: "out",
    },
    { type: "expect", from: "out", contains: ["ts-ok"] },
  ],
};
