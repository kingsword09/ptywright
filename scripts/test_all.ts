import { listTestFiles } from "./test_files";

const files = listTestFiles();

for (const file of files) {
  const result = Bun.spawnSync({
    cmd: ["bun", "test", file],
    stdout: "inherit",
    stderr: "inherit",
  });

  if (!result.success) {
    process.exit(result.exitCode);
  }
}
