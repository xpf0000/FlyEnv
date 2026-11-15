# AI Memory Global Agent Connect Implementation Plan

> Execute inline in the existing `feat/ai-memory-neural-preview` worktree, then synchronize only this task's files to the primary checkout as requested. No commit, merge, install into the user's profile, or push.

**Goal:** Migrate the approved `tmp/ai-memory-neural-preview/connect.html` preview to the real plugin: six clients, global connection by default, generic HTTP/stdio configuration, optional project rules.
**Architecture:** New module-local `MemoryConnectController` owns the complete workflow across page unmounts; its adapter reuses host MCP lifecycle/configuration and existing client configuration. Plugin fork owns append-only instruction installation. Existing memory data/controller and maintenance stay intact.
**Stack:** Vue 3, TypeScript, existing reactiveBind, existing MCP IPC and dedicated plugin worker.
**Spec:** User-approved connect preview and global-default correction, 2026-11-14.

## Contract and constraints

- View owns selected client, transport and optional project. Connection controller owns operation snapshots, stages, result, coalescing, snippets and clipboard feedback. Fork owns filesystem writes. No new store/config persistence or new child process. No exceptions to module constraints.
- Connection start: explicit user click. Steps: prepare MCP (required), configure client (dependent), append global instructions (dependent). Each reports running/done/failed/unknown. Generic preparation only starts service and generates snippets; it never claims the external client is configured.
- Existing MCP runtime owns the HTTP listener and application shutdown. Reuse `mcp:setToolsEnabled`, `mcp:setConfig`, `mcp:start`, and terminal-aware IPC; no alternate service lifecycle or renderer process-liveness source.
- Preserve unrelated enabled tools, approval policies, autoStart, host/remote settings and client configuration. Enable five memory tools and HTTP only as required. Never silently enable remote access or bypass tool approval.
- Duplicate connection/preparation clicks join one in-flight workflow. Another client cannot start until the shared preparation completes; no overlapping service/config writes. Terminal/timeouts always release listeners. Unknown results are displayed and never automatically replayed.
- Side effects completed before failure remain reported. A rules failure after successful connection is partial completion, not a failed connection. Retry rechecks readiness and skips already successful client writes; rules appends are idempotent. Clipboard/notice failures do not invalidate configuration.
- Global instructions use client-supported user paths; Codex honors existing AGENTS.override.md and its 32 KiB discovery budget. Append a marked block without replacing user content; bounded strict UTF-8 read, reject symlink/nonregular instruction files and malformed markers. Same-path writes serialize. Optional project rules use selected existing absolute root and the corresponding instruction filename, independent of global connection.
- Connection readiness means server/config/rules completed, not actual Agent read/write verification. New-session instruction remains visible. No user credentials are persisted in plugin preferences or diagnostic logs.

## Tasks

- [x] Add failing tests for controller duplicate/page reentry, required failures, partial rules failure and retry, generic no-configuration behavior, clipboard feedback and unrelated MCP settings preservation.
- [x] Add failing tests for six global/project instruction paths, env overrides, append preservation, duplicate writes, invalid/malformed files, and Codex override/size handling; implement fork installer and internal RPC (not MCP tools).
- [x] Implement operation controller/adapter and real HTTP/stdio snippets from existing shared builders. Terminal progress is nonterminal; actual IPC error/timeouts remain explicit.
- [x] Port the approved layout into `MemoryConnect.vue`, keep `MemorySetup.vue` maintenance behavior, add EN/ZH copy and operation-boundary checks.
- [x] Run focused and full plugin tests, lint, component types, plugin build/contract and renderer boundaries. Review failure propagation with flyenv-failure-boundaries again.
- [x] Native UI verification in isolated app profile and isolated client homes; verify actual config/rule files and no duplicate blocks, page reentry and generic state. Synchronize task files only and rerun relevant checks in primary checkout.

## Review focus

1. Service unavailable or disabled tool: no false connected state and no downstream client/rules writes.
2. Rules denied after client write: retain connection success and retry only incomplete work.
3. Page switch/client change during workflow: singleton retains immutable target and progress.
4. Existing instructions/configuration and environment-specific paths: preserve content and effective file discovery.
5. Generic client and project rules: user knows what is automatic/manual; optional project choice never changes global memory scope.

## Path references

[Copilot](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-custom-instructions), [OpenCode](https://opencode.ai/docs/instructions), [Kimi](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/agents.html), [Antigravity](https://antigravity.google/docs/rules-workflows), [Claude](https://code.claude.com/docs/en/memory), [Codex](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

## Review ruling

The shared client writers were unsafe for this workflow: invalid JSON was treated as an empty object by Antigravity/Copilot, and OpenCode rejected valid trailing-comma JSONC before rewriting. Harden the six existing adapters with a fork-only strict config reader/server-map validator, using the existing JSON5 dependency for OpenCode. Honor COPILOT_HOME and OPENCODE_CONFIG_DIR consistently for MCP and rule paths. This is necessary to fulfill the approved preservation behavior; no new client APIs or lifecycle are introduced.

## Verification result

Primary checkout: 154 plugin tests passed; focused Vue/controller/fork types passed using declared host interfaces; renderer operation boundaries and plugin build/contract passed. ESLint has zero errors and two warnings for trusted bundled SVG markup. Native isolated Electron: Codex and OpenCode global config/rule files verified, existing values retained, project rules installed, generic HTTP/stdio generated with real QA values, maintenance and page reentry checked. This does not claim Agent-session read/write verification or Windows/Linux native acceptance. Original preview service remains running; no real client profile or plugin install directory modified.

## Approved follow-up — 2026-11-14

- Match memory management's 12px outer corner radius; remove the 1120px width cap, use 20px outer/panel padding and normal FlyEnv MCP typography (14px text, 12px secondary/code). Center the global connection icon vertically with the text group. Consolidate preview CSS rather than stacking conflicting overrides.
- Generic config display is a passive module-controller operation: load existing MCP settings/bridge snippets automatically when selected; never start the MCP listener, enable tools, write client configuration or install rules. Duplicate reads coalesce; HTTP and stdio outcomes remain independent; failed reads clear stale snippets. Copy only copies an already displayed snippet, with failure feedback independent of service/config results. Keep explicit one-click client operations unchanged.
- Use the host's existing AppModuleTab record for the memory page's named tabs through a module-local typed mapping. No new persistence/store/shared configuration exception. Verify a second page binding sees the previous tab and invalid saved indices fall back to memories.
- Add focused controller/navigation tests, run types/lint/plugin build and native UI checks for generic display/copy without service start, module round trips, and normal/short content widths.

If the memory service is disabled, generic setup offers a separate explicit “Enable memory service” action. Copying does not trigger it. The same controller retains its service-only progress and errors, with client/rules stages remaining manual.

Follow-up verified: 159 plugin tests, focused component/controller/navigation types, plugin build/contract and renderer boundaries passed. Native module round-trip retains Connect tab; passive generic display/copy keeps HTTP/tools disabled and listener stopped. Desktop/narrow visuals checked. Review fixed HTTP copy being incorrectly blocked by an independent pending stdio read.

User correction: generic setup is configuration only. Remove the service reminder and enable-service entry, along with the now-unused controller method/styles/copy; hide runtime status for generic configuration. Showing/copying configuration remains passive. Existing automatic client connection is unchanged.

## Client selection restoration fix

User reproduced generic → Codex → another tab/module → return restoring generic. `lastClient` mixed operation entry with view selection and ordinary radio changes never updated it. User explicitly requires selection retention across these page lifetimes: keep a module-local reactive view selection in navigation.ts, initialized to Codex once per app session, and bind the page to its ref. Remove lastClient from the operation controller; service/snippet operations cannot select a client. No persistent config or Pinia state is added. Regression tests cover ordinary client changes and an in-flight generic response after a different selection. Native original failure was reproduced before editing.

Selection fix verification: 160 plugin tests, focused types, plugin build/contract and renderer-operation boundaries passed. The current user window still contains its old loaded plugin code and needs a reload; it was not restarted, and no native post-fix success was claimed for that window.
