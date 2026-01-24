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

## Cast -> SVG/GIF (可选)

录像类产物建议只用于失败诊断或人工验收；稳定回归优先用 `snapshot_grid` 做 diff。

- SVG: `bunx svg-term --in <castPath> --out <outSvg>`
- GIF: `agg --fps 30 <castPath> <outGif>`（需安装 [asciinema/agg](https://github.com/asciinema/agg)）

## 开发（本仓库内）

```bash
bun install

# 启动 MCP server
bun run bin/ptywright mcp

# 运行测试
bun test

# Lint & Format
bun run lint
bun run format:check

# 运行脚本
bun run bin/ptywright run scripts/m5_mask_demo.json
bun run bin/ptywright run-all
```

## 环境变量

- `TUI_TEST_PTY_BACKEND=auto|bun-terminal|bun-pty`
  - 默认 `auto`：macOS/Linux 优先 `bun-terminal`，Windows 使用 `bun-pty`
- `PTYWRIGHT_CAPS=all|core|debug|script|recording`
  - 等价于 `--caps` 参数

## License

Apache-2.0
