# ptywright

一个通用的“终端版 DevTools / Playwright driver”原型：通过 PTY 启动任意 CLI/TUI，把 ANSI/VT 输出喂给 `@xterm/headless` 重建屏幕网格，并以 MCP（stdio）暴露工具接口。

## Run

```bash
bun install

# 默认仅加载 core tools（更省 token）
bun run src/index.ts

# 可选：加载全量 tools
# PTYWRIGHT_CAPS=all bun run src/index.ts
```

## Tools (MVP)

工具集按 capability 过滤（减少 MCP tool 体积/上下文压力）：

- 默认：`PTYWRIGHT_CAPS=core`
- 全量：`PTYWRIGHT_CAPS=all`
- 组合：`PTYWRIGHT_CAPS=core,debug,script,recording`

### core（默认）

- `launch_session`：启动 PTY 会话（会自动成为默认会话）
- `select_session`：选择默认会话（之后多数 tools 可省略 `sessionId`）
- `send_text` / `press_key`：发送输入
- `send_mouse`：发送 SGR 鼠标事件（click/move/scroll）
- `resize`：调整终端尺寸
- `snapshot_text`：返回可见屏幕文本（适合 Agent “看界面”与做 golden）
- `snapshot_view`：更适合人看的快照（带元信息+行号）
- `wait_for_text`：等待文本/正则出现
- `wait_for_stable_screen`：等待屏幕在 quiet window 内稳定（降低 flaky）
- `list_sessions` / `close_session`

### debug（可选）

- `snapshot_ansi`：返回带 ANSI/SGR 样式的可见屏幕（适合 debug/人眼验收）
- `snapshot_view_ansi`：带 ANSI/SGR 样式的 `snapshot_view`
- `snapshot_grid`：返回结构化屏幕网格（rows/cols/cursor/lines）
- `snapshot_cast`：导出 asciicast 事件流（用于录像/回放/失败诊断）

### script（可选）

- `run_script`：运行 `scriptPath=file.json|file.ts` 并产出 artifacts（cast/report/失败快照）
- `run_all_scripts`：批量运行目录内脚本（递归；支持 `includeEntries/maxEntries` 控制输出）

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

本项目是一个 stdio transport 的 MCP server。直接启动：

```bash
bun run src/index.ts
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
# 或
bun run script:m5-mask-demo
```

批量执行（本地/CI）：

```bash
bun run script:run-all
```

如果 JSON 里用到了 `type:"custom"`，用 `--steps <module.ts>` 注入 handlers（模块导出 `steps` 对象即可）：

```bash
bun run script:run scripts/m6_json_custom_demo.json --steps scripts/m6_json_custom_steps.ts
```

产物默认写到 `.tmp/runs/<name>/`（可用 `--artifacts-dir` 覆盖）。

失败时会额外落盘：
- `failure.error.txt`（错误堆栈）
- `failure.step.json`（失败的 step 信息）
- `failure.last.txt` / `failure.last.view.txt`（最后一帧快照）

内置 steps（无需 `--steps`）：
- `sleep`：固定等待（尽量优先用 `waitForText` / `waitForStableScreen`）
- `expectMeta`：断言终端 meta（bufferType/cols/rows/cursor）
- `waitForExit`：等待进程退出并可断言 exitCode/signal
- `sendMouse`：发送 SGR 鼠标事件（down/up/move/click/scroll）

## Script Recording (MCP)

需要启用 `recording` capability（例如 `PTYWRIGHT_CAPS=core,recording` 或 `PTYWRIGHT_CAPS=all`）。

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
- module 默认导出（`export default`），或导出 `script`/`scenario`。
- 可选导出 `steps`（custom step handlers），用于执行 `type:"custom"` 的步骤。
- 常用 handlers 可复用：`src/scenario/steps/*`。
- 需要测试“粘贴”时可用 `pasteText("...", { bracketed: true })`（bracketed paste）。

## Cast -> SVG/GIF (可选)

录像类产物建议只用于失败诊断或人工验收；稳定回归优先用 `snapshot_grid` 做 diff。

- SVG: `svg-term`（例如：`bunx svg-term --in <castPath> --out <outSvg>`）
- TXT: `bun run src/trace/cast_to_txt.ts --in <castPath> --out <outTxt>`
- GIF: `asciinema/agg`（例如：`agg --fps 30 <castPath> <outGif>`）
