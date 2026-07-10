# Startup Group Selector Interaction Polish Design

## Goal

Refine the Startup Group service selector so its hierarchy is visually clear, ordinary version selections can be cleared, scrolling uses Element Plus, and collapse expansion reflects the current selection.

## Layout and Scrolling

- Keep the existing category -> module -> candidate-card structure.
- Indent the nested module collapse by 16px so module headers no longer align with category headers.
- Wrap the editor content area in `el-scrollbar` with the existing `58vh` maximum height.
- Remove the native `overflow: auto` rule from the editor body so only the Element Plus scrollbar is shown.
- Preserve the existing minimum editor content height and horizontal padding.

## Selection Interaction

- PHP-FPM versions and language-project services keep checkbox multi-selection behavior.
- Ordinary service versions keep radio presentation and one-version-per-module enforcement.
- Clicking an unselected ordinary-version card or its radio selects it and replaces another selected version from the same module.
- Clicking the already selected ordinary-version card or its radio clears that selection.
- Radio click handling is intercepted by the editor so native radio behavior cannot immediately reselect a cleared candidate.
- Card click and control click handling must perform exactly one selection update.

## Collapse Initialization

After valid candidates and the normalized draft selection are loaded:

- If there are no selected candidates, all categories and all modules start collapsed.
- If candidates are selected, expand only categories containing a selected candidate.
- Within those categories, expand only modules containing a selected candidate.
- Categories and modules without selected candidates remain collapsed.
- User expansion changes after initialization continue to be controlled by the existing `el-collapse` models.

## Data and Persistence

- No persistence schema changes are required.
- Invalid saved members continue to be removed only from the local editor draft during initialization.
- Selection changes, including clearing an ordinary version, are synchronized to the draft when moving to the startup-order step and persist only when Save is clicked.

## Verification

- Add a regression assertion that selecting an already selected ordinary candidate with `selected=false` removes its key.
- Add source-contract assertions for `el-scrollbar`, module indentation, selected-only category expansion, and removal of native scrolling.
- Run the Startup Group test, Prettier, ESLint, full Vue TypeScript checking, and `git diff --check`.

## Out of Scope

- Changing candidate ordering.
- Changing warning rules or persistence format.
- Adding search, filtering, or category/module bulk selection.
