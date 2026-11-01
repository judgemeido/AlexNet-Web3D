# 展区游戏入口接入实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 00、01、03 三个展区末尾加入风格统一、可直接打开的互动游戏入口，并把三个游戏的运行文件纳入 AlexNet 项目。

**Architecture:** 将三个独立游戏复制到 `games/` 下，保留各自原有 HTML、CSS、JavaScript 和相对资源路径。展馆只负责提供入口卡片，不重构游戏内部逻辑；入口由 `assets/museum.mjs` 统一生成，样式由 `gallery.css` 统一控制。

**Tech Stack:** 原生 HTML、CSS、JavaScript、Three.js 展馆、Node.js、npm、Playwright CLI。

**Spec:** 当前对话中的“00 放游戏一、01 放五子棋、03 放游戏二”要求。

## Global Constraints

- 只在 `feature/curated-history` 分支工作，不切换或修改 `main`。
- 保留未跟踪的 `$null` 和 `museum-scene-backup.patch`，不提交它们。
- 不修改约 39 MB 的 `script.js`，除非构建流程必须重新生成；本次入口接入直接修改源模块和样式。
- 三个入口使用 `target="_blank" rel="noopener"`，避免破坏展馆浏览状态。
- 入口文案保持中文，并体现 3D 模型、互动科普、故事推演、虚拟展馆四类体验定位。

### Task 1: 纳入三个游戏的可运行文件

**Files:**
- Create: `games/game-one/`
- Create: `games/gomoku/`
- Create: `games/game-two/`

- [ ] 复制游戏一的 `index.html`、`style.css`、`game.js`、`assets/favicon.svg`。
- [ ] 复制五子棋的 `index.html`、`css/style.css`、`js/ai.js`、`js/ai-worker.js`、`js/game.js`、`js/app.js`。
- [ ] 复制游戏二的 `index.html`、`style.css`、`game.js`、`assets/favicon.svg`。
- [ ] 检查三个入口页面中的 CSS、脚本、图标路径都只使用目标目录内的相对路径。

### Task 2: 在三个展区挂载统一游戏入口

**Files:**
- Modify: `assets/museum.mjs`

- [ ] 增加统一入口模板，包含编号、游戏名、简介、体验标签和“进入游戏”按钮。
- [ ] 将游戏一入口插入 00 展区引用区之前。
- [ ] 将五子棋入口插入 01 展区引用区之前。
- [ ] 将游戏二入口插入 03 展区引用区之前。
- [ ] 增加重复挂载保护，避免展区重新初始化时重复插入。

### Task 3: 完成展馆风格和响应式样式

**Files:**
- Modify: `gallery.css`

- [ ] 增加石墨、骨白、钛银、香槟金风格的入口布局、细描边、编号和状态标签。
- [ ] 确保按钮在桌面端醒目，在移动端可点击且不产生横向溢出。
- [ ] 入口区域保持信息层级清晰，不遮挡 3D 展项。

### Task 4: 构建和浏览器验收

**Files:**
- Verify: `index.html`, `assets/museum.mjs`, `gallery.css`, `games/`

- [ ] 运行 `npm run build`。
- [ ] 运行 `npm test`。
- [ ] 通过 HTTP 服务打开展馆，检查 00、01、03 三个入口的可见位置、文字和链接。
- [ ] 分别打开三个游戏，检查首屏可操作状态；检查五子棋 Worker 和主线程回退逻辑没有路径错误。
- [ ] 检查移动端宽度没有横向溢出。

### Task 5: 提交当前分支

- [ ] 仅暂存本次相关的 `games/`、`assets/museum.mjs`、`gallery.css` 和计划文件。
- [ ] 提交前复核 `git diff --cached`。
- [ ] 提交到当前 `feature/curated-history`，不操作 `main`。
