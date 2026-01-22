# ptywright

一个通用的“终端版 DevTools / Playwright driver”原型：通过 PTY 启动任意 CLI/TUI，把 ANSI/VT 输出喂给 `@xterm/headless` 重建屏幕网格，并以 MCP（stdio）暴露工具接口。

## Run

```bash
bun install

# 默认：启动 MCP server（等价 `ptywright mcp`）
bun run bin/ptywright

# 显式写法：
# bun run bin/ptywright mcp

# 可选：以 Streamable HTTP 方式启动（Web transport）
# bun run bin/ptywright mcp-http --port 3000

# 可选：减少 tool 数量（降低 Agent 上下文压力）
# bun run bin/ptywright mcp --caps core
# 或：PTYWRIGHT_CAPS=core bun run bin/ptywright
```

## Tools (MVP)

工具默认全量开启（等价 `PTYWRIGHT_CAPS=all`）。如需减少 tool 数量，可设置 `PTYWRIGHT_CAPS=core` 或按需组合：

- 默认：`PTYWRIGHT_CAPS=all`
- 最小：`PTYWRIGHT_CAPS=core`
- 组合：`PTYWRIGHT_CAPS=core,debug,script,recording`

### core

- `launch_session`：启动 PTY 会话（会自动成为默认会话）
- `select_session`：选择默认会话（之后多数 tools 可省略 `sessionId`）
- `send_text` / `press_key`：发送输入
- `snapshot_text`：返回可见屏幕文本（适合 Agent “看界面”与做 golden）
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

`mask`（可选）：`snapshot_text/snapshot_ansi/snapshot_view/snapshot_view_ansi` 支持 `mask=[{regex,flags?,replacement?,preserveLength?}]`，用于把随机 id/时间戳等变成可 diff 的稳定快照

### `press_key` Key Spec

支持单键与“修饰键 + 单键”的组合写法（大小写不敏感，`+`/`-` 都可作为分隔符）：
- 单字符：`"a"` / `"?"`（原样写入 PTY）
- 特殊键：`Enter|Return`、`Esc|Escape`、`Backspace`、`Space`、`Tab`、`BackTab`
- 组合键：`Ctrl+C`、`Ctrl+Shift+R`、`Alt+X`/`Meta+X`、`Shift+Tab`、`Ctrl+Up`
- 导航键：`Up/Down/Left/Right`、`Home/End`、`PageUp/PageDown`、`Insert/Delete`、`F1..F12`
- 兼容：`c-x`（等价 `Ctrl+X`）

## Tests

```bash
bun test
```

包含：
- PTY + xterm 解析与快照测试
- MCP server 端到端 smoke（client 通过 stdio 启动 server 并调用 tools）

## Use With MCP Clients（可选）

本仓库也提供了一个可选的 Codex skill：`skills/ptywright-testing/`，用于指导 Agent 如何用 ptywright MCP/CLI 跑回归并读取 `run.summary.json`（尽量不把超长报告塞进上下文）。

本项目是一个 stdio transport 的 MCP server。直接启动：

```bash
# 默认等价 `ptywright mcp`
bun run bin/ptywright
```

也可以用 Streamable HTTP 启动（默认 endpoint: `http://127.0.0.1:3000/mcp`）：

```bash
bun run bin/ptywright mcp-http --port 3000
```

然后在你使用的 MCP client 里把它作为一个 stdio server 配置进去即可（不同 client 的配置方式不同）。

## Script Runner (JSON)

把一次 TUI 测试写成 JSON：启动 → 输入 → 等待 → 快照（可 mask）→ 断言，并自动产出 `.cast` + `report.html`。

可选：在 JSON 顶部加上 schema（编辑器补全/校验更友好）：

```json
{ "$schema": "../schemas/ptywright-script.schema.json" }
```

```bash
bun run script:run scripts/m5_mask_demo.json
# 或（CLI）
bun run bin/ptywright run scripts/m5_mask_demo.json
# 或
bun run script:m5-mask-demo
```

批量执行（本地/CI）：

```bash
bun run script:run-all
# 或（CLI）
bun run bin/ptywright run-all
```

会生成一个总览报告（类似 Playwright report 首页）：
- 默认：`.tmp/run-all/index.html` + `.tmp/run-all/run.summary.json`
- 若传入 `--artifacts-root <dir>`：写到 `<dir>/index.html` + `<dir>/run.summary.json`

如果 JSON 里用到了 `type:"custom"`，用 `--steps <module.ts>` 注入 handlers（模块导出 `steps` 对象即可）：

```bash
bun run script:run examples/json_custom_steps_demo.json --steps scripts/m6_json_custom_steps.ts
```

产物默认写到 `.tmp/runs/<name>/`（可用 `--artifacts-dir` 覆盖）。

失败时会额外落盘：
- `failure.error.txt`（错误堆栈）
- `failure.step.json`（失败的 step 信息）
- `failure.last.txt` / `failure.last.view.txt`（最后一帧快照）

`report.html` 现在包含 **Timeline View**，展示每一步操作后的屏幕快照（不仅是失败时）。点击顶部 `debug` badge 可切换到调试视图。

Cast Playback（完整录屏）会优先加载 report 同目录的 `asciinema-player.min.js` / `asciinema-player.css`（生成 report 时自动复制），因此离线打开 report 也可播放；若本地资源缺失则会 fallback 到 CDN。

内置 steps（无需 `--steps`）：
- `assert`：**[NEW]** 断言文本/正则（`text`/`regex`）
- `assertSemantic`：**[NEW]** 语义断言占位符（`prompt`）
- `sleep`：固定等待
- `expectMeta`：断言终端 meta
- `waitForExit`：等待进程退出
- `sendMouse`：发送 SGR 鼠标事件

## Script Recording (MCP)

如果你设置了 `PTYWRIGHT_CAPS` 且未包含 `recording`，需要开启 `recording`（例如 `PTYWRIGHT_CAPS=core,recording`）。

在任意 MCP client/Agent 通过 MCP tools 驱动时，可以一键把工具调用“录成脚本”，并在 `mark` 处自动落盘 golden：

1) `start_script_recording(name="my_flow")`
2) 正常执行：`launch_session/send_text/press_key/wait_for_*`
3) 关键节点打点：`mark(label="checkpoint")`（会自动生成 `snapshot + expectGolden`）
4) `stop_script_recording(recordingId=...)`（写入 `scripts/my_flow.json` + `tests/golden/scripts/my_flow/*.txt`）

## Script DSL (TypeScript)

用 TS builder 写 script（类型安全，可组合，支持自定义 step），底层仍复用同一个 runner：

```bash
bun run script:run scripts/m6_dsl_demo.ts
```

约定：
- module 默认导出（`export default`），或导出 `script`。
- 可选导出 `steps`（custom step handlers），用于执行 `type:"custom"` 的步骤。
- 常用 handlers 可复用：`src/script/steps/*`。
- 需要测试“粘贴”时可用 `pasteText("...", { bracketed: true })`（bracketed paste）。

## Cast -> SVG/GIF (可选)

录像类产物建议只用于失败诊断或人工验收；稳定回归优先用 `snapshot_grid` 做 diff。

- SVG: `svg-term`（例如：`bunx svg-term --in <castPath> --out <outSvg>`）
- TXT: `bun run src/trace/cast_to_txt.ts --in <castPath> --out <outTxt>`
- GIF: `asciinema/agg`（例如：`agg --fps 30 <castPath> <outGif>`）
