# ExecPlan

## Purpose
- 在 `ptywright/` 内实现一个**通用的终端可观测/可测试驱动器**（优先 TypeScript + Bun），面向任意 TUI（pi-tui / ratatui / ink / vim 类应用），提供类似 Playwright/CDP 的“查看当前界面状态”的能力。
- 第一优先级：**确定性与可回归**（能把“做着做着做坏掉”固定住）。
- 第二优先级：给 Agent“看界面”的能力（不强依赖 PNG 截图，先用更稳定的“终端语义快照”）。

## Milestones
按“稳定可回归（机器）”与“可视化可验收（人）”两条腿拆分，避免 flaky（KISS/YAGNI）。

### M0（已完成）：可通用驱动 MVP
- PTY 启动任意进程 + `@xterm/headless` 重建屏幕。
- MCP tools：`launch_session/send_text/press_key/resize/snapshot_text/snapshot_grid/snapshot_view/wait_for_text/wait_for_stable_screen/close_session`。
- 可读性补齐：`snapshot_ansi/snapshot_view_ansi` 作为 debug/人眼验收。
- 最小回归：Bun tests 覆盖 PTY+xterm 与 MCP smoke。

### M1：确定性 UI 回归（可 diff 的“终端 DOM”）
目标：快捷键/导航/面板切换/滚动等纯 UI 变更能稳定做 golden diff。
- 断言主路径：`snapshot_grid`（rows/cols/cursor/lines）+ 可选“样式 runs”（RLE）JSON。
- 流程断言：`wait_for_text`/regex + cursor/bufferType（normal/alternate）等契约。
- 稳定性工程：固定 cols/rows/TERM；增加 normalize/mask 规则（时间戳、spinner、随机 id）。
- 覆盖关键边界：alt screen、scrollback、clear/cursor movement、resize、Unicode 宽字符/组合字符、终端回包/查询（DSR/DA 等）。
- 可选边界（按需）：OSC 8 链接/调色板、图形协议（Sixel/kitty/iTerm2）——优先保证“文本/颜色/布局”主路径稳定。
验收：同一用例重复运行 20 次不 flaky；UI 改动能被 diff 捕获。

### M2：Trace/录像产物（更像 Playwright trace/video）
目标：每次失败都能“看过程”，降低排查成本。
- 录制：产出 asciicast v3（或兼容）事件流（output/input/resize/marker/exit）。
- 报告：生成 `report.html` 回放 + filmstrip（关键步骤 `snapshot_view`/`snapshot_view_ansi`）。
- 可选渲染：`cast -> gif/svg`（agg、svg-term-cli），或用 vhs/terminalizer 生成 gif/mp4（建议只在失败或 TRACE=1 时生成）。
验收：在本仓库 fixtures 上生成可回放产物；CI/本地一键打开验收。

### M3：交互增强（鼠标/点击）
目标：覆盖“仅靠键盘不够”的 TUI（可选，按需推进）。
- 支持 SGR mouse 上报/发送 click（坐标基于 cols/rows）。
- MCP tool：`send_mouse`（move/down/up/click + modifiers）。
验收：对 sample app 能用点击触发可见 UI 变更并可断言。

### M4：框架特化加速（可选）
目标：在保持通用 PTY 路径的同时，给 ratatui/ink 等提供更快更确定的“框架内测试”。
- ratatui：TestBackend 快照（insta 风格），不依赖 PTY。
- ink：frame/lastFrame 断言（不依赖 PTY）。
- 统一断言接口：同一套 scenario 可以选择 backend（pty vs in-process）。
验收：同一 UI 用例既能走 PTY 端到端，也能走框架内快速回归。

### M5：Agent（LLM）测试分层（可选）
目标：把“可确定 UI/流程”与“不可确定模型输出”隔离，避免互相污染。
- 可确定：LLM stub 或 record/replay（cassette），做稳定回归。
- 不可确定：live smoke 只断言流程契约（出现响应、工具调用序列、状态转换），不断言文案。
验收：CI 主测试全部确定；live smoke 独立跑、失败不阻塞主线。

## Progress（按里程碑滚动更新）
- [x] M0：可通用驱动 MVP
- [x] M1：确定性 UI 回归（grid style-runs + golden + 边界 fixtures）
- [x] M2：Trace/录像产物（cast + report + 可选 gif/svg）
- [x] M3：交互增强（鼠标/点击）
- [ ] M4：框架特化加速（ratatui/ink adapters）
- [ ] M5：Agent/LLM 测试分层（stub/record-replay + live smoke）
  - [x] M5.1：快照 mask/normalize（避免断言不稳定文案）
  - [x] M5.2：Scenario runner（JSON 脚本化用例 + report/golden）
  - [ ] M5.3：LLM cassette（record/replay + live smoke）

## Surprises & Discoveries
- 有 Rust TUI 项目通过 `vt100` 虚拟终端后端做快照测试，证明“字符栅格快照”是稳定且高性价比的回归手段。
- `cargo search` 在当前环境对 crates.io 存在 SSL 问题，但 crates.io HTTP API 可访问；Rust 方案可行但依赖拉取需提前验证。
- Bun 已安装（`1.3.6`），可以优先走 Bun 生态（`bun-pty` / Bun 新 terminal 能力需要先做 spike 验证）。

## Decision Log
- **先不做点击**：鼠标点击依赖目标应用开启 SGR 鼠标上报；MVP 先把“渲染可观测 + 可断言”做稳（YAGNI）。
- **截图≠最佳主路径**：终端的“截图”更稳定的对应物是**屏幕网格模型**（rows/cols/cell），PNG 仅作为 debug/可视化附加产物（KISS）。
- **优先 TS+Bun**：工程速度快、MCP SDK 生态成熟；PTY 层若 Bun 不稳定，再退回 Node 的 `node-pty`（OCP：可替换实现）。
- **终端仿真用 xterm headless**：用成熟解析器把 ANSI/VT 序列变成可查询的 buffer，避免自研解析器带来的不确定性（DRY/KISS）。

## Outcomes & Retrospective
- 目标输出：一个可独立运行的 `ptywright`，以及一套可重复执行的回归测试样例（golden snapshots）。
- 若出现 flaky：优先补 `wait_for_stable_screen` 与 deterministic 配置（禁动画/固定尺寸/固定 TERM）。

## Context and Orientation
需求约束（来自用户输入）：
- 被测 TUI：当前基于 `pi-mono/pi-tui`，但需要**通用**（不能只测某一个框架）。
- 交互：短期不要求鼠标点击；重点是“渲染可测试/可观测”。
- “截图”目的：让 Agent 理解当前界面；如果 PNG 不适合，允许用更正确的“终端版 DevTools”表示法替代。

非目标（本轮明确不做）：
- 不做像素级视觉回归（PNG diff）。
- 不做通用 UI 语义逆向（把字符网格还原成按钮/列表等组件树），只做“足够好用”的文本/网格定位能力。

## Plan of Work
分三层交付，逐层增强可测试性与可观测性：
1) **Driver 内核**：PTY 会话管理 + 输出采集 + 终端仿真（屏幕网格）
2) **MCP 外壳**：把 Driver 能力作为 MCP tools 暴露给 Agent/测试框架
3) **回归资产**：golden 快照 + 稳定等待策略 + 失败诊断产物（最后 N 帧/日志）

## Concrete Steps
按里程碑拆分为可独立交付的小步（SOLID/OCP）：
1) M1：确定性 UI 回归
   - 增加“样式 runs（RLE）”结构化快照（用于更精确 diff）。
   - 增加 normalize/mask 规则与 golden 更新流程。
   - 增加边界 fixtures：alt screen / scrollback / resize / unicode width+combining / terminal query（DSR）等。

2) M2：Trace/录像
   - Session 事件流：output/input/resize/marker/exit。
   - 产出 `.cast` + `report.html`；可选 `cast->gif/svg`。

3) M3：鼠标/点击（按需）
   - SGR mouse 输入、坐标映射、最小 sample 验收。

4) M4：框架特化（按需）
   - ratatui/ink adapters 与统一断言接口。

5) M5：Agent/LLM 分层（按需）
   - stub/record-replay 与 live smoke 的隔离。

## Validation and Acceptance
MVP 验收标准（可自动化）：
- 能启动任意命令（至少 `bash` + 一个 fixture 程序）并稳定返回 `snapshot_text`。
- `wait_for_text`/`wait_for_stable_screen` 在异步输出下不 flaky（重复跑 20 次不随机失败）。
- MCP tools 可被调用并返回可复现结果（同输入 => 同快照）。
- 失败时能导出诊断信息：最后 N 帧快照 + 原始输出片段。

## Idempotence and Recovery
- 所有 session 由 `session_id` 管理；重复启动同名 session 时先关闭旧会话，避免资源泄漏。
- 任何超时/异常都会返回结构化错误，并自动附带最近一次快照摘要，便于定位。
- 提供 `close_session` 与进程树清理策略（只杀该 PTY 子进程，不影响外部）。

## Artifacts and Notes
- 计划产物路径（建议）：
  - `src/pty/`：PTY 抽象与实现（bun-pty / node-pty）
  - `src/terminal/`：xterm headless 封装与快照/等待
  - `src/mcp/`：MCP server 与 tool 定义
  - `tests/fixtures/`：可控输出的终端程序/脚本
  - `tests/golden/`：golden 快照

## Interfaces and Dependencies
- Runtime：Bun（优先）/ Node（fallback）
- PTY：`bun-pty`（优先）或 `node-pty`（fallback）
- Terminal model：`@xterm/headless`
- MCP：`@modelcontextprotocol/sdk`
- （可选后续）截图可视化：grid -> SVG/PNG（先不纳入 MVP）
