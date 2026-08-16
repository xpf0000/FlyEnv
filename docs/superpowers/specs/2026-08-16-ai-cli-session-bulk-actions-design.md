# AI CLI Session Bulk Actions Design

## Goal

Let users select and delete multiple saved sessions in one action, and start a new AI CLI session from a saved session group's working directory.

## Scope

- Apply to the grouped session pages for Claude Code, Codex, OpenCode, Copilot CLI, Kimi, and Antigravity.
- Add a small delete icon button immediately after the session-card title.
- Add a terminal icon button immediately after each working-directory path in the collapse header.
- Exclude Hermes. Its session data has no working-directory field and its module has no external-terminal launch operation.

## Non-goals

- Do not resume a saved session from the working-directory terminal button. It always starts a new CLI session.
- Do not add persistence, Pinia state, or a shared cross-module AI-session abstraction.
- Do not change individual session resume, individual deletion, installation, or service lifecycle behavior.

## Alternatives Considered

### A. Delete sessions by repeatedly calling the existing renderer API

The page could invoke `deleteSession()` once per checked session. This requires less fork code, but each existing method refreshes the list and displays a notice. A single bulk action would therefore produce redundant refreshes and race-prone UI updates.

### B. Per-module bulk-delete IPC (recommended)

Each existing module owns a `deleteSessions(sessionIds)` fork method and a matching module-local setup command. The fork returns the deleted and failed IDs as one result, while the setup refreshes the session list only once. This preserves each CLI's storage-specific deletion behavior without adding a shared abstraction.

### C. Shared AI CLI session controller

A common controller could normalize selection, deletion, and terminal handling for every AI CLI. It would have to encode the differing session stores and command syntax, widening the change beyond this user-facing feature. It is not justified here.

## Design

### Session-page selection and deletion

Each affected `Sessions.vue` owns a page-local reactive set of selected session IDs. It is view state and is discarded when the page unmounts.

Every virtualized table receives a leading checkbox column. Its header checkbox selects or clears the IDs currently visible after filtering, across all displayed working-directory groups. Toggling a checkbox stops event propagation so it never triggers the table row's existing resume action.

The card header keeps the existing refresh control. A small, tooltip-labelled, danger-styled delete icon button appears immediately after the **Sessions** title and is disabled when nothing is selected or a batch delete is in flight. Clicking it shows the established localized destructive-action confirmation once. Confirming calls the module setup's `deleteSessions(selectedIds)` command.

After a successful result, the page removes deleted IDs from the selected set; the setup refreshes the list once and reports the existing localized success message. If any IDs fail, the setup reports failure and the page retains those IDs, allowing retry. A refresh also prunes selections that no longer exist in the retrieved list.

### Working-directory terminal launch

The current collapse `title` prop becomes a title slot containing the working-directory text and a small, tooltip-labelled terminal icon button. Clicking the button stops propagation so the group does not collapse or expand.

The button calls an explicit module setup command, `startSessionInTerminal(workDir)`. That command sends one IPC request to the module fork. The fork opens the platform terminal with the existing `ExecCommand.runInTerminal()` facility, changes to the supplied directory, and invokes the bare CLI command:

| Module | New-session command |
| --- | --- |
| Claude Code | `claude` |
| Codex | `codex` |
| OpenCode | `opencode` |
| Copilot CLI | `copilot` |
| Kimi | `kimi` |
| Antigravity | `agy` |

The current per-session resume command remains unchanged. Terminal command construction follows its existing platform split: `cd "<dir>"; <command>` on Windows and `cd "<dir>" && <command>` on macOS/Linux. A missing working directory uses the existing home-directory fallback where the module already has one.

### Operation Contract

The existing module-local setup singletons, each bound with `reactiveBind`, own the new renderer operations. Pages bind state and invoke setup commands; they do not send IPC directly.

| Contract item | Batch deletion | Start new terminal session |
| --- | --- | --- |
| Owner/lifetime | The affected AI CLI module's `setup` singleton | The affected AI CLI module's `setup` singleton |
| Start event | User confirms deletion of checked session IDs | User clicks a working-directory terminal icon |
| Request snapshot | De-duplicated selected IDs | The clicked working directory |
| Intermediate events | A single fork request; no terminal/progress events | A single fork request; no terminal/progress events |
| Terminal events | Success, partial failure, or failure | Terminal opened or failure |
| Duplicate invocation | Disabled while that module's bulk deletion is in flight | Same directory launch is ignored while its request is in flight |
| Process interaction | Fork owns deletion from CLI-specific storage | Fork owns terminal process launch; renderer state is never liveness state |
| Cleanup | In-flight flag is cleared on all result paths; list refreshes once after mutations | Per-directory in-flight state is cleared on all result paths |

No new Pinia store or configuration persistence is introduced. These operations do not use service start/stop/restart and do not alter child-process lifecycle ownership.

## Error Handling

- Empty selections never produce an IPC request.
- Duplicate IDs are removed before the batch request.
- A terminal-launch error uses the module's established failure notice.
- Partial deletion returns failed IDs; successful removals remain deleted, failed IDs remain selected, and the refreshed list reflects the source of truth.
- The terminal path button launches a new CLI command without a session ID, `--resume`, `resume`, `--session`, or `--conversation` argument.

## Verification

- Add focused `tsx` source-level regression coverage for all six renderer pages: checkbox selection, filtered select-all, selection-click propagation, disabled header delete control, one confirmation path, and the terminal icon in each collapse header.
- Verify every setup routes bulk deletion and new terminal launch through module-local IPC, not from the page.
- Verify all six fork modules accept array deletion requests, return partial failures, and preserve each module's session-store deletion method.
- Verify new terminal command mapping for every module contains its bare executable and no resume/session arguments; retain existing resume command behavior separately.
- Run the focused regression test, `yarn lint`, `yarn test:renderer-operation-boundaries`, and the relevant project build/type validation available in this repository.
