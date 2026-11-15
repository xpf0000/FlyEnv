# AI Memory project conflict choice implementation plan

> Implement inline using superpowers:executing-plans and test-driven-development; independently review before completing.

**User requirement:** An occupied target directory must offer a user decision. If A and B are the same project, combine their memories; do not decide identity for the user or overwrite either collection.
**UI decision:** No default or automatic merge. The conflict dialog offers “同一项目，合并两份记忆”, “不同项目，重新选择目录”, and Cancel. Keep a pending decision in the module-local maintenance controller across page re-entry. The two substantive actions have equal visual weight.
**Architecture:** Merge project identities logically, retaining every physical scope directory/record ID/body/history/tombstone and request digest. A remains the active project ID at the selected target path; B and all group members remain physical data owners with a flat merged_into link. Active project listing shows one project. Path queries search all members; ID-based reads/updates/forget route to the original owner. New path-based stores use A; exact store replay probes original owners first. No source-code folders move and no record content is deduplicated.

## Operation/ownership and failure contracts

- Keep module state in existing module owners, no shared config/Pinia/service flow or MCP schema changes. ProjectRegistry serializes mapping changes; schema v2 records flat merge membership, supported alongside v1. Older plugin versions must refuse v2 rather than overwrite it.
- Private workspace reassociation is an exclusive barrier that drains preceding calls and holds later calls; engine stays open. Close and backup/restore wait for the merge. Group mutations serialize routing/probe/write so cross-member exact replay cannot create duplicate stores.
- Required prerequisites: resolve canonical target, verify expected source path and target ID/current mapping revision from the conflict shown, validate membership and memory-ID uniqueness, preserve previous mapping, atomically commit the new mapping. Failures before commit leave both projects unchanged. No separate record rewrite/copy transaction is needed.
- Root/member names, IDs, record/body/history/tombstone bytes remain unchanged. Flat groups are bounded to 64 scopes, validation to 100000 record IDs. Duplicate memory IDs cannot be routed unambiguously: report that incompatibility and preserve both projects; never choose one copy or silently drop it.
- Conflict metadata is read-only. Re-select/cancel are neutral and write nothing. An explicit merge choice captures target ID and mapping revision; stale decisions must be offered again. Unknown retry uses exactly the captured parameters and confirms an already committed merge without merging twice.
- Search member scopes independently; report partial results if a member is unreadable. Routing/replay checks are required dependencies for mutation and fail closed when ownership cannot be verified. Multiple existing store receipts for the same request across original scopes return a conflict without choosing an owner.
- Presentation refresh/notices/preference promotion are supplementary. Keep the existing fresh-read and serialized-preference policies; promote selection for any merged member to retained A.

## Tasks

- [x] Add red/green backend tests for two-sided search/read/update/history/delete, store/deletion replay, restart/portable backup, grouped merges, stale choices, duplicate IDs and concurrency/shutdown barriers.
- [x] Implement schema/group validation, logical membership and original-owner routing with bounded validation and clear error results; preserve the five MCP tools unchanged.
- [x] Add controller/dialog decision flow with no default, duplicate prevention, cancellation/reselection, exact unknown retry, and member selection promotion tests.
- [x] Update compact Chinese/English UI and migration rules/README; no automatic identity guesses or deduplication.
- [x] Run appropriate plugin tests/types/lint/build contract/boundary checks, independent review and native isolated UI verification with synthetic data only.
- [x] Sync only task files into main workspace, retain existing edits and the original preview service; no commit/push or real user-data/service changes.

## Review and validation results

206 plugin tests pass (none skipped), scoped renderer/backend types pass, lint passes, plugin contract/build and renderer operation boundaries pass. Independent review identified retired-ID preference/view recovery after restart or restoring a merged backup; fixed with a failing/passing regression and shared selection normalization. Additional tests cover uncertain committed merge replay, independent cleanup warnings, inaccessible-member partial reads with fail-closed mutation checks, and corrupt/cyclic/v1 membership rejection.

Native isolated QA confirms the dialog has equal choices and no default selection; mapping is byte-for-byte unchanged before choosing. Different-project selection returns to the folder picker and cancellation keeps both projects. Explicit same-project selection changes only one mapping revision, leaves all four record/body file hashes and both original project IDs and lock inode unchanged, displays one active project, promotes an existing B selection to retained A, and exposes both original memories with readable original content. Screenshots and mapping/hash evidence are under `tmp/memory-project-merge-20261114` in the preview worktree. QA closed; user’s real app, memories and services unchanged.
