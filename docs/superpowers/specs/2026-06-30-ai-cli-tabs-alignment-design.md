# AI CLI Tabs Alignment Design

## Goal

Align the FlyEnv AI CLI tabs that currently feel inconsistent without turning this into a broad shared-component refactor.

This change covers four user-facing requests:

- make `Antigravity CLI` skill actions use the project's common popover action menu pattern
- make `Codex` plugin actions match the link-style actions already used in `Claude Code`
- make long values in AI CLI `MCP` tables render as single-line truncated text with tooltips
- bring `GitHub Copilot CLI` skills up to parity with the current `Antigravity` skills workbench pattern, including open-folder, reveal, preview, and conditional save

## Current Problems

The current AI CLI tabs are close in function but not in interaction model.

- `Antigravity/Skills.vue` uses inline icon buttons for row actions, while the rest of the app commonly uses a compact "more" popover menu for dense row actions.
- `Codex/Plugins.vue` still uses circle icon buttons, while `ClaudeCode/Plugins.vue` already uses a lighter link-action pattern.
- `Antigravity`, `Claude Code`, `Codex`, and `Copilot CLI` MCP tables do not consistently constrain long strings, so names, types, and commands can consume too much horizontal space.
- `CopilotCli/Skills.vue` only exposes a copy-path action, which makes the tab much less useful than `Antigravity` for real skill inspection and editing.

## Constraints

- Keep the scope limited to the tabs the user called out.
- Reuse existing FlyEnv interaction patterns before introducing new abstractions.
- Use Tailwind utility classes for truncation instead of adding new custom ellipsis styles.
- Preserve existing fork-side data contracts unless the new behavior requires a small targeted addition.
- For `Copilot Skills`, support save only when the resolved skill file is writable; otherwise the drawer must stay read-only.

## Options Considered

### Option 1: Patch each view independently with minimal local edits

Change each tab in place with no shared behavior beyond what already exists.

Pros:

- smallest implementation surface
- least chance of unrelated regressions

Cons:

- duplicates the same row-action/menu patterns
- risks small visual drift between similar tabs

### Option 2: Introduce a shared AI CLI row-action abstraction

Create shared row/menu helpers and update all affected tabs to consume them.

Pros:

- strongest long-term consistency
- less repetition once complete

Cons:

- larger scope than the request
- more design and migration work than the current UI delta justifies

### Option 3: Targeted alignment with existing local patterns

Reuse the existing Host-style action popover pattern and the current Claude Code plugin styling, while only adding small shared plumbing where it unlocks the requested behavior.

Pros:

- matches the user's request directly
- improves consistency without a broad refactor
- keeps risky changes localized

Cons:

- still leaves some duplication between AI CLI modules
- not a full long-term unification

## Chosen Design

Use **Option 3**.

This work will align the affected tabs to existing FlyEnv patterns, not invent a new shared design system for AI CLI screens.

## Design

### 1. Antigravity skills action menu

`src/render/components/Antigravity/Skills.vue` will stop rendering three inline link-icon buttons on every row.

Instead, each row will use the same compact action pattern already seen in the site list:

- a `more` trigger icon
- an `el-popover`
- a short vertical action list inside the popover

The available actions remain:

- open skill folder
- reveal skill file
- preview skill details

The header-level "open skills directory" button stays in place because it is already useful and consistent with the workbench direction added earlier.

This change is a presentation alignment only. The existing skill discovery and view behavior stays intact.

### 2. Codex plugin actions match Claude Code

`src/render/components/Codex/Plugins.vue` will switch from circle icon buttons to the same link-style action buttons already used in `src/render/components/ClaudeCode/Plugins.vue`.

The action logic does not change:

- installed and enabled plugins can be disabled
- installed and disabled plugins can be enabled
- installed plugins can be removed
- available plugins can be installed

Only the action presentation changes:

- link buttons instead of circle buttons
- spacing and visual weight aligned with `Claude Code`
- existing tooltip text, colors, and command flow preserved

No new plugin abstraction is required for this change.

### 3. AI CLI MCP table truncation

The following renderer tables will be aligned:

- `src/render/components/Antigravity/MCP.vue`
- `src/render/components/ClaudeCode/MCP.vue`
- `src/render/components/Codex/MCP.vue`
- `src/render/components/CopilotCli/MCP.vue`

For each table:

- enable `show-overflow-tooltip` on `el-table`
- render `name`, `type`, and `commandOrUrl` through cell templates
- wrap displayed values in Tailwind-based truncation containers such as `truncate` and `min-w-0`

This keeps the values single-line and clipped with ellipsis while still allowing the full text to be inspected through the table tooltip behavior.

No extra SCSS ellipsis helpers should be added for this change.

### 4. Copilot skills workbench parity

`GitHub Copilot CLI` skills should become functionally parallel to the current `Antigravity` skills tab.

#### Header behavior

Add a header folder action that opens the Copilot skills root directory.

Because Copilot skill locations may vary, the root resolution should be handled in the setup or fork layer instead of hardcoding a renderer assumption from UI code.

Preferred behavior:

- resolve the user skills root from known Copilot paths when available
- fall back to the common skills parent inferred from listed skill paths
- if no skill-specific root is available, fall back to the Copilot home directory

#### Row actions

Each Copilot skill row will expose:

- open skill folder
- reveal skill file
- preview skill details

These actions should use the same popover menu pattern as the updated Antigravity skills rows.

The existing copy-path action will be removed because the new filesystem actions are more useful and directly match the requested behavior.

#### Skill viewer behavior

Add `src/render/components/CopilotCli/SkillView.vue` as a Copilot-specific drawer instead of reusing the Antigravity component directly.

It should match the same user model:

- `code` view
- `both` split view
- `preview` view

But the save behavior differs from the earlier conservative read-only proposal:

- if the skill file exists and is writable, the drawer is editable and save is enabled
- if the skill file exists but is not writable, the drawer loads in read-only mode and save stays hidden or disabled
- if the file is missing or unreadable, the drawer shows a readable fallback message and save stays disabled

This keeps Copilot aligned with Antigravity where editing is possible, without pretending that every Copilot skill source is writable.

### 5. Minimal file access helper for writable detection

The current renderer file helpers expose `existsSync`, `readFile`, `writeFile`, `realpath`, and `stat`, but they do not expose a clean file-access probe for deciding read/write capability ahead of time.

To support the Copilot drawer behavior cleanly, add a small `App-Node-FN` file access helper and renderer wrapper that can answer whether a file is readable and writable.

Expected shape:

- a main-process `fs access` handler backed by Node file access checks
- a renderer helper on `src/render/util/NodeFn.ts`
- drawer-level usage limited to determining whether save should be offered

This is intentionally narrow in scope and should not become a general file-permissions feature in this change.

## Implementation Shape

Expected renderer changes:

- `src/render/components/Antigravity/Skills.vue`
- `src/render/components/Codex/Plugins.vue`
- `src/render/components/Antigravity/MCP.vue`
- `src/render/components/ClaudeCode/MCP.vue`
- `src/render/components/Codex/MCP.vue`
- `src/render/components/CopilotCli/MCP.vue`
- `src/render/components/CopilotCli/Skills.vue`
- `src/render/components/CopilotCli/SkillView.vue` new
- `src/render/components/CopilotCli/setup.ts`
- `src/render/util/NodeFn.ts`

Expected main or fork support changes:

- `src/main/core/AppNodeFn.ts`
- `src/fork/module/CopilotCli/index.ts` if root directory resolution needs explicit fork support

Localized strings should be kept minimal and limited to newly exposed UI labels where existing base strings do not already fit.

## Error Handling

- if a Copilot or Antigravity skill path cannot be opened, surface the existing generic failure messaging path
- if a skill file cannot be read, the drawer should not crash or render a blank broken state
- if a writable check fails, default to read-only instead of assuming write permission
- if save is attempted and the write still fails, surface the actual write error through the existing message utilities

## Verification

Manual verification is appropriate for this scoped UI alignment work.

1. Open the Antigravity skills tab and confirm row actions now use the common popover menu pattern.
2. Verify Antigravity menu actions still open folder, reveal file, and preview the skill correctly.
3. Open the Codex plugins tab and confirm action buttons visually match the existing Claude Code link-style actions.
4. Open the Antigravity, Claude Code, Codex, and Copilot MCP tabs and confirm long `name`, `type`, and `command / URL` values remain single-line with truncation and tooltips.
5. Open the Copilot skills tab and confirm the header folder action and row actions are present.
6. Verify Copilot skill preview works for a readable skill file.
7. Verify a writable Copilot skill can be edited and saved.
8. Verify a non-writable or unreadable Copilot skill falls back to read-only behavior without crashing.

Targeted lint or type validation should be run on touched files before any completion claim.

## Out of Scope

- refactoring all AI CLI row actions into one shared framework
- redesigning the overall AI CLI page layout
- adding skill install, uninstall, enable, disable, or remote browsing for Copilot
- changing fork-side skill discovery schemas beyond what is needed for directory resolution
- broad file-permission infrastructure beyond the minimal access helper required for the Copilot skill drawer
