# FlyEnv i18n Common Key Design

Date: 2026-06-30

## Background

FlyEnv language packs are organized by module under `src/lang/<locale>/*.json`.
As modules increase, many identical UI texts are repeated across files with different keys.

Current examples from `zh` and `en`:

- `antigravity.addServer`
- `codex.addServer`
- `kimi.addServer`

- `antigravity.mcpName`
- `codex.mcpName`
- `kimi.mcpName`

- `codex.resume`
- `kimi.resume`
- `antigravity.resume`

This causes three practical problems:

1. Translators must repeatedly translate the same term in many files.
2. Terminology drifts across modules because repeated keys evolve separately.
3. New modules have no clear rule for whether to reuse or duplicate a common term.

## Goals

1. Define one canonical key for each stable cross-module UI term.
2. Move shared terms out of module JSON files into a dedicated `common.json`.
3. Keep module JSON files focused on module-specific copy.
4. Make future duplication visible through tooling, without blocking valid exceptions.

## Non-Goals

1. Do not deduplicate every identical string in the repository.
2. Do not merge long explanatory paragraphs, warnings, or product-specific descriptions.
3. Do not keep long-term runtime aliasing between old keys and new keys.
4. Do not rename keys solely because their Chinese text happens to match.

## Decision

Introduce a new namespace:

- `src/lang/<locale>/common.json`

All stable, reusable UI vocabulary will move there. Module files such as `codex.json`, `kimi.json`,
`antigravity.json`, and `mcp.json` will keep only module-specific text.

The final state is:

1. Call sites reference `common.*` for shared semantics.
2. Old duplicated module keys are removed after migration.
3. Duplicate detection reports new merge candidates, but does not auto-merge them.

## Canonical Key Model

`common.json` is divided by semantic domain, not by source module.

```json
{
  "label": {
    "name": "",
    "type": "",
    "status": "",
    "model": "",
    "host": "",
    "scope": "",
    "source": "",
    "description": "",
    "id": ""
  },
  "action": {
    "add": "",
    "copy": "",
    "search": "",
    "preview": "",
    "clear": "",
    "enable": "",
    "disable": "",
    "resume": "",
    "start": "",
    "stop": "",
    "uninstall": "",
    "reset": "",
    "update": ""
  },
  "state": {
    "running": "",
    "stopped": "",
    "installed": "",
    "enabled": "",
    "disabled": "",
    "available": ""
  },
  "session": {
    "list": "",
    "title": "",
    "id": "",
    "lastPrompt": "",
    "search": "",
    "deleted": "",
    "resumed": ""
  },
  "mcp": {
    "name": "",
    "type": "",
    "commandOrUrl": "",
    "scope": "",
    "addServer": ""
  },
  "category": {
    "basic": "",
    "configuration": "",
    "basicInfo": "",
    "sessions": "",
    "skills": "",
    "mcp": ""
  }
}
```

## Naming Rules

1. `common.label.*` is for short noun labels only.
2. `common.action.*` is for user-triggered actions only.
3. `common.state.*` is for status values only.
4. `common.session.*` is only for session-related UI terms.
5. `common.mcp.*` is only for MCP form and server management vocabulary.
6. `common.category.*` is for reusable category headings.
7. If a term has the same wording but a different meaning in another context, do not merge it.

## First Migration Wave

Scope the first wave to AI CLI and MCP related modules because they already have the densest repetition:

- `antigravity.json`
- `codex.json`
- `kimi.json`
- `hermes.json`
- `mcp.json`
- `ai.json` for `model`

### Wave 1 canonical mappings

#### Labels

- `antigravity.model` -> `common.label.model`
- `codex.model` -> `common.label.model`
- `ai.model` -> `common.label.model`

#### Actions

- `antigravity.resume` -> `common.action.resume`
- `codex.resume` -> `common.action.resume`
- `kimi.resume` -> `common.action.resume`

- `codex.enable` -> `common.action.enable`
- `hermes.enable` -> `common.action.enable`

- `codex.disable` -> `common.action.disable`
- `hermes.disable` -> `common.action.disable`

- `codex.uninstall` -> `common.action.uninstall`

#### States

- `codex.enabled` -> `common.state.enabled`
- `hermes.enabled` -> `common.state.enabled`

- `codex.disabled` -> `common.state.disabled`
- `hermes.disabled` -> `common.state.disabled`

- `codex.installed` -> `common.state.installed`
- `hermes.installed` -> `common.state.installed`

- `mcp.running` -> `common.state.running`

#### Sessions

- `codex.sessions` -> `common.session.list`
- `kimi.sessions` -> `common.session.list`
- `hermes.sessions` -> `common.session.list`

- `codex.sessionTitle` -> `common.session.title`
- `kimi.sessionTitle` -> `common.session.title`

- `codex.sessionId` -> `common.session.id`
- `kimi.sessionId` -> `common.session.id`

- `codex.lastPrompt` -> `common.session.lastPrompt`
- `kimi.lastPrompt` -> `common.session.lastPrompt`

- `codex.searchSession` -> `common.session.search`
- `kimi.searchSession` -> `common.session.search`
- `hermes.searchSession` -> `common.session.search`

- `codex.sessionDeleted` -> `common.session.deleted`
- `kimi.sessionDeleted` -> `common.session.deleted`

- `codex.sessionResumed` -> `common.session.resumed`
- `kimi.sessionResumed` -> `common.session.resumed`

#### MCP

- `antigravity.addServer` -> `common.mcp.addServer`
- `codex.addServer` -> `common.mcp.addServer`
- `kimi.addServer` -> `common.mcp.addServer`

- `antigravity.mcpName` -> `common.mcp.name`
- `codex.mcpName` -> `common.mcp.name`
- `kimi.mcpName` -> `common.mcp.name`

- `antigravity.mcpType` -> `common.mcp.type`
- `codex.mcpType` -> `common.mcp.type`
- `kimi.mcpType` -> `common.mcp.type`

- `antigravity.mcpCommandOrUrl` -> `common.mcp.commandOrUrl`
- `codex.mcpCommandOrUrl` -> `common.mcp.commandOrUrl`
- `kimi.mcpCommandOrUrl` -> `common.mcp.commandOrUrl`

- `antigravity.mcpScope` -> `common.mcp.scope`
- `codex.mcpScope` -> `common.mcp.scope`
- `kimi.mcpScope` -> `common.mcp.scope`

#### Categories

- `antigravity.category.basic` -> `common.category.basic`
- `codex.category.basic` -> `common.category.basic`
- `kimi.category.basic` -> `common.category.basic`

## Explicit Non-Merges

The following cases look similar but should stay separate for now:

1. `mcp.host` versus `host.*`
   `mcp.host` is a network binding label. `host.*` is site/virtual-host vocabulary.

2. `mcp.scope` versus `cron.scope`
   They share wording in some languages, but represent different concepts.

3. `comment`, `remark`, and `description`
   Similar wording does not guarantee identical translation choices across languages.

4. Long tips and warning paragraphs
   Example: `allowRemoteTip`, `approvalTip`, and similar help text.

5. Generic `id`
   `common.session.id` is valid for session UIs. Other `id` keys must be reviewed individually.

## Type and Assembly Changes

The i18n assembly needs these changes:

1. Add `common.json` to every locale directory.
2. Import `common` in each locale `index.ts`.
3. Export `common` under each locale root.
4. Update `src/lang/index.ts`:
   - import the `zh/common.json` type
   - add `AppendStringToKeys<typeof common, 'common'>` to `LangKey`

This preserves the current typed `I18nT()` contract while introducing the shared namespace.

## Migration Strategy

### Step 1

Create `common.json` in `zh`, then mirror the same file structure to all locales.

### Step 2

Populate only the first migration wave keys.

### Step 3

Update Vue and TypeScript call sites to reference `common.*`.

### Step 4

Delete the replaced old keys from the module JSON files in the same change set.

### Step 5

Run `node src/lang/check.mjs` to confirm:

1. file structure stays aligned
2. keys stay aligned
3. replaced old keys are no longer referenced

### Step 6

Add duplicate-candidate reporting to `src/lang/check.mjs` as a non-blocking warning.

## Tooling Changes

Extend `src/lang/check.mjs` with a new report:

1. flatten `zh` and `en` values
2. group identical values
3. print clusters above a threshold, such as 3 or more occurrences
4. exclude approved duplicates where context is intentionally separate

This report should:

- be informative, not failing
- help reviewers catch new duplication
- avoid forcing false-positive merges

Optionally, maintain a small allowlist file for known acceptable duplicates.

## Rollout Plan

### Wave 1

AI CLI and MCP modules only.

### Wave 2

Global low-risk labels such as:

- `name`
- `status`
- `copy`
- `search`
- `preview`
- `source`
- `n8n.usersEnable`
- `n8n.usersDisable`
- `n8n.usersDisabled`
- `cron.enabled`

### Wave 3

Review older infrastructure modules and move stable terminology gradually.

## Risks

1. Over-merging semantically different terms under one key.
2. Making `common.json` a dumping ground without naming discipline.
3. Breaking typed key usage if locale assembly and `LangKey` are not updated together.
4. Leaving old keys in place after migration, which recreates dual-maintenance overhead.

## Guardrails

1. Merge only by shared semantics, never by shared wording alone.
2. Migrate one coherent key cluster at a time.
3. Delete old keys in the same PR where call sites are switched.
4. Keep `common.json` domain-grouped and small.
5. Treat duplicate reports as review input, not automatic truth.

## Acceptance Criteria

This design is considered implemented correctly when:

1. every locale contains `common.json`
2. wave 1 call sites use `common.*`
3. duplicated wave 1 module keys are removed
4. `node src/lang/check.mjs` passes
5. duplicate-candidate reporting exists and highlights future merge opportunities
