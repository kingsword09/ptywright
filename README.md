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
- `resize`：调整终端尺寸
- `snapshot_text`：返回可见屏幕文本（适合 Agent “看界面”与做 golden）
- `snapshot_ansi`：返回带 ANSI/SGR 样式的可见屏幕（适合 debug/人眼验收）
- `snapshot_view`：更适合人看的快照（带元信息+行号）
- `snapshot_view_ansi`：带 ANSI/SGR 样式的 `snapshot_view`
- `snapshot_grid`：返回结构化屏幕网格（rows/cols/cursor/lines）
- `wait_for_text`：等待文本/正则出现
- `wait_for_stable_screen`：等待屏幕在 quiet window 内稳定（降低 flaky）
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

然后在 Codex 对话里让它调用 MCP tools（例如先 `launch_session` 再 `snapshot_text`）。

### 免转义运行 prompt（推荐）

把 prompt 写进文件，然后用 stdin 方式喂给 `codex exec`：

```bash
codex exec --skip-git-repo-check - < prompts/codex_help_test.prompt
codex exec --skip-git-repo-check - < prompts/ansi_color_demo.prompt
```

或用内置脚本：

```bash
bun run codex:help-test
bun run codex:ansi-color-demo
```
