# AI Memory maintenance implementation plan

> Use superpowers:executing-plans to implement and verify each task inline.

**Goal:** Replace maintenance instructions with styled, working backup, restore, project-link inspection and folder actions.
**Architecture:** Keep UI in MemorySetup.vue, renderer operation state in a module-local singleton, and all data access in the dedicated plugin worker. Reuse the existing engine and folder bridge; add no shared configuration, Pinia state, MCP tools or service start/stop flow.
**Requirements:** User explicitly requested styling consistent with AI Memory and one-click actions with minimal explanatory copy. Backups include all scopes, history and deletion receipts; restore explicitly confirms replacement and automatically preserves current data. Project inspection reports mapping health, not whole-record integrity.

## Operation contracts and failure boundaries

- Backend workspace owns a maintenance barrier for the worker lifetime. Ordinary calls remain concurrent, calls before maintenance finish first, subsequent calls wait; backup/restore are exclusive. Shutdown drains both. No MCP server restart or plugin toggle is needed.
- Renderer singleton owns dialog selection, immutable operation inputs, IPC terminal handling, notifications and re-entry state. Duplicate clicks share the existing promise; code 200 is progress; cancellation is neutral; timeout of a write is unknown and never silently retried.
- Backup: selecting an external parent is required; snapshot validation/copy/publication are required. Publish a unique folder containing a manifest and complete data. Failed copies never appear as completed backups. Opening the saved folder is a separate action.
- Restore: select and confirm first; validate the manifest, names, checksums and real files before modifying live data. A full automatic backup is required before replacement. Stage/install with an on-disk rollback journal; initialize resolves interrupted installs before accepting calls. Preserve completed backup paths on failure. Never follow symlinks or accept ancestor/descendant input paths. Cleanup failures are supplementary warnings and never replay the restore.
- Inspection and folder actions are independent. Invalid mapping/unknown project-directory count stays visible; no destructive automatic repair or guessed project association.
- All new types/helpers stay inside plugins/ai-memory. Exceptions: none. Preferences/configuration remain unchanged.

## Tasks

- [x] Add tests for complete round-trip (global/project/history/deletion), invalid/tampered/symlink/inside-root backups, interrupted restore, concurrent calls, shutdown and failure recovery.
- [x] Implement backup file format and workspace barrier, then expose private worker backup/restore methods without changing the five MCP tools.
- [x] Add a renderer maintenance controller and adapter with deduplication, cancellation, unknown outcomes and preserved receipts; test re-entry and failure boundaries.
- [x] Replace instruction sections with black/gold, 12px rounded layout, 14px text, compact actions, concise check results and collapsed technical details; add English/Chinese strings.
- [x] Verify targeted/full plugin tests, focused types, lint, package contract and renderer boundaries; inspect the actual UI in an isolated native window without touching the user's data/services.
- [x] Sync only this task's files to master workspace; leave existing edits intact and do not commit/push/restart the user's app.

## Implementation review decisions

- Restore keeps the data root and `.flyenv-owner.lock` inode fixed. Only payload children move through a version-2 moving/installing/committed journal. The runtime lease is excluded from snapshots. This replaces the first directory-swap approach after real native-lock review exposed split ownership.
- Rollback first moves installed incoming children back into stage, then returns originals. Repeating recovery after an interrupted rollback remains safe for overlapping names. Cleanup failures preserve warning receipts and never disable a committed store.
- Returning to Memories reloads the selected scope. The maintenance controller captures the reactive operation proxy before awaiting dialogs/backend/refresh; a Vue computed regression covers terminal-stage notification and re-enabled buttons.
- Focused types for the UI/controller are clean. Including the backend reports only the same two pre-existing ProjectRegistry.ts:292 `never` diagnostics as the unchanged main-workspace backend; no new diagnostics.

## Validation evidence

173 plugin tests pass; focused UI types and lint pass. Backend types match the unchanged baseline diagnostics noted above. Plugin contract/build and renderer operation boundaries pass. Native isolated QA exercised actual folder selection, backup publication, restore confirmation, automatic safety copy, completed/enabled button state, preserved receipt across tabs, 1440px/900px layout, and restored project category count=1. The QA GPU cannot create WebGL; this run checked restored data through the existing category fallback, not 3D rendering. Screenshots and local test data are in `tmp/memory-maintenance-20261114` of the preview worktree. The user’s running FlyEnv app, client settings and real memories were not touched.
