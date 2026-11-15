# AI Memory Management Integration Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved layout inline.

**Goal:** 将用户确认的 management.html 迁入真实 AI Memory 管理页面，保持全量星图、八分类与水平居中。

**Architecture:** Index.vue 保留真实查询、scope、编辑与控制器绑定；MemoryUniverse.vue 保留场景生命周期并提供工具条、通知与详情插槽；MemoryBrowser.vue 仅呈现概览/分类列表。无后端、MCP、服务或共享状态改动。

**Tech Stack:** Vue 3 / TypeScript / Element Plus / 既有 Three.js 场景。

**Spec:** 用户已确认的 tmp/ai-memory-neural-preview/management.html、management.css、management.ts，最终 centered.png，以及本轮明确迁移授权。

## Global Constraints

- 移除总表格、分页、视图切换与高级筛选；保留 scope、关键词、新增和其他三个功能页。
- 一次 manager.search(target, { queries }, true) 全量查询；类别选择仅改变显示/聚焦。
- 左概览/分类列表与右真实详情独立；收起详情不重置分类；左右面板不改变画布宽度/中心。
- 不迁移 fixture、模拟写入或 stub 导航；不修改用户原暂存文档或预览服务。
- 无新的 Pinia、config.setup、持久化或模块公共类型；不需要例外授权。

## Operation Contract / Failure Boundaries

- View state: mounted Index owns tab/scope/query/dialog/selected hit; mounted Universe owns category, hover, camera and mobile panel toggle.
- Existing singleton MemoryManager/controller owns query, immutable request snapshot, duplicate coalescing, detail request sequencing, mutation progress/notices/result/retry and cleanup across page destruction. Existing fork owns data. No new operation IPC or external process.
- Start: current scope/query submitted; intermediate searchBusy/detailBusy or mutation status; terminal existing controller success/error/unknown. Duplicate and stale-result behavior unchanged. No automatic mutation replay.
- Required query failure is visible and does not fabricate results. Independent project metadata warnings remain visible without rejecting successful search. Optional WebGL failure only disables visualization; category list and real detail remain usable. Scene disposal removes context listener before context loss.
- Verification covers real one-request full data, detail/edit/archive/delete flow, search/empty/scope/navigation/reentry and independent sidebars.

## Review Focus

- Async selection/query replacement must not expose stale detail or highlight across scopes.
- Empty/error/WebGL fallback still allows creating or browsing real memories.
- Long titles/content and small host windows scroll within panels without covering toolbar/categories.
- Unknown/pending writes retain controller ownership and visible recovery UI.
- Other tabs, directory picker and onboarding remain reachable.

### Task 1: Migrate approved layout and verify real flows

**Files:** Index.vue, MemoryUniverse.vue, new MemoryBrowser.vue, lang/en.ts, lang/zh.ts; existing controller/backend unchanged.

- [x] Replace old list/filter shell with slotted toolbar/notice/detail, retaining real handlers and dialogs.
- [x] Port overview/category browser and selected row identity from real NeuralData; retain complete actual relation count and eight type counts.
- [x] Port approved black/gold panel layout; preserve equal canvas insets and scene lifecycle, responsive overlays.
- [x] Run plugin tests, targeted Vue/TS/lint, operation-boundary and plugin build/contract checks; real isolated Electron interaction and screenshots.
- [x] Independent final review, fix important findings, copy verified product changes into main workspace as uncommitted changes (do not merge/push or disturb staging).

## Ledger

- Approved prototype is the behavioral baseline; verification is real native UI plus existing functional tests, rather than source-string tests for CSS/markup.
- No new persistence, controller or backend contract required; migration stays in renderer component/language files.

- Verification: root 133/133 plugin tests, renderer operation boundaries, lint, minified plugin package and plugin contract passed. Universe/Browser targeted vue-tsc clean; expanded Index graph has identical baseline three diagnostics (ProjectRegistry:292 x2; NodeFn:297), zero new.
- Native: full isolated app, 48 total/8x6 categories/456 links, desktop independent sidebar and close retention, real detail (19 neighbors), editor save then keyword match1, no-match0, three other tabs, reentry, and 1440x600/1000x600 footer and collapsible list/detail verified. Existing host setup/helper warnings remain outside plugin scope.
- Final review: two P2 layout findings corrected: isolate canvas stacking context beneath browser; reduce minimum universe height to500 and allow outer main-block scrolling. Short window clipping reproduced before and footer visible after (screenshots). Long unbroken summary/tag wrapping restored on detail panel.
- WebGL fallback stacking correction reviewed in source; the attempted Chromium disable-webgl QA flag did not disable rendering, so no fresh forced-context-loss claim for this layout migration.
- Main workspace synced six files; existing staged documentation unchanged. No commit, merge, push or installed-user-plugin replacement. Original5173 preview preserved.

## Follow-up: heading path and camera tools

User specifies: path immediately after MEMORY SPACE scope name, hover yellow-500 and click opens folder; camera controls replace top-right counts; remove bottom-left help. Keep counts in left overview. Index supplies heading slot and selected/raw project path; manager owns folder-open action via existing shell dependency, keyed by immutable path, duplicate clicks coalesce, complete/failure retained and failures notify without altering search/detail. No new IPC/state store/service/persistence or exception. Verify action success/coalescing/failure and targeted Vue build/lint.

- Follow-up verification: directory action duplicate/success/failure tests and adapter regression RED→GREEN. Actual Finder opened correct folder; existing shell bridge returns true (dispatch acknowledgement), unlike declared Electron empty-string result; module-local directory adapter now accepts both without false error. Transport/error strings still fail without replay. Native screenshot confirms heading path/top-right tools and removed bottom help; full137 tests/lint/plugin contract/package/renderer boundaries passed.

## Follow-up 2026-11-13: icons and type accents

User requests folder/terminal icons in place of visible project path, icon-only Search/New with accessible labels/tooltips, eight existing MEMORY_COLORS on browser/detail, no scope tag under detail title, and restrained detail action styling. Use existing Element Plus icons, subtle type-colored edit/archive outlines and muted destructive outline; retain deletion confirmation.

Terminal operation contract: existing singleton MemoryController owns immutable path, keyed project:terminal:path duplicate coalescing, running/completed state and notification; manager invokes established host tools openPathByApp (Terminal on Unix, PowerShell on Windows) through forkTerminalRequest; code200 remains intermediate, code0/1 terminal, listener/timeout cleanup belongs to existing request helper. This only launches a user terminal in the folder; host fork owns platform process, no managed-service liveness/stop changes. Failure only reports this launch, never changes search/detail or replays. No new store/persistence/public types. Verify duplicate/pending/success/failure behavior and existing full plugin/native UI checks.

- Nov13 verification:139 plugin tests, lint, component Vue types, plugin contract/package and renderer boundaries passed; independent review no actionable issues. Native final package confirms icon toolbar, purple/blue independent accents, no scope badge and unified outline actions. Terminal button dispatches selected path; Terminal window access rejected by Computer Use safety policy, so live cwd/output verification is incomplete (no bypass). Evidence tmp/memory-management-icons-20261113.
