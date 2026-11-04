# FlyEnv Memory Rules — developer preview

Use these rules only after enabling the five FlyEnv memory tools. The tools share local data while FlyEnv is running. Copied rules are not automatically installed.

## Read for the current task

Confirm the project's absolute root path. A shell's working subdirectory is not necessarily the project root. Search project memory using that root and task keywords; browse pinned/recent summaries with an empty query when useful. Request global preferences explicitly. Use `get` only for relevant details and use the scope returned by search. Global results require `scope=global` for subsequent get.

If a path is unregistered and `project_candidates` are returned, use the confirmed project root, or confirm it is an independent child project and pass `create_project=true` to store. Candidates are hints, not proof of project identity. Moving a project creates a new scope in this preview; old data remains in the UI.

Search accepts a bounded `queries` array. Try the task's language, precise technical identifiers and useful translations/aliases. No results means no matching stored evidence, not proof that an event never happened. Memory may be stale; check live process/port/service state with the appropriate tools.

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
