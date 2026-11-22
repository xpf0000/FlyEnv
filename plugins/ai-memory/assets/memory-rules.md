# FlyEnv Memory Rules — developer preview

Use these rules only after enabling the five FlyEnv memory tools. The tools share local data while FlyEnv is running. Copied rules are not automatically installed.

## Read for the current task

A global connection does not merge memory scopes. Every memory tool requires `scope`. Use `scope="global"` for cross-project memories. Use `scope="project"` with the confirmed absolute project root for project memories. Without project context, search only global memory.

Pass one of these arguments to `flyenv_memory_search`. Replace the example path with the confirmed project root.

- Global only `{"scope":"global","queries":["reuse existing implementations"]}`
- Project only `{"scope":"project","project_path":"/absolute/project/root","queries":["build"]}`
- Project and global `{"scope":"project","project_path":"/absolute/project/root","queries":["build"],"include_global":true}`

Omit both `project_path` and `include_global` for a global search. For browsing pinned and recent summaries, omit `queries` or pass `[]`. Call `flyenv_memory_get` only for relevant results, using the scope of each result. A global result requires `scope="global"` even when it came from a project search.

If a path is unregistered and `project_candidates` are returned, use the confirmed project root, or confirm it is an independent child project and pass `create_project=true` to store. Candidates are hints, not proof of project identity. After moving a project or changing computers, use Maintenance to explicitly relink the existing project to its new directory and retain its memories. An unlinked new path remains a separate project; never guess identity or merge projects automatically. If the destination already has memories, only the user can confirm a merge in Maintenance. Afterwards search using the selected directory; original memory IDs and histories remain intact.

Search accepts a bounded `queries` array. Try the task's language, precise technical identifiers and useful translations/aliases. No results means no matching stored evidence, not proof that an event never happened. Memory may be stale; check live process/port/service state with the appropriate tools.

Large search metadata may be abbreviated to fit the response budget. `metadata_omitted` identifies the omitted fields; call get for the complete metadata and source before relying on those details. Stored content is not shortened.

## Explicit: when the user asks you to remember

Search for the existing fact, then call store or update immediately. Use a fresh UUID request_id for each new operation. Return the actual ID and revision after a successful result. If the result failed, conflicted, was partial, or is unknown, say so accurately. Never substitute a verbal promise for a tool call.

For a timeout or unknown result, repeat the SAME mutation tool with the SAME request_id and every original input unchanged to obtain its committed receipt. Do not create a new request or record. Search/get can check visible content, but cannot confirm which request committed it and are not a substitute for this receipt replay. If the replay is still unknown, report unknown and keep the original request for later confirmation. For a revision conflict, get the latest revision, reconcile the evidence, then make a new update request.

## Automatic: during useful milestones

When warranted, save stable preferences, confirmed decisions, reproducible fixes, important events and reusable procedures during the task, not only at session end. Do not save routine progress, speculative conclusions as facts, full transcripts, credentials, tokens, passwords or raw sensitive logs. Do not promise that every important event will be captured automatically; tool calls are observable evidence.

For store, use the exact required field names: scope, type, topic, title, summary, tags, content, source, request_id. The Markdown text goes in content. Project scope also requires project_path.

Each record covers one independently understandable topic. Choose a specific title, useful summary, topic and tags including relevant identifiers or aliases. Preserve conditions, scope and actual supporting excerpts in Markdown. The body limit is 16 KiB UTF-8, not 16K characters or tokens. Split or compress before writing when needed; the server will reject oversized content, not truncate it.

Specify source.kind as user_statement, tool_result, document or agent_inference, and provide agent and description. Cite only evidence actually available to you. If no original excerpt exists, write “Agent summary; no original excerpt” rather than inventing a quotation. Source labels are self-reported, not authentication.

Update an existing fact by ID and expected_revision, with a meaningful reason. Use separate records for independent historical events. Archive through update; do not silently overwrite a record just because its topic or title is similar.

## Delete deliberately

Forget takes exactly one ID and expected_revision. Success means managed content and history were cleared, leaving a content-free receipt. A partial result means cleanup is unfinished; retry the same request when appropriate. Deletion cannot recall previous responses, Agent context or external backups and is not SSD secure erasure. A different request returning already_deleted confirms no live record.
