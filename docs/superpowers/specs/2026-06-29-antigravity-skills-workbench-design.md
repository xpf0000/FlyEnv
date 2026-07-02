# Antigravity Skills Workbench Design

## Goal

Improve the `Antigravity CLI` skills tab so it is useful as a lightweight file workbench instead of a read-only list.

This change adds:

- a header action to open the Antigravity skills directory
- per-skill actions to open the skill directory and reveal the skill file
- a detail drawer for viewing, editing, and previewing `SKILL.md`

This change does **not** turn Antigravity into a full skills manager like Hermes.

## Current Problem

The current implementation in:

- `src/render/components/Antigravity/Skills.vue`
- `src/render/components/Antigravity/setup.ts`
- `src/fork/module/Antigravity/index.ts`

only lists discovered skills and allows copying the resolved file path.

That makes the tab low-value because the user still has to leave FlyEnv to:

- open the skills directory
- locate the actual `SKILL.md`
- inspect markdown content
- edit the file and preview rendered output

## Constraints

- Preserve the existing Antigravity skill discovery behavior.
- Follow the interaction model already used by Hermes where it is helpful.
- Keep built-in skills browsable but avoid encouraging direct modification.
- Avoid adding unnecessary Antigravity-specific IPC for file reads and writes when renderer utilities already support local file operations.
- Limit scope to the Antigravity skills tab and supporting drawer behavior.

## Options Considered

### Option 1: Small UI patch only

Add an "open directory" button and a couple of row actions, but keep detail view as plain text.

Pros:

- Smallest diff
- Fastest to ship

Cons:

- Still weak for real editing
- No markdown preview
- Would feel inconsistent with the rest of the AI CLI tooling

### Option 2: Lightweight skills workbench

Keep the existing discovery list, add filesystem-oriented actions, and add a `SkillView` drawer for code/edit/preview.

Pros:

- Solves the practical workflow gap
- Reuses proven Hermes interaction patterns
- Keeps scope controlled

Cons:

- Slightly larger renderer change
- Requires one extra fork method for resolving the skills root directory

### Option 3: Full Hermes-style skills management

Add enable/disable, update, uninstall, reset, and remote browsing.

Pros:

- Maximum parity with Hermes

Cons:

- Much larger product and implementation scope
- Not justified by the current request
- Risks inventing Antigravity behavior that may not map cleanly to the CLI

## Chosen Design

Use **Option 2**.

Antigravity's skills tab will remain a local skills browser, but it will become a practical editing surface for `SKILL.md` files.

## UX Design

### Header Actions

The skills card header will add a folder icon button beside the title.

Behavior:

- click opens `~/.gemini/antigravity-cli/skills`
- the existing refresh button remains

This mirrors the useful part of Hermes without introducing extra tabs or registry browsing.

### Skill Row Actions

Each skill row will expose these actions:

- open skill directory
- reveal the skill file in the system file manager
- open skill details

The existing "copy path" action will be removed because the new actions are more directly useful.

### Skill Detail Drawer

Add a drawer component modeled after Hermes `SkillView`:

- `code` mode: markdown editor only
- `both` mode: split editor and rendered preview
- `preview` mode: rendered markdown only

The drawer title will show the skill name, with built-in skills clearly labeled when applicable.

Save behavior:

- user skills are editable and savable
- built-in skills are view-only and preview-only
- if the target file is missing or unreadable, show an error placeholder and disable save

## Data Flow

### Skill Listing

Keep `listSkills()` as the source for row data.

Each row already includes:

- `name`
- `description`
- `path`
- `enabled`

The list payload will be extended with:

- `builtin: boolean`

The renderer will additionally derive:

- the containing directory from the returned file path

Built-in status must come from fork data instead of being inferred from a display name suffix.

### Opening the Skills Directory

Add `openSkillsDir()` to `src/fork/module/Antigravity/index.ts`.

It returns the user skills root:

- `~/.gemini/antigravity-cli/skills`

Renderer then calls `shell.openPath(...)`.

### Viewing and Editing Skill Content

Do not add dedicated Antigravity IPC for reading or saving the file contents.

The drawer will use existing renderer-side utilities:

- `fs.readFile(path)`
- `fs.writeFile(path, data)`
- `md.render(markdown)`

This keeps file viewing/editing consistent with other local-file features in FlyEnv.

## Implementation Shape

Expected new or changed files:

- `src/render/components/Antigravity/Skills.vue`
- `src/render/components/Antigravity/setup.ts`
- `src/render/components/Antigravity/SkillView.vue` new
- `src/fork/module/Antigravity/index.ts`
- `src/lang/en/antigravity.json`

Localized strings should be kept minimal and only added for newly visible UI labels if existing base strings are insufficient.

## Error Handling

- If opening the skills root fails, show the existing generic error messaging path.
- If a skill file path cannot be read, the drawer shows a readable fallback message instead of crashing.
- Save failures surface the write error through the existing message component.
- Built-in skills must not present an enabled save action.

## Test Plan

Manual verification is sufficient for this scoped UI enhancement:

1. Open Antigravity skills tab with at least one user skill present.
2. Verify header folder button opens the user skills directory.
3. Verify per-row directory action opens the containing folder.
4. Verify per-row reveal action highlights the `SKILL.md` file.
5. Verify details drawer loads markdown content.
6. Verify `code`, `both`, and `preview` modes switch correctly.
7. Verify editing and saving a user skill persists file changes.
8. Verify built-in skills can be viewed but not saved.

Run targeted type/build verification on changed files before completion.

## Out of Scope

- Antigravity skill install, uninstall, enable, disable, update, or reset actions
- remote skill registries or marketplace browsing
- changing Antigravity skill discovery rules
- editing any non-skill Antigravity configuration from this tab
