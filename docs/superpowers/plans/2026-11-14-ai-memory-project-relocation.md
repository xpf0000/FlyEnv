# AI Memory project relocation implementation plan

> Implement inline with superpowers:executing-plans and test-driven-development; preserve existing worktree edits.

**Goal:** After backup restoration or a project move, let users explicitly choose a new directory for the existing project, preserving its ID, records, history and deletion receipts.
**Approved scope:** The user accepted the preceding proposal to show old projects after restore and provide “重新关联项目目录”. No automatic identity guessing, project merge, project-file movement, client-configuration changes or new MCP tool is needed.
**Architecture:** ProjectRegistry owns a serialized compare-and-set path update. MemoryEngine exposes a private admin call; the existing MemoryWorkspace tracks it alongside normal operations so maintenance/shutdown wait correctly. The module-local maintenance singleton owns dialogs, captured inputs, result/unknown handling and re-entry. UI renders missing/unavailable paths prominently and keeps healthy projects collapsible.
**Constraints:** No new Pinia/shared configuration, no new process/service lifecycle, no exception authorization. Persistence uses the existing module-owned project mapping and AtomicFile policy. Backups and restore continue to keep the host lock inode fixed.

## Operation and failure contracts

- Input includes project ID, the displayed old canonical path, and the selected existing local directory. Canonicalize the new root with realpath; reject a file, missing path, stale old path or another project's registered destination. Preserve name/ID and every record byte; only mapping revision/path change.
- Validate imported stored absolute paths in either POSIX or Windows syntax, while live request paths still must resolve on this machine. This permits reassociation of restored paths without claiming cross-platform plugin support.
- A repeated identical relocation whose destination already matches succeeds without another mapping write. Unknown writes expose an explicit “确认并重试” using the original captured inputs; do not silently start a second intent or guess success. Stale concurrent mappings fail with conflict. Required previous-mapping preservation failure prevents primary replacement; uncertain primary commits invalidate the registry cache.
- Renderer owner lifetime is the plugin module; one active relocation/backup/restore excludes other maintenance mutations. Folder cancellation and declined confirmation are neutral. Successful mapping persistence is the primary result; list refresh, selected-view refresh and notices are supplementary and may only add their own warning.
- Project-list reads are independent of internal mapping inspection/runtime path reads. Failure cannot appear as an empty healthy project list. Each project path availability check remains per-item.
- Legacy saved path selection is promoted to the retained project ID; returning to the graph uses its current path and all current filters. Normal ID selection remains stable.

## Tasks

- [x] Test path changes preserve memory identity/history/deletion receipts and can be found by the new path after restart and backup/restore.
- [x] Test collision/symlink aliases, stale expected paths, invalid targets, concurrent reassociation, repeated unknown primary commits and required previous-save failures.
- [x] Implement private registry/engine/fork route and module-local types without changing the five MCP declarations.
- [x] Add controller tests for selection/confirmation, reactive stages, duplicate/re-entry exclusion, cancellation, exact retry and supplementary refresh failure.
- [x] Add compact project rows to maintenance, show lost paths after restoration, add Chinese/English copy and update migration rules/README.
- [x] Run focused/full tests, lint, scoped types, plugin contract and renderer boundary checks; independently review the final delta and verify the real isolated UI.
- [x] Sync only task files to main workspace; do not alter real user memories, project folders or running services, and do not commit/push.

## Review corrections

- Post-mutation refresh drains older maintenance and shared project-list reads, then issues a fresh read. Differing saved-preference snapshots serialize so a pending old-path write cannot discard the retained-ID promotion.
- Capture optional legacy selection path before reassociation; the fork verifies canonical alias identity before changing the mapping. Ignore unusable relative/foreign optional hints instead of failing the required reassociation. Store verified operation-selection proofs in a bounded worker-local map so rotating projects.previous.json during independent MCP registration cannot erase an uncertain operation's selection identity. After a worker restart, only proof that can still be verified is used; do not guess an unresolved selection.
- Existing ProjectRegistry inspection Dirent inference was explicitly typed while touching that owner; scoped backend and renderer type checking is clean instead of carrying the prior two diagnostics.
- Added a portable-backup integration case: copy/rename a backup into a second data root, restore with missing original project path, explicitly relink, then read both original project and global record IDs.

## Final verification

190 plugin tests pass; scoped renderer/backend types, lint, plugin contract/build and renderer operation boundaries pass. Independent review findings were fixed with failing/passing regressions. Native isolated QA exercised missing directory rows, rejection of another project’s destination, successful relink, healthy state, updated management toolbar path and retrieval of the original revision-1 memory body. Two project IDs/names/creation times, all four record/body file hashes and the ownership lock inode were preserved; the other project’s mapping stayed unchanged. Evidence: `tmp/memory-project-relocation-20261114` in the preview worktree. QA closed; no real user data/client configuration/service changes.
