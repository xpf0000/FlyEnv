# AI CLI MCP Integration Fixes Design

## Goal

Fix the current MCP integration gaps across FlyEnv's AI CLI modules without doing a broad refactor.

This change covers five user-facing issues:

- incorrect MCP list display in `Antigravity CLI`
- incorrect MCP list display in `Codex`
- missing authenticated HTTP/SSE MCP support when adding servers in AI CLI MCP tabs
- missing `MCP` tab in `Kimi`
- missing FlyEnv MCP quick config entries for `Antigravity CLI` and `GitHub Copilot CLI`

## Current Problems

The existing MCP support is functionally uneven across clients.

- `Antigravity` reads and writes an MCP schema that does not match the actual `~/.gemini/config/mcp_config.json` structure.
- `Codex` reads top-level MCP fields even though actual CLI output nests transport data under `transport`.
- `GitHub Copilot CLI` displays the wrong scope field and cannot persist authenticated HTTP MCP servers through the current add flow.
- `Kimi` can write simple MCP config entries, but it cannot list or remove them and has no renderer tab.
- FlyEnv's MCP client quick config only supports part of the AI CLI set, so the displayed config matrix is incomplete.

## Constraints

- Keep the scope limited to the five issues above.
- Preserve each CLI's real config format instead of forcing a fake shared on-disk schema.
- Use shared renderer behavior where it reduces duplication, but keep per-client parsing in the fork layer.
- For remote MCP servers, omit the `Authorization` header entirely when the token is empty.
- Do not introduce edit-in-place MCP management beyond add, list, and remove in this change.

## Options Considered

### Option 1: Patch each client independently

Fix each CLI's renderer and fork module separately, with client-specific add dialogs and list parsing.

Pros:

- smallest local changes per module
- low short-term design effort

Cons:

- repeats the same MCP form logic several times
- keeps UI behavior inconsistent across AI CLI modules
- makes the next client addition more expensive

### Option 2: Shared display and form model, per-client storage adapters

Normalize MCP list items and add-form capabilities at the FlyEnv layer, while leaving each fork module responsible for its own real config or CLI schema.

Pros:

- fixes the current bugs without forcing a large refactor
- aligns MCP behavior across `Antigravity`, `Codex`, `Copilot CLI`, and `Kimi`
- keeps risky config differences isolated to the fork modules

Cons:

- requires coordinated changes across renderer and fork layers
- still leaves some duplicated client-specific persistence code

### Option 3: Full MCP subsystem refactor

Create a fully shared MCP registry service for every AI CLI module, including editing, validation, and migration helpers.

Pros:

- cleanest long-term architecture

Cons:

- much larger scope than requested
- higher regression risk
- delays the concrete fixes the user asked for

## Chosen Design

Use **Option 2**.

FlyEnv will unify MCP presentation and add-flow behavior at the UI boundary, while keeping each client's real config parsing and persistence logic in its own fork module.

## Design

### 1. Shared MCP list model

All AI CLI MCP tabs in the renderer will continue to consume the same logical row shape:

- `name`
- `type`
- `commandOrUrl`
- `scope`

This is a display contract, not a storage contract.

Each fork module will translate its real source data into that model. No renderer component should infer these fields from partial raw config objects.

If a client needs internal helper metadata for parsing or writing, that metadata stays inside the fork module and is not added to the current table UI.

### 2. Client-specific parsing and persistence

#### Antigravity

`Antigravity` will treat `~/.gemini/config/mcp_config.json` as the source of truth.

`listMcp()` will:

- read `mcpServers`
- detect remote endpoints from `serverUrl`, `url`, or legacy `httpUrl`
- derive `type` from the actual payload instead of assuming the old schema
- display the effective remote URL or the local command string
- return `shared` for the displayed scope because the MCP file is shared under the Gemini config root

`addMcp()` will write the real Antigravity-compatible shape:

- remote entries use `serverUrl` for HTTP/SSE servers
- auth headers are only included when a token exists
- local entries continue to use command-based structure if supported by the config schema

`removeMcp()` remains name-based and removes the corresponding `mcpServers` entry.

#### Codex

`Codex` will keep using its own `config.toml` format, but `listMcp()` will stop reading the wrong field level.

`listMcp()` will:

- read `transport.type` instead of top-level `type`
- use `transport.url` for remote entries
- build `commandOrUrl` from command plus args for local entries
- return `user` for the displayed scope because FlyEnv manages the user-level `~/.codex/config.toml`
- tolerate both current Codex transport output and existing file-based TOML data

`addMcp()` will keep writing `config.toml`, but remote writes must match the structure that `listMcp()` later reads, including optional `http_headers.Authorization`.

#### GitHub Copilot CLI

`Copilot CLI` will continue to use `copilot mcp list --json` for listing, but the field mapping will be corrected.

`listMcp()` will:

- use the real `type`
- use `url` or the local command string for `commandOrUrl`
- use `source` as the displayed scope instead of the nonexistent `scope`

`addMcp()` will split behavior by transport:

- local `stdio` entries can continue to use the official CLI add command
- authenticated remote entries will be persisted through `~/.copilot/mcp-config.json` so token headers can be stored correctly

This avoids a broken add flow for token-based HTTP MCP servers while preserving the existing CLI integration where it still works.

#### Kimi

`Kimi` already writes remote MCP config, but it lacks full lifecycle support.

The fork module will add:

- `listMcp()`
- `removeMcp()`

`listMcp()` will read `~/.kimi-code/mcp.json` and map it into the shared MCP list model.

`addMcp()` will be adjusted so:

- empty token means no `Authorization` header
- `http` and `sse` are both supported through the existing config file strategy

No fake local `stdio` support will be added if Kimi does not support it.

### 3. Shared MCP add form behavior

The MCP tabs for the AI CLI modules will converge on the same add-flow behavior.

Common form behavior:

- `name` is always required
- transport type is selected from the types actually supported by that client
- `commandOrUrl` is required
- `token` is shown only for remote transports

Transport support per client:

- `Antigravity`: `stdio`, `http`
- `Codex`: `stdio`, `http`
- `Copilot CLI`: `stdio`, `http`
- `Kimi`: `http`, `sse`

The renderer should not try to normalize transport names beyond what is needed for the UI. Each setup module can map UI transport values to the fork module API if a client uses a different naming convention internally.

### 4. Kimi MCP tab

`Kimi` will gain an `MCP` tab in `src/render/components/Kimi/Index.vue`.

That tab will match the pattern already used by the other AI CLI modules:

- list current MCP servers
- add a new server
- remove a server
- refresh the list

The tab should reuse the same interaction conventions already present in `Antigravity`, `Codex`, and `Copilot CLI` instead of introducing a separate Kimi-specific workflow.

### 5. FlyEnv MCP client quick config expansion

The shared MCP client config helpers will be extended to include:

- `antigravity`
- `copilotCli`

This affects:

- `src/shared/mcpClientConfig.ts`
- `src/render/components/MCP/ClientConfig.vue`
- `src/render/components/MCP/setup.ts`

The quick config feature must stay consistent across:

- rendered config snippets
- clipboard copy output
- one-click "add to client" behavior

For remote clients, the generated config must omit `Authorization` when no token is configured on the FlyEnv MCP server.

### 6. Error handling

- malformed or partially compatible client config files should degrade to an empty MCP list instead of breaking the tab
- add failures should surface the real error message through the existing message utilities
- a tokenless remote MCP add should succeed without emitting an empty bearer header
- clients that do not support a given transport should not expose that transport in the form

### 7. Verification

Add a targeted MCP regression script that covers representative parsing and write cases for:

- `Antigravity`
- `Codex`
- `Copilot CLI`
- `Kimi`

Verification for this work should include:

1. targeted MCP regression script execution
2. `eslint` on changed renderer and fork files
3. scoped validation for affected TypeScript and Vue files

Repo-wide `vue-tsc` is already noisy, so validation should be evidence-based and limited to the touched surface area.

## Out of Scope

- a generic cross-client MCP edit dialog
- migrating existing user configs between schemas
- adding new MCP table columns such as auth mode or enable state
- refactoring all AI CLI modules to share one fork-side MCP service
- changing FlyEnv MCP server behavior beyond snippet generation and client registration
