import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { expect, test } from "bun:test";

import { normalizeAgentCassette } from "../src/agent/cassette";
import { normalizeAgentRunRecord } from "../src/agent/run_record";
import { replayAgentRecordPath, runAgentSpec } from "../src/agent/runner";
import { main } from "../src/cli";
import { deterministicAgentSpec } from "./agent_fixture";

function currentExitCode(): string | number | null | undefined {
  return process.exitCode;
}

test("agent replay uses cassette frames instead of launching the original command", async () => {
  const artifactsDir = join(".tmp", "tests", "agent-cassette");
  const snapshotDir = join(artifactsDir, "snapshots");
  rmSync(artifactsDir, { recursive: true, force: true });

  const run = await runAgentSpec(
    {
      ...deterministicAgentSpec({
        name: "agent_cassette_fixture",
        artifactsDir,
        snapshotDir,
      }),
      name: "agent_cassette_fixture",
      artifactsDir,
      snapshotDir,
      steps: [
        { type: "waitForText", text: "Deterministic Agent Ready" },
        { type: "snapshot", name: "ready", targets: ["terminal", "dom", "layout"] },
        { type: "typeText", text: "status", enter: true },
        { type: "waitForText", text: "Status: stable" },
        { type: "snapshot", name: "status", targets: ["terminal", "dom", "layout"] },
      ],
    },
    { updateSnapshots: true, headless: true },
  );

  expect(run.ok).toBe(true);
  expect(existsSync(run.cassettePath)).toBe(true);
  expect(run.cassetteFrameCount).toBeGreaterThan(0);
  expect(run.artifacts.some((artifact) => artifact.kind === "layout" && artifact.ok)).toBe(true);
  expect(readFileSync(join(artifactsDir, "desktop.ready.layout.txt"), "utf8")).toContain(
    "# terminal-layout v1",
  );

  const cassette = normalizeAgentCassette(
    JSON.parse(readFileSync(run.cassettePath, "utf8")) as unknown,
  );
  expect(cassette.$schema).toContain("ptywright-agent-cassette.schema.json");
  expect(cassette.spec.launch.mode).toBe("url");
  expect(cassette.frames[0]?.terminalHash).toBeTruthy();
  expect(cassette.frames[0]?.domHash).toBeTruthy();

  const record = JSON.parse(readFileSync(run.recordPath, "utf8")) as {
    cassettePath?: string;
    cassetteFrameCount?: number;
    commands?: {
      replay?: { argv?: string[] };
      updateSnapshots?: { argv?: string[] };
    };
    mode?: string;
    spec?: { launch?: { url?: string } };
  };
  expect(record.cassettePath).toBe("agent_cassette_fixture.cassette.json");
  expect(record.mode).toBe("live");
  expect(record.cassetteFrameCount).toBe(run.cassetteFrameCount);
  expect(record.commands?.replay?.argv).toEqual([
    "ptywright",
    "agent",
    "replay",
    relative(process.cwd(), run.recordPath),
  ]);
  expect(record.commands?.updateSnapshots?.argv).toEqual([
    "ptywright",
    "agent",
    "replay",
    relative(process.cwd(), run.recordPath),
    "--update-snapshots",
  ]);

  if (record.spec?.launch) {
    record.spec.launch.url = "http://127.0.0.1:9/missing-agent-fixture";
  }

  const recordPath = join(artifactsDir, "agent_cassette_fixture.agent-run.json");
  await Bun.write(recordPath, JSON.stringify(record, null, 2) + "\n");

  const replay = await replayAgentRecordPath(recordPath, {
    updateSnapshots: false,
    headless: true,
  });
  expect(replay.ok).toBe(true);
  expect(replay.mode).toBe("replay");
  expect(replay.artifacts.every((artifact) => artifact.ok)).toBe(true);
  expect(existsSync(join(replay.artifactsDir, "desktop.ready.layout.txt"))).toBe(true);
  const replayRecord = JSON.parse(readFileSync(replay.recordPath, "utf8")) as {
    cassettePath?: string;
    cassetteFrameCount?: number;
    commands?: {
      replay?: { argv?: string[] };
      updateSnapshots?: { argv?: string[] };
    };
    mode?: string;
  };
  expect(replayRecord.mode).toBe("replay");
  expect(replayRecord.cassettePath).toBe("agent_cassette_fixture.cassette.json");
  expect(existsSync(join(replay.artifactsDir, replayRecord.cassettePath))).toBe(true);
  expect(replayRecord.cassetteFrameCount).toBe(run.cassetteFrameCount);
  expect(replayRecord.commands?.replay?.argv).toEqual([
    "ptywright",
    "agent",
    "replay",
    relative(process.cwd(), replay.recordPath),
  ]);
  expect(replayRecord.commands?.updateSnapshots?.argv).toEqual([
    "ptywright",
    "agent",
    "replay",
    relative(process.cwd(), replay.recordPath),
    "--update-snapshots",
  ]);

  const cassetteReplay = await replayAgentRecordPath(run.cassettePath, {
    artifactsDir: join(artifactsDir, "cassette-direct-replay"),
    updateSnapshots: false,
    headless: true,
  });
  expect(cassetteReplay.ok).toBe(true);

  const secondReplay = await replayAgentRecordPath(replay.recordPath, {
    artifactsDir: join(artifactsDir, "second-replay"),
    updateSnapshots: false,
    headless: true,
  });
  expect(secondReplay.ok).toBe(true);
}, 15_000);

test("agent replay selects cassette DOM frames by viewport", async () => {
  const artifactsDir = join(".tmp", "tests", "agent-cassette-viewports");
  const snapshotDir = join(artifactsDir, "snapshots");
  rmSync(artifactsDir, { recursive: true, force: true });

  const run = await runAgentSpec(
    {
      name: "agent_cassette_viewports",
      artifactsDir,
      snapshotDir,
      launch: {
        mode: "url",
        url: `data:text/html;charset=utf-8,${encodeURIComponent(renderViewportAwareAgentHtml())}`,
      },
      viewports: [
        { name: "desktop", width: 900, height: 640 },
        { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
      ],
      defaults: { timeoutMs: 30_000, screenshot: false },
      steps: [
        { type: "waitForStableDom", quietMs: 100 },
        { type: "snapshot", name: "ready", targets: ["terminal", "dom"] },
      ],
    },
    { updateSnapshots: true, headless: true },
  );

  expect(run.ok).toBe(true);

  const record = JSON.parse(readFileSync(run.recordPath, "utf8")) as {
    spec?: { launch?: { url?: string } };
  };

  if (record.spec?.launch) {
    record.spec.launch.url = "http://127.0.0.1:9/missing-agent-fixture";
  }
  writeFileSync(run.recordPath, JSON.stringify(record, null, 2) + "\n", "utf8");

  const replay = await replayAgentRecordPath(run.recordPath, {
    artifactsDir: join(artifactsDir, "replay"),
    updateSnapshots: true,
    headless: true,
  });

  expect(replay.ok).toBe(true);
  expect(readFileSync(join(replay.artifactsDir, "desktop.ready.dom.html"), "utf8")).toContain(
    'data-cols="90"',
  );
  expect(readFileSync(join(replay.artifactsDir, "desktop.ready.dom.html"), "utf8")).toContain(
    "desktop-viewport",
  );
  expect(readFileSync(join(replay.artifactsDir, "mobile.ready.dom.html"), "utf8")).toContain(
    'data-cols="39"',
  );
  expect(readFileSync(join(replay.artifactsDir, "mobile.ready.dom.html"), "utf8")).toContain(
    "mobile-viewport",
  );
}, 15_000);

test("agent snapshot mismatch writes a readable diff artifact", async () => {
  const artifactsDir = join(".tmp", "tests", "agent-mismatch-diff");
  const snapshotDir = join(artifactsDir, "snapshots");
  rmSync(artifactsDir, { recursive: true, force: true });

  const spec = {
    ...deterministicAgentSpec({
      name: "agent_mismatch_diff_fixture",
      artifactsDir,
      snapshotDir,
    }),
    name: "agent_mismatch_diff_fixture",
    artifactsDir,
    snapshotDir,
  };

  const update = await runAgentSpec(spec, { updateSnapshots: true, headless: true });
  expect(update.ok).toBe(true);

  const baselinePath = join(snapshotDir, "desktop.ready.terminal.snap.txt");
  writeFileSync(baselinePath, "wrong baseline\n", "utf8");

  const compare = await runAgentSpec(spec, { headless: true });
  expect(compare.ok).toBe(false);
  const diffArtifact = compare.artifacts.find((artifact) => artifact.diffPath);
  expect(diffArtifact?.diffPath).toBeTruthy();
  expect(existsSync(diffArtifact!.diffPath!)).toBe(true);
  expect(compare.artifacts.some((artifact) => artifact.kind === "dom" && artifact.ok)).toBe(true);
  expect(existsSync(join(compare.artifactsDir, "desktop.ready.dom.html"))).toBe(true);
  expect(existsSync(join(compare.artifactsDir, "desktop.ready.dom.preview.html"))).toBe(true);

  const diff = readFileSync(diffArtifact!.diffPath!, "utf8");
  expect(diff).toContain("--- expected");
  expect(diff).toContain("+++ received");
  expect(diff).toContain("- wrong baseline");
  expect(diff).toContain("+ Deterministic Agent Ready");

  const report = readFileSync(compare.reportPath, "utf8");
  const terminalViewer = readFileSync(
    join(compare.artifactsDir, "desktop.ready.terminal.viewer.html"),
    "utf8",
  );

  expect(report).toContain("diff");
  expect(report).toContain("Commands");
  expect(report).toContain("ptywright agent commands");
  expect(report).toContain("--update-snapshots");
  expect(report).toContain('href="desktop.ready.dom.viewer.html"');
  expect(terminalViewer).toContain('src="desktop.ready.dom.preview.html"');
  expect(terminalViewer).not.toContain('<pre class="raw-artifact-text"');
}, 15_000);

test("agent run and replay CLI accept JSON output mode", async () => {
  const artifactsDir = join(".tmp", "tests", "agent-cli-json-run");
  const replayDir = join(".tmp", "tests", "agent-cli-json-replay");
  const specPath = join(artifactsDir, "flow.json");
  rmSync(artifactsDir, { recursive: true, force: true });
  rmSync(replayDir, { recursive: true, force: true });

  await Bun.write(
    specPath,
    JSON.stringify(
      {
        ...deterministicAgentSpec({
          name: "agent_cli_json_fixture",
          artifactsDir,
          snapshotDir: join(artifactsDir, "snapshots"),
        }),
      },
      null,
      2,
    ) + "\n",
  );

  const runLogs: string[] = [];
  const originalLog = console.log;

  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      runLogs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["agent", "run", specPath, "--update-snapshots", "--json"]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const runRecord = normalizeAgentRunRecord(JSON.parse(runLogs.join("\n")) as unknown);
  expect(runRecord.mode).toBe("live");
  expect(runRecord.ok).toBe(true);
  expect(runRecord.cassettePath).toBe("agent_cli_json_fixture.cassette.json");

  const replayLogs: string[] = [];
  process.exitCode = undefined;
  try {
    console.log = (...args: unknown[]) => {
      replayLogs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main([
      "agent",
      "replay",
      join(artifactsDir, "agent_cli_json_fixture.cassette.json"),
      "--artifacts-dir",
      replayDir,
      "--json",
    ]);
    expect(currentExitCode()).toBe(0);
  } finally {
    console.log = originalLog;
    process.exitCode = 0;
  }

  const replayRecord = normalizeAgentRunRecord(JSON.parse(replayLogs.join("\n")) as unknown);
  expect(replayRecord.mode).toBe("replay");
  expect(replayRecord.ok).toBe(true);
  expect(replayRecord.cassettePath).toBe("agent_cli_json_fixture.cassette.json");
  expect(existsSync(join(replayDir, replayRecord.cassettePath))).toBe(true);
}, 30_000);

test("agent cassette validation rejects tampered frame hashes", async () => {
  const artifactsDir = join(".tmp", "tests", "agent-cassette-hash");
  const snapshotDir = join(artifactsDir, "snapshots");
  rmSync(artifactsDir, { recursive: true, force: true });

  const run = await runAgentSpec(
    deterministicAgentSpec({
      name: "agent_cassette_hash_fixture",
      artifactsDir,
      snapshotDir,
      targets: ["terminal"],
    }),
    { updateSnapshots: true, headless: true },
  );
  expect(run.ok).toBe(true);

  const cassette = JSON.parse(readFileSync(run.cassettePath, "utf8")) as {
    frames?: Array<{ terminalText?: string }>;
  };
  cassette.frames![0]!.terminalText = "tampered";
  expect(() => normalizeAgentCassette(cassette)).toThrow("terminal hash mismatch");
}, 15_000);

function renderViewportAwareAgentHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Viewport Aware Agent Fixture</title>
  </head>
  <body>
    <div data-terminal-root tabindex="0"></div>
    <script>
      const root = document.querySelector("[data-terminal-root]");

      function render() {
        const mobile = window.innerWidth <= 500;
        const cols = mobile ? 39 : 90;
        const grid = document.createElement("div");
        const row = document.createElement("div");
        const span = document.createElement("span");
        grid.className = "term-grid";
        grid.dataset.cols = String(cols);
        grid.dataset.rows = "1";
        grid.style.setProperty("--term-cols", String(cols));
        grid.style.setProperty("--term-rows", "1");
        row.className = "term-row";
        row.dataset.aittyLineCols = String(cols);
        span.textContent = mobile ? "mobile-viewport" : "desktop-viewport";
        span.style.width = "calc(var(--term-cell-width, 1ch) * " + cols + ")";
        row.append(span);
        grid.append(row);
        root.replaceChildren(grid);
      }

      window.addEventListener("resize", render);
      render();
    </script>
  </body>
</html>`;
}
