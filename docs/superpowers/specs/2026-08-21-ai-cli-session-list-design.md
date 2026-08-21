# AI CLI Session List Design

## Goal

Load every available AI CLI session by default while reducing the time spent reading local session metadata. Show a loading overlay whenever a session list is being fetched.

## Session Sources

- Claude Code reads one JSONL file per session.
- Codex reads JSONL files from its date-based session tree.
- Kimi reads one `state.json` file per session after loading its work-directory index.
- Antigravity reads one SQLite database per session.
- Copilot CLI performs one SQLite query.
- OpenCode and Hermes each execute one CLI listing command.

## File Read Concurrency

Claude Code, Codex, and Kimi will enqueue their per-session metadata reads in a fresh `TaskQueue` for each list request. The queue has a fixed concurrency of four, so the fork process reads several files at once without opening an unbounded number of large JSONL files.

The result array is indexed by the discovered file order before it is deduplicated and sorted. This preserves deterministic ordering when timestamps are equal. Parsing errors keep the current tolerant behavior: a malformed or unavailable session file does not fail the full list.

Antigravity's SQLite parser is synchronous and cannot gain true parallelism from a promise queue. Copilot CLI, OpenCode, and Hermes already obtain their lists from one query or one command, so they will retain their existing fetch strategy. Hermes' per-row debug logging will be removed.

## Renderer Operation Contract

| Item | Contract |
| --- | --- |
| Owner | Existing AI CLI module setup singleton |
| Lifetime | The singleton outlives an individual session page mount |
| Start | Session page mount or refresh button |
| Intermediate | `sessionLoading` remains true while the fork request is pending |
| Terminal | IPC callback, regardless of response code, clears `sessionLoading` |
| Duplicate refresh | Return the in-flight request instead of issuing another IPC request |
| Service interaction | None; reading session metadata does not start or stop a service |
| Cleanup | IPC listener is removed in the terminal callback |

`sessionLoading` is renderer operation state, separate from existing module initialization and terminal-operation flags. It is not persisted and does not belong in Pinia. Each session view binds the content region to that state so a spinner overlay is visible on initial entry and manual refresh.

## Verification

Add a focused script test that verifies the bounded queue helper completes all tasks, caps concurrent reads at four, and tolerates a failed task. Extend the AI CLI session structural test to require queued reads for Claude Code, Codex, and Kimi; independent `sessionLoading` state and single-flight refresh behavior in every session setup; and loading bindings in every session view. Run the focused session test and renderer operation-boundaries test after implementation.
