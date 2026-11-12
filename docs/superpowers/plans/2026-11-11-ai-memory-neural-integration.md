# AI Memory Neural Star Map Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Replace the AI Memory plugin's Canvas2D star map with the user-approved golden neural preview, retaining eight functional type hubs and real search/detail behavior.

**Architecture:** Port the approved rendering primitives into plugin-local `render/neural/`. A pure adapter creates eight hubs for the real MEMORY_TYPES, positions only actual SearchHit nodes, and reuses the existing topic/tag relationship policy. The mounted MemoryUniverse owns view state and WebGL lifetime; the existing manager retains all search/detail/mutation ownership.

**Tech Stack:** Vue 3, TypeScript, Three.js 0.187.0, existing plugin builder/runtime.

**Spec:** User-approved preview in tmp/ai-memory-neural-preview, final loop plan docs/superpowers/plans/2026-11-11-ai-memory-film-alignment-loop.md; explicit instruction “效果可以了. 替换AI记忆插件里的星图吧.” This authorizes implementation without a new visual approval checkpoint.

## Global Constraints

- Work in the existing feat/ai-memory-neural-preview worktree; preserve all previous preview/dependency/document changes. No commit/push/install into the user's persistent plugin/data directory.
- Copy the accepted no-volume visual primitives, never preview simulated memory data or mock telemetry. No whole-volume subsystem in the product.
- Real plugin types replace mock preview names, but eight hubs and their approved arrangement remain; real IDs retain scope/project identity.
- Module checklist: no new config persistence, Pinia, shared service types, fork/IPC or service lifecycle changes; no exceptions required. Inputs, hover, selection, focus, animation flags and renderer are mounted view state.
- Existing manager owns all asynchronous memory operations, unchanged. WebGL rendering is synchronous page-local work, with RAF/ResizeObserver/DOM/GPU resources owned by one scene and destroyed on replacement/unmount/deactivation. Duplicate initialization is a no-op. No external process operation contract is added.
- Required dependency: WebGL/scene creation; failure shows localized existing list-view fallback, no memory operations replay. Decorative layer shader failures disable only that layer. Context loss releases the scene and exposes fallback; recovery may recreate it with current search snapshot. Failed visualization must not affect search/detail data or existing completed operations.

## Review Focus

- Same UUID in global/project hits selects the correct original SearchHit; no fabricated memories or semantic edges.
- Empty/sparse/single-type pages still have eight type hubs and bounded geometry; filter/page updates discard stale selection.
- Rapid list/star-map, tab and route switching releases RAF, observer, context listeners, overlays, geometry, materials and render targets; no stale callbacks.
- Reduced motion, WebGL/context/shader failures and document visibility preserve usable controls and list fallback.
- Small actual plugin viewport fits the entity; category focus, drag, zoom and node detail remain operable in both languages.

## Tasks

- [x] Task 1 — Pure data adapter: `render/neural/model.ts`, `render/neural/data.ts`; behavioral tests `tests/neural-model.test.ts` for eight true types, original hit identity and scope collisions, stable placement, memberships versus real semantic relationships, empty and archived/pinned cases. Run RED then GREEN with existing universe suite.
- [x] Task 2 — Port accepted render primitives (`camera`, `edge-material`, `entity-model/scene`, `circuit-field`, `outer-arc-model/layer`, `ribbon/material`, `shader-failure`, `scene`) and relevant geometry regressions to plugin tests. Strip dormant volume and mock-data imports. Replace MemoryUniverse with page-owned scene wrapper and native controls, accessible eight-type focus buttons, localized status/help and fallback. Add reduced motion, visibility, context loss, replacement and unmount cleanup. No preview HUD/counts/mock content.
- [x] Task 3 — Run plugin tests, targeted types/lint and real plugin package build. Inspect the actual component with real-shaped controlled hits in native WebGL, selection/focus/filter replacement and list/remount lifecycle; inspect full plugin integration where possible. Final fresh independent review, fix important findings, record results and limitations.

## Ledger

Design decision: the approved preview is the visual spec; replace its mock categories with actual types and no generated memory records. Preserve the existing topic/tag policy; decorative geometry never participates in detail selection or relationship counts.

Task 1: adapter tests RED missing module → GREEN after providing scoped real-hit mapping and eight stable hubs; baseline original universe4/4. Archived/pinned test fixture initially inherited pinned=true, corrected fixture to explicit false (not a product defect).

Task 2: ported accepted no-volume rendering and relevant geometry tests (36/36 combined map tests). Mounted wrapper owns RAF, media/visibility/context listeners and lifecycle cleanup. All plugin tests126/126, package contract build and targeted TypeScript/lint pass.
Final review: no Critical; Important parent Index omitted empty successful pages despite adapter support. Native search for nonexistent title reproduced old el-empty (RED). Changed parent to mount on available search data, with localized empty caption and zero real records; native GREEN pending. Minor (deferred): initial camera distance is based on1×1 before observed resize, creating the inherited introductory pull-in animation. No correctness effect; approved visual behavior preserved.

## User steering: all data in star map (2026-11-12)

The user explicitly requires no star-map pagination and all matching records. List pagination remains. Implement as `MemoryController.search(target, filters, all = false)` with all-mode consuming API cursor pages (maximum20 per request) until terminal cursor, aggregating once before scene publication. The manager owns immutable target/filter snapshots, duplicate in-flight coalescing, stale-query sequence guards, IPC listener/timeout cleanup and terminal partial/failure result. View only selects mode and binds searchBusy/searchResult. Busy covers every page; progress responses remain nonterminal. Changing mode/scope/filter or clearSearch invalidates older results and stops their follow-up pages; an in-flight request still reaches its existing owned terminal/timeout cleanup. No process/service interactions.

Required dependency: each next cursor page; failed/invalid/repeated cursor stops that query, preserves already gathered records as partial+truncated with localized error, never silently declares all loaded or automatically retries. Per-page warnings aggregate/deduplicate; genuine partial scope reads remain partial while valid pages continue. Same-scope record duplicates deduplicate; scope/project identity stays distinct. Final successful aggregate omits next_cursor/truncated=false. Existing list search behavior retained. UI switches refresh from first page; pager only renders in list mode. Tests cover multi-page busy/final, duplicate invocation and input snapshots, stale page query cancellation/clear, partial/error/warnings, loop cursor, and list regression. Native full plugin fixture contains48 records and must display48 with no pager.

## Superseding single-request design (user explicitly requested)

The cursor-loop approach above is superseded before delivery. Internal fork admin methods universe/universeForProject resolve the same scope, load the same cached metadata snapshots and reuse rankMetadata for all matches once. No body reads, pagination, metadata wire abbreviation or search response-byte cap for this internal visualization response; existing scope/cache budgets still bound reads. MCP methods remain search/get/store/update/forget and search limits unchanged. Controller all-mode sends exactly ONE IPC, owns snapshot/dedup/sequence/busy/timeout/listener cleanup; same existing request terminal behavior. Invalid records remain isolated warnings/partial; required scope load failures remain failures and never replay. Native acceptance remains48 visible, no map pager, list still paginated. Full-data rendering must preserve every memory and complete semantic neighborhoods while bounding rendered edge density.


## Final verified delivery (2026-11-12)

- Final approach is a single internal universe/universeForProject request; no cursor loop ships. All matching metadata is returned from the established snapshot/ranking path. MCP search validation, limits and five tool names remain unchanged. All-mode IPC tests verify exactly one request, stable snapshots, duplicate coalescing, progress, latest-query and clear protection. Backend tests verify25 large summaries returned in one response, project/global filtering, no bodies/metadata omissions and corrupt-record partial isolation.
- All133 plugin tests pass; targeted lint and renderer-operation boundaries pass. Changed Vue/TS check yields only2 existing ProjectRegistry.ts:292 diagnostics (isDirectory/name on never); a separate pristine main-workspace engine check reproduces the identical2. No new diagnostics. Earlier whole-project vue-tsc was stopped after7minutes without diagnostics; no claim of whole-project type success.
- All1000 same-topic nodes retained; exact499500 semantic relationships counted;999 direct neighbors remain available on selection/category focus. Global draw-edge sampling is at most4N, while selected direct relations are complete; relation groups avoid allocating an O(N²) edge array. Dense-model regression passes.
- Fresh independent review: initial Important empty-parent gate fixed (native RED old placeholder→GREEN0 real records+8 hubs); final Important discriminated-union Omit type fixed with ScopeRef intersection, runtime direct-project test and static no-new-diagnostics. No other Important/Critical findings. Minor deferred: inherited first-mount camera pull-in from initial1×1 bounds remains; does not change final fit or data behavior.
- Native full FlyEnv isolated profile/real dedicated plugin worker:48 stored records visible once,8 categories×6,456 real relationships, no star-map pager. List switch shows8 records and Previous/Next; returning to map restores48/no pager. All8 category focus buttons checked; real memory node opened existing detail drawer with full worker body; empty query and3 list/map cycles checked. Only controlled QA data was written; no user memory/database/plugin install touched.
- Product scene resources, RAF, media/visibility/context listeners disposed on remount/unmount/deactivation; QA application/server stopped and user127.0.0.1:5173 preview stillHTTP200. Existing environment Helper/proxy/startup diagnostic noise was present in the full-host fixture; no new neural shader failure observed. No cross-GPU/mobile matrix or long GPU soak claimed.
- Minified plugin package built and archived via packPlugin without changing plugin registry/version or publishing. Delivery/evidence copied to main workspace tmp/neural-plugin-integration-20261112 (final-plugin.png, ai-memory-neural-0.1.0.7z, final-ui-check.json, test/type/lint/boundary/build logs). Source changes remain uncommitted in feat/ai-memory-neural-preview worktree; no commit, merge or push.

## Local master integration authorization (2026-11-12)

User explicitly requested merging to master. Commit only plugin implementation/tests, Three.js dependency/lock changes and the two final loop/integration records. Preserve main worktree staged/unstaged/untracked documents byte-for-byte; keep the existing preview worktree and127.0.0.1:5173 service because ignored preview assets and prior scratch plans still live there. No remote push requested.
