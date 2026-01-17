# ptywright

一个通用的“终端版 DevTools / Playwright driver”原型：通过 PTY 启动任意 CLI/TUI，把 ANSI/VT 输出喂给 `@xterm/headless` 重建屏幕网格，并以 MCP（stdio）暴露工具接口。

## Run

```bash
bun install
bun run src/index.ts
```

## Tools (MVP)

- `launch_session`：启动 PTY 会话
- `send_text` / `press_key`：发送输入
- `send_mouse`：发送 SGR 鼠标事件（click/move/scroll）
- `resize`：调整终端尺寸
- `snapshot_text`：返回可见屏幕文本（适合 Agent “看界面”与做 golden）
- `snapshot_ansi`：返回带 ANSI/SGR 样式的可见屏幕（适合 debug/人眼验收）
- `snapshot_view`：更适合人看的快照（带元信息+行号）
- `snapshot_view_ansi`：带 ANSI/SGR 样式的 `snapshot_view`
- `mask`（可选）：`snapshot_text/snapshot_ansi/snapshot_view/snapshot_view_ansi` 支持 `mask=[{regex,flags?,replacement?,preserveLength?}]`，用于把随机 id/时间戳等变成可 diff 的稳定快照
- `snapshot_grid`：返回结构化屏幕网格（rows/cols/cursor/lines）
- `snapshot_cast`：导出 asciicast 事件流（用于录像/回放/失败诊断）
- `mark`：在 trace 中打点（asciicast marker event）
- `wait_for_text`：等待文本/正则出现
- `wait_for_stable_screen`：等待屏幕在 quiet window 内稳定（降低 flaky）
- `run_script` / `run_scenario`：运行 `file.json|file.ts` 并产出 artifacts（cast/report/失败快照）
- `list_sessions` / `close_session`

## Tests

```bash
bun test
```

包含：
- PTY + xterm 解析与快照测试
- MCP server 端到端 smoke（client 通过 stdio 启动 server 并调用 tools）

## Use With Codex (可选)

把本 MCP server 加到 Codex 的全局 MCP 配置（Codex 会写入 `~/.codex/config.toml`）：

```bash
codex mcp add ptywright -- bun run src/index.ts
codex mcp list
```

在 Codex 里，工具名称通常会显示为 `mcp__<server>__<tool>`（例如 `mcp__ptywright__launch_session`），其中 `<server>` 就是你 `codex mcp add` 时起的名字。

然后在 Codex 对话里让它调用 MCP tools（例如先 `launch_session` 再 `snapshot_text`）。

### 免转义运行 prompt（推荐）

把 prompt 写进文件，然后用 stdin 方式喂给 `codex exec`：

```bash
codex exec --skip-git-repo-check - < prompts/codex_help_test.prompt
codex exec --skip-git-repo-check - < prompts/ansi_color_demo.prompt
# 鼠标 click 演示
codex exec --skip-git-repo-check - < prompts/mouse_click_demo.prompt
codex exec --skip-git-repo-check - < prompts/trace_demo_cast.prompt
# 带 mark 打点（用于 report filmstrip）
codex exec --skip-git-repo-check - < prompts/trace_demo_cast_marked.prompt
```

或用内置脚本：

```bash
bun run codex:help-test
bun run codex:ansi-color-demo
bun run codex:trace-demo
bun run codex:trace-demo:txt
bun run codex:mouse-click-demo
bun run codex:trace-demo:marked

# 生成 HTML 回放报告（filmstrip）
bun run trace:report-demo
# 或一键：先录制 cast 再生成报告
bun run codex:trace-demo:report
# 一键（含 mark）
bun run codex:trace-demo:report:marked

# 生成带颜色的 HTML 回放（更适合人看）
bun run codex:ansi-color-demo:report

# M5：mask 演示（随机 token -> 稳定快照）
bun run codex:m5-mask-demo
```

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

## Script DSL (TypeScript)

用 TS builder 写 script（类型安全，可组合，支持自定义 step），底层仍复用同一个 runner：

```bash
bun run script:run scripts/m6_dsl_demo.ts
```

约定：
- module 默认导出（`export default`），或导出 `script`/`scenario`。
- 可选导出 `steps`（custom step handlers），用于执行 `type:"custom"` 的步骤。
- 常用 handlers 可复用：`src/scenario/steps/*`。

## Cast -> SVG/GIF (可选)

录像类产物建议只用于失败诊断或人工验收；稳定回归优先用 `snapshot_grid` 做 diff。

- SVG: `svg-term`（例如：`bunx svg-term --in .tmp/trace_demo.cast --out .tmp/trace_demo.svg`）
- TXT: `asciinema convert -f txt .tmp/trace_demo.cast .tmp/trace_demo.txt`
- GIF: `asciinema/agg`（例如：`agg --fps 30 .tmp/trace_demo.cast .tmp/trace_demo.gif`）
