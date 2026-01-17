# ptywright — Agent Notes

## 项目目标
- 构建一个**通用**的终端/TUI 可观测与可测试驱动器：通过 PTY 启动任意 CLI/TUI，把 ANSI/VT 输出喂给 `@xterm/headless` 重建屏幕网格，并以 MCP 工具暴露。
- 第一优先级：**确定性/可回归**（golden snapshots + diff），防止“做着做着做坏”。
- 第二优先级：让 Agent 能“看界面”（优先用终端语义快照，而不是 PNG）。

## 设计原则（必须遵循）
- KISS：优先实现最小闭环（PTY → xterm → snapshot → assert）。
- YAGNI：不提前做像素级截图 diff/组件树逆向/鼠标点击，除非里程碑明确需要。
- DRY：快照/等待/normalize 逻辑集中在 `src/terminal/*` 与 `src/session/*`，避免散落在 tests。
- SOLID：PTY 后端可替换（OCP），会话管理与渲染解耦（SRP）。

## 快速上手
- 安装：`bun install`
- 启动 MCP server（stdio）：`bun run src/index.ts`
- 单测：`bun test`
- Lint（type-aware + type-check）：`bun run lint`
- 格式化：`bun run format` / `bun run format:check`

## 目录结构
- `src/mcp/`：MCP server 与 tools 定义
- `src/session/`：`TerminalSession`（生命周期/等待/快照）与 `SessionManager`
- `src/pty/`：PTY 抽象与实现（`bun-pty`、`Bun.Terminal` 等）
- `src/terminal/`：xterm headless 封装、grid/text/ansi 快照渲染
- `tests/fixtures/`：可控输出的 demo 程序（用于稳定回归）
- `.tmp/`：本地运行产物（已在 `.gitignore` 忽略）

## PTY 后端选择（跨平台）
通过环境变量切换后端：
- `TUI_TEST_PTY_BACKEND=auto|bun-terminal|bun-pty`
- 默认 `auto`：mac/linux 优先 `bun-terminal`，win32 优先 `bun-pty`（避免平台差异）。

## 快照策略（可读性 vs 可回归）
- 断言主路径：`snapshot_view` / `snapshot_grid`（稳定、可 diff）。
- 人眼/调试：`snapshot_view_ansi`（包含 ANSI/SGR；在某些日志/JSON 输出场景会变得不可读）。
- 约定：不要默认在结构化返回里塞超长 `text`；需要时用显式参数开启（避免污染 Agent 上下文）。

## Script Runner（JSON）
- 用 JSON/TS 脚本文件驱动 TUI：`bun run script:run <file.json|file.ts>`（默认产物在 `.tmp/runs/<name>/`）
- JSON 可选加 `$schema: "../schemas/ptywright-script.schema.json"`，获得编辑器补全/校验。
- 批量执行：`bun run script:run-all`（递归扫描 `scripts/`）
- 录制脚本（MCP）：`start_script_recording` + 在关键处 `mark` + `stop_script_recording`

## 跨平台与换行
- `.gitattributes` 强制仓库存储为 LF；`.editorconfig` 统一编辑器行为。
- 尽量避免在 `package.json` scripts 里写 bash-only 逻辑（Windows 下会炸）；必要时用 `bun run scripts/*.ts` 替代。

## 里程碑
- 见 `plan.md`（M0–M5）。新增能力/扩展 scope 时同步更新里程碑与验收标准。
