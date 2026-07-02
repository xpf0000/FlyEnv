# FlyEnv Global Identical i18n Key Dedup Design

Date: 2026-07-01

## Background

FlyEnv currently keeps translations grouped by module under `src/lang/<locale>/*.json`.
That organization is useful for module ownership, but it has also left a large set of
fully duplicated UI texts distributed across many module files.

Examples already visible in `zh` and `en`:

- `claudeCode.cmd.help`
- `copilotCli.cmd.help`
- `hermes.cmd.help`
- `openCode.cmd.help`
- `openclaw.cmd.help`

- `antigravity.openSkillsDir`
- `copilotCli.openSkillsDir`
- `hermes.openSkillsDir`

- `claudeCode.cmd.mcpList`
- `copilotCli.cmd.mcpList`
- `hermes.cmd.mcpList`

The earlier `common.json` migration started solving this for labels, actions, states, sessions,
and MCP fields, but the repository still contains many repeated module-level keys that now have
no remaining justification.

## Goals

1. Deduplicate every key group whose `zh` and `en` values are exactly identical.
2. Move those groups to canonical `common.*` keys whenever possible.
3. Reuse existing `common.*` keys first before inventing new ones.
4. Add new `common` sub-groups only when the existing structure cannot express the meaning cleanly.
5. Update all call sites to the canonical `common.*` key and remove the replaced module-level keys.
6. Keep the result deterministic so repeated runs make the same decisions.

## Non-Goals

1. Do not merge keys whose `zh` and `en` strings differ.
2. Do not preserve duplicated aliases after migration.
3. Do not redesign the entire i18n folder structure.
4. Do not optimize for source-module purity over semantic reuse.

## Decision

Use `common.json` as the canonical sink for every duplicate group whose `zh` and `en` strings match exactly.

Decision rule:

1. Build duplicate groups from the existing language packs.
2. A group is eligible when all keys in the group share the same `zh` and `en` values.
3. If any key in the group is already under `common.*`, reuse that exact `common.*` path.
4. Otherwise, create one new `common.*` key chosen by semantic bucket:
   - `common.label.*` for short nouns
   - `common.action.*` for user-triggered verbs
   - `common.state.*` for status words
   - `common.session.*` for session UI
   - `common.mcp.*` for MCP server management
   - `common.category.*` for reusable navigation/category labels
   - `common.skills.*` for skills browsing/file actions
   - `common.cli.*` for reusable CLI command descriptions
   - `common.gateway.*` for shared gateway lifecycle wording
   - `common.value.*` for shared yes/no/none/default style literals that do not fit action/state/label
5. Rewrite every call site to the canonical key.
6. Delete the replaced keys from every locale JSON file.

## Canonical Mapping Rules

### Existing `common` keys that must absorb duplicates

- `common.label.status`
- `common.label.name`
- `common.action.uninstall`
- `common.action.disable`
- `common.state.running`
- `common.state.enabled`
- `common.state.disabled`
- `common.mcp.scope`

### New `common` groups introduced by this wave

#### `common.skills`

For cross-module skills UI text:

- `openSkillsDir`
- `openSkillDir`
- `revealSkillFile`
- `noSkills`
- `skillFileMissing`
- `skillLoadFailed`
- `builtin`

#### `common.cli`

For reusable CLI command description text:

- `help`
- `version`
- `start`
- `mcpList`
- `doctor`
- `doctorFix`
- `gatewayStart`
- `gatewayStop`
- `gatewayRestart`
- `gatewayStatus`
- `gatewayRun`
- `gatewayUninstall`
- `skillsList`

These are descriptions, not raw command labels, so they belong under a dedicated shared CLI bucket
instead of `common.action`.

#### `common.gateway`

For shared runtime/service gateway wording:

- `category`
- `status`
- `running`
- `stopped`
- `startFailed`

#### `common.value`

For shared literal values that are not labels/actions/states:

- `yes`
- `no`
- `other`
- `default`
- `none`
- `local`

## Locale Conflict Policy

This migration uses `zh` and `en` as the grouping authority, because that is the explicit user requirement.

If other locales within the same duplicate group drifted over time:

1. Prefer an existing `common.*` value when the group already maps to an existing `common` key.
2. Otherwise, choose a representative module source in this order:
   - existing `common.*`
   - `antigravity.*`
   - `claudeCode.*`
   - `copilotCli.*`
   - `hermes.*`
   - `openCode.*`
   - `openclaw.*`
   - remaining keys in lexical order
3. Copy that representative locale value into the new `common.*` key for that locale.

This intentionally normalizes minor translation drift when the primary `zh/en` wording is already the same.

## Expected Impact

After the migration:

1. Duplicate command descriptions and skills wording disappear from module files.
2. `src/lang/check.mjs` duplicate candidates shrink substantially.
3. Renderer call sites become more consistent because the same meaning uses one canonical key.
4. Translators only maintain one copy of each stable cross-module phrase.

## Risks

1. Over-merging short words like `Status`, `Scope`, or `Local` can accidentally hide domain nuance.
   This design accepts that risk because the user explicitly asked to merge all fully identical wording.
2. The generated `LangKey` union in `src/lang/index.ts` must stay in sync with new `common.*` keys and removed module keys.
3. Bulk call-site rewrites can leave stale references behind unless verified with repository-wide searches.

## Verification

The implementation must verify all of the following:

1. `node src/lang/check.mjs`
   - no missing-key regressions
   - no unused-key regressions
2. A dedicated duplicate-dedup regression script
   - target groups resolve to canonical `common.*` keys
   - old duplicate module keys are absent from locale JSON files
3. Existing namespace regression:
   - `node scripts/lang-check-namespace-test.mjs`
4. Existing Copilot skill-key regression:
   - `node scripts/copilot-cli-missing-keys-test.mjs`
