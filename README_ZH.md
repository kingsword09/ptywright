# ptywright

[English](./README.md)

一个通用的"终端版 DevTools / Playwright driver"：通过 PTY 启动任意 CLI/TUI，把 ANSI/VT 输出喂给 `@xterm/headless` 重建屏幕网格，并以 MCP（stdio）暴露工具接口。

## 安装

```bash
# 推荐：使用 bunx 一次性运行（无需安装）
bunx ptywright@latest --help

# 或全局安装
bun add -g ptywright
ptywright --help

# 或 npm/npx
npx -y ptywright@latest --help
npm install -g ptywright
```

## 快速开始

### 作为 MCP Server 使用

```bash
# stdio 模式（默认）
bunx ptywright@latest mcp

# HTTP 模式
bunx ptywright@latest mcp-http --port 3000

# 精简 tools（降低 Agent 上下文压力）
bunx ptywright@latest mcp --caps core
```

### 配置到 MCP Client

**Claude Desktop / Cursor** (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ptywright": {
      "command": "bunx",
      "args": ["ptywright@latest", "mcp"]
    }
  }
}
```

**精简模式**（只加载核心 tools）:

```json
{
  "mcpServers": {
    "ptywright": {
      "command": "bunx",
      "args": ["ptywright@latest", "mcp", "--caps", "core"]
    }
  }
}
```

**HTTP 模式**（用于 Web 客户端）:

```json
{
  "mcpServers": {
    "ptywright": {
      "command": "bunx",
      "args": ["ptywright@latest", "mcp-http", "--port", "3000"]
    }
  }
}
```

### CLI 命令

```bash
# 运行单个测试脚本
bunx ptywright@latest run scripts/demo.json

# 批量运行（生成 HTML 报告）
bunx ptywright@latest run-all --dir scripts

# 查看帮助
bunx ptywright@latest --help
```

### Raw PTY Cassette

`ptywright pty` 可以把一次真实 PTY 会话的原始 output/input/resize/exit
事件固化成 JSON，之后不再重新运行原命令，直接回放同一段原始终端流。它用于
给浏览器终端渲染器做稳定回归：例如先录一次 Codex，再反复用同一份 cassette
验证网页端 DOM/text snapshot 是否一致。

```bash
# 录制为 base64 PTY 事件
bunx ptywright@latest pty record --out tests/cassettes/codex.pty.json -- codex

# 不重新启动 codex，直接回放同一段输出流
bunx ptywright@latest pty replay tests/cassettes/codex.pty.json

# 校验或查看可搬运产物
bunx ptywright@latest pty validate tests/cassettes/codex.pty.json
bunx ptywright@latest pty inspect tests/cassettes/codex.pty.json
```

外部项目不需要依赖 ptywright 专属 PTY 包装器。`node-pty` / `bun-pty` 这类对象可直接用结构化
`wrapPtyLike` 接入：

```ts
import { wrapPtyLike } from "ptywright/pty-cassette";

const recorded = wrapPtyLike(pty, {
  path: "tests/cassettes/session.pty.json",
  terminal: { cols: 120, rows: 40, term: "xterm-256color" },
  command: { file: "codex", args: [] },
});

recorded.write("hello\r");
// output 和 exit 会从 pty.onData/onExit 自动捕获
```

Bun Terminal 这类 callback 风格也能接：创建 recorder 后在 `data` hook
里调用 `recordOutput`，或使用 `wrapBunTerminalOptions`。回放时把同一份
cassette 喂给任意浏览器终端渲染器，再由该项目的 DOM/text snapshot 测试自动
比较即可。

## Tools

工具默认全量开启（等价 `--caps all`）。如需减少 tool 数量，可设置 `--caps core` 或按需组合：

- 默认：`--caps all`
- 最小：`--caps core`
- 组合：`--caps core,debug,script,recording`

### core

- `list_sessions` / `select_session`：管理与选择会话
- `launch_session`：启动 PTY 会话（会自动成为默认会话）
- `send_text` / `press_key`：发送输入
- `snapshot_text`：返回可见屏幕文本（适合 Agent "看界面"与做 golden）
- `snapshot_view`：更适合人看的快照（带元信息+行号）
- `wait_for_text`：等待文本/正则出现
- `wait_for_stable_screen`：等待屏幕在 quiet window 内稳定（降低 flaky）
- `assert`：对当前屏幕做断言（text/regex/semantic）
- `close_session`：关闭会话

### debug（可选）

- `snapshot_ansi`：返回带 ANSI/SGR 样式的可见屏幕（适合 debug/人眼验收）
- `snapshot_view_ansi`：带 ANSI/SGR 样式的 `snapshot_view`

### script（可选）

- `run_routine`：一键执行多步交互（type/key/wait/assert/snapshot）
- `run_script`：运行 `scriptPath=file.json|file.ts` 并产出 artifacts（cast/report/失败快照）
- `run_all_scripts`：批量运行目录内脚本（递归；支持 `includeEntries/maxEntries` 控制输出）
- `generate_test_from_doc`：从文档（本地/URL）生成可执行脚本
- `inspect_failure`：查看最近一次失败的屏幕与错误

### recording（可选）

- `start_script_recording` / `stop_script_recording`：录制 MCP 工具调用并导出可复跑脚本（JSON + goldens）
- `mark`：在 trace 中打点（asciicast marker event）

### `mask` 参数

`snapshot_text/snapshot_ansi/snapshot_view/snapshot_view_ansi` 支持 `mask=[{regex,flags?,replacement?,preserveLength?}]`，用于把随机 id/时间戳等变成可 diff 的稳定快照。

### `press_key` Key Spec

支持单键与"修饰键 + 单键"的组合写法（大小写不敏感，`+`/`-` 都可作为分隔符）：
- 单字符：`"a"` / `"?"`（原样写入 PTY）
- 特殊键：`Enter|Return`、`Esc|Escape`、`Backspace`、`Space`、`Tab`、`BackTab`
- 组合键：`Ctrl+C`、`Ctrl+Shift+R`、`Alt+X`/`Meta+X`、`Shift+Tab`、`Ctrl+Up`
- 导航键：`Up/Down/Left/Right`、`Home/End`、`PageUp/PageDown`、`Insert/Delete`、`F1..F12`
- 兼容：`c-x`（等价 `Ctrl+X`）

## Script Runner (JSON)

把一次 TUI 测试写成 JSON：启动 → 输入 → 等待 → 快照（可 mask）→ 断言，并自动产出 `.cast` + `report.html`。

可选：在 JSON 顶部加上 schema（编辑器补全/校验更友好）：

```json
{ "$schema": "node_modules/ptywright/schemas/ptywright-script.schema.json" }
```

```bash
# 运行单个脚本
bunx ptywright@latest run scripts/m5_mask_demo.json

# 批量运行
bunx ptywright@latest run-all --dir scripts
```

产物默认写到 `.tmp/runs/<name>/`（可用 `--artifacts-dir` 覆盖）。

批量运行会生成总览报告：
- 默认：`.tmp/run-all/index.html` + `.tmp/run-all/run.summary.json`
- 若传入 `--artifacts-root <dir>`：写到 `<dir>/index.html` + `<dir>/run.summary.json`
- `run.summary.json` 会保存 `commands.runAll.argv` 与
  `commands.updateGoldens.argv`，后续自动化可以直接重跑套件或更新
  goldens，无需重新拼 CLI 参数。

可以直接从产物读取、校验或执行这些命令：

```bash
bunx ptywright@latest script commands .tmp/run-all --json
bunx ptywright@latest script inspect .tmp/run-all
bunx ptywright@latest script validate .tmp/run-all
bunx ptywright@latest script exec .tmp/run-all --command updateGoldens
```

批量产物目录还会包含 `ptywright-script.manifest.json`，用
`bytes`/`sha256` 索引 summary、report、cast、data 与失败产物。`script
validate` / `script inspect` / `script commands` / `script exec` 在使用目录
bundle 前都会先校验 manifest，便于把测试产物复制到其他位置后继续回放或更新。

失败时会额外落盘：
- `failure.error.txt`（错误堆栈）
- `failure.step.json`（失败的 step 信息）
- `failure.last.txt` / `failure.last.view.txt`（最后一帧快照）

`report.html` 包含 **Timeline View**，展示每一步操作后的屏幕快照。点击顶部 `debug` badge 可切换到调试视图。

内置 steps（无需 `--steps`）：
- `assert`：断言文本/正则（`text`/`regex`）
- `assertSemantic`：语义断言占位符（`prompt`）
- `sleep`：固定等待
- `expectMeta`：断言终端 meta
- `waitForExit`：等待进程退出
- `sendMouse`：发送 SGR 鼠标事件

### 框架内 Backends

`launch.backend` 默认是 `pty`。如果要做更快、更确定的框架内回归，可以用
`frames`、`ratatui` 或 `ink`，不启动 PTY，直接让同一套 script steps 对
deterministic frame 做断言：

```json
{
  "$schema": "../schemas/ptywright-script.schema.json",
  "name": "ratatui_snapshot",
  "launch": {
    "backend": "ratatui",
    "cols": 60,
    "rows": 12,
    "frames": [
      "Screen: Dashboard\nMode: HIGH",
      "Screen: Permissions\nMode: LOW"
    ]
  },
  "steps": [
    { "type": "waitForText", "text": "Dashboard" },
    { "type": "pressKey", "key": "Enter" },
    { "type": "snapshot", "kind": "text", "saveAs": "final" },
    { "type": "expect", "from": "final", "contains": ["Mode: LOW"] }
  ]
}
```

`ratatui` 用于接入 `TestBackend` / insta 风格的文本快照；`ink` 可以通过
`frameModule` 加载导出 `frames`、`frame`、`snapshot` 或 `lastFrame` 的 TS
模块。`pressKey` / `sendText` 默认会推进到下一帧，因此端到端 PTY 脚本和
框架内快速回归可以复用同一套断言步骤。

如果 JSON 里用到了 `type:"custom"`，用 `--steps <module.ts>` 注入 handlers：

```bash
bunx ptywright@latest run demo.json --steps custom_steps.ts
```

## Script Recording (MCP)

在任意 MCP client/Agent 通过 MCP tools 驱动时，可以一键把工具调用"录成脚本"：

1) `start_script_recording(name="my_flow")`
2) 正常执行：`launch_session/send_text/press_key/wait_for_*`
3) 关键节点打点：`mark(label="checkpoint")`（会自动生成 `snapshot + expectGolden`）
4) `stop_script_recording(recordingId=...)`（写入 `scripts/my_flow.json` + `tests/golden/scripts/my_flow/*.txt`）

## Script DSL (TypeScript)

用 TS builder 写 script（类型安全，可组合，支持自定义 step）：

```bash
bunx ptywright@latest run scripts/demo.ts
```

约定：
- module 默认导出（`export default`），或导出 `script`。
- 可选导出 `steps`（custom step handlers），用于执行 `type:"custom"` 的步骤。
- 需要测试"粘贴"时可用 `pasteText("...", { bracketed: true })`（bracketed paste）。

## Browser Agent 回归

ptywright 可以启动浏览器里的终端 agent 页面，录制终端/DOM snapshot 与
cassette。一次 live run 通过后，可以把 cassette 固化为不依赖 AI 的回归
用例，后续直接用命令重放、对比或更新快照。

```bash
# 首次 live run：写入 snapshot、cassette、run record、report。
bun run src/cli.ts agent run examples/agent_deterministic.json --update-snapshots

# 非 AI 单用例回放：可传 run record 或 cassette。
bun run src/cli.ts agent replay .tmp/agent/agent_deterministic/agent_deterministic.agent-run.json
bun run src/cli.ts agent replay .tmp/agent/agent_deterministic/agent_deterministic.cassette.json

# 把一次成功的 live run/cassette 提升为提交内回归套件。
bun run src/cli.ts agent promote \
  .tmp/agent/agent_deterministic/agent_deterministic.cassette.json \
  --update-snapshots

# 批量回放已提交 cassette，并在有意变更时更新 terminal/DOM baseline。
bun run src/cli.ts agent check
bun run src/cli.ts agent replay-all tests/agent-cassettes --update-snapshots

# 从产物读取、校验或直接执行可复用命令。
bun run src/cli.ts agent commands .tmp/agent-check --json
bun run src/cli.ts agent inspect .tmp/agent-check
bun run src/cli.ts agent validate .tmp/agent-check
bun run src/cli.ts agent exec .tmp/agent-check --command rerun
bun run src/cli.ts agent exec .tmp/agent-check --command updateSnapshots

# 从 summary 产物重新执行，不需要 live agent。
bun run src/cli.ts agent rerun .tmp/agent-check/agent-check.summary.json
bun run src/cli.ts agent rerun .tmp/agent-check/agent-replay.summary.json --update-snapshots
```

DOM 产物查看器会优先使用项目自己的渲染资产。如果从当前项目、flow 路径、
report 路径或 artifact 目录能解析到 `@aitty/browser`，ptywright 会把
`@aitty/browser/style.css` 和 Aitty snapshot web component 复制进报告产物，
并通过 `<aitty-snapshot>` 渲染 snapshot。便携的 file report 会优先使用 classic
`web-component.global.js`；如果不存在，则退到 module 形式的 `web-component.js`。
在这条路径里，wterm 行结构、ANSI 样式、termvision 和 viewport-pan 都来自
`@aitty/browser`；ptywright 只提供报告外框和复制后的资产。解析不到这些资产时，
报告才会回退到自包含的 terminal preview，确保 ptywright 仍然是通用的
renderer-agnostic 工具。

关键产物：
- `.agent-run.json`：每次运行的结构化记录，包含 `commands.replay.argv`
  与 `commands.updateSnapshots.argv`。
- `.cassette.json`：包含标准化 flow spec、terminal/DOM 帧与 hash，可直接回放。
- `agent-replay.summary.json` / `agent-check.summary.json` /
  `agent-promote.summary.json`：批量回放、提交检查、提升操作的 summary。
- `ptywright-agent.manifest.json`：索引目录内产物及 hash，使复制后的产物目录仍可
  `agent inspect` / `agent commands` / `agent exec` / `agent validate`。

`--update-snapshots` 是唯一的显式更新入口；默认 replay/check 都是对比模式，
用于像 Vitest snapshot 一样阻止特定流程回归。

### 项目配置

如果一个项目里会持续维护 agent 回归，可以把公共路径和浏览器默认值放到
`ptywright.config.ts`，避免每个 flow 里重复写。CLI 会从当前目录向上查找
`ptywright.config.ts|mts|cts|js|mjs|cjs`，也可以用 `--config <file>` 显式指定。

```ts
import { defineConfig } from "ptywright/config";

export default defineConfig({
  agent: {
    artifactsRoot: ".tmp/agent",
    cassetteDir: "tests/agent-cassettes",
    snapshotDir: "tests/agent-snapshots",
    defaults: {
      headless: true,
      timeoutMs: 45_000,
      screenshot: false,
      viewports: [{ name: "desktop", width: 1280, height: 820 }],
      mask: [{ regex: "session_[a-z0-9]+", replacement: "<session>" }],
    },
  },
});
```

```bash
ptywright agent run tests/agents/codex.flow.json --update-snapshots
ptywright agent check
ptywright agent replay-all --update-snapshots
ptywright agent promote .tmp/agent/codex/codex.cassette.json --update-snapshots
```

配置里的相对路径都按配置文件所在目录解析。CLI 显式参数优先级最高，flow 文件
内字段优先于配置默认值。flow 仍然是测试用例本身；配置文件只负责项目级默认
值和公共产物路径，不承担第二套测试 DSL。

## Cast -> SVG/GIF (可选)

录像类产物建议只用于失败诊断或人工验收；稳定回归优先用 `snapshot_grid` 做 diff。

- SVG: `bunx svg-term --in <castPath> --out <outSvg>`
- GIF: `agg --fps 30 <castPath> <outGif>`（需安装 [asciinema/agg](https://github.com/asciinema/agg)）

## 开发（本仓库内）

```bash
bun install

# 启动 MCP server
bun run src/cli.ts mcp

# 运行测试与提交前检查
bun run test
bun run agent:check
bun run check

# Lint & Format
bun run lint
bun run format:check

# 运行脚本
bun run src/cli.ts run scripts/m5_mask_demo.json
bun run src/cli.ts run-all

# 运行 browser agent 回归
bun run src/cli.ts agent run examples/agent_deterministic.json --update-snapshots
```

## 环境变量

- `TUI_TEST_PTY_BACKEND=auto|bun-terminal|bun-pty`
  - 默认 `auto`：macOS/Linux 优先 `bun-terminal`，Windows 使用 `bun-pty`
- `PTYWRIGHT_CAPS=all|core|debug|script|recording`
  - 等价于 `--caps` 参数

## License

Apache-2.0
