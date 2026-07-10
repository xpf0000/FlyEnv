# Startup Group Candidate Collapse Selection Design

## Goal

Replace the flat Startup Group service checkbox list with a categorized, module-oriented selector that clearly presents version and project paths while enforcing module-specific single-selection and multi-selection rules.

## Selected Presentation

Use nested Element Plus collapses with custom selectable cards:

1. The outer collapse represents application module categories.
2. The inner collapse represents modules within each category.
3. Each module contains selectable version or language-service cards.

Category and module headers only expand or collapse content. They do not contain selection checkboxes.

This structure is preferred over `el-tree` because service-version modules use mixed single-selection and multi-selection rules, and the cards need enough space to display full paths and warnings.

## Ordering and Expansion

- Categories follow `AppModuleTypeList` order and reuse the existing `aside.<moduleType>` translations.
- Modules preserve the platform module order already supplied by `AppModules`, which is sorted by `asideIndex`.
- Categories are expanded when the selection step opens.
- Modules containing selected members are expanded while editing.
- Other module panels start collapsed so the list remains scannable.
- Empty categories and empty modules are omitted.

## Candidate Data

Extend `StartupGroupCandidate` with the presentation data needed by the selector:

- `moduleType`: the module category.
- `displayName`: the version number or project remark shown as the card title.
- `displayPath`: the complete installed-version path or project path.

Existing fields such as `key`, `moduleLabel`, `item`, `label`, and `port` remain available to execution, saved-item matching, warnings, and the Startup Group page.

Candidate construction rules:

- Service version: `displayName` is `target.version`, falling back to `target.bin`; `displayPath` is `target.path`.
- PHP-FPM version: uses the PHP installed version and path while retaining `php-fpm` as the saved item module.
- Language project service: `displayName` is the trimmed project comment or the localized “No remark” label; `displayPath` is `project.path`.

## Selection Rules

### Single-Selection Modules

All ordinary service-version modules allow only one selected version per module. Selecting another version in the same module automatically removes the previously selected version from that module and selects the new one.

### Multi-Selection Modules

The following candidates allow multiple selections within the same module:

- PHP-FPM service versions.
- All language-project service candidates.

Multi-selection cards use checkbox semantics. Single-selection cards use radio semantics. The complete card is clickable, while controls and click handling must not toggle a card twice.

Only candidate leaf items are saved to the Startup Group. Category and module nodes never create saved members.

## Editing and Invalid Members

When editing an existing Startup Group:

1. Load current valid candidates.
2. Match saved members against those candidates using the existing stable key and project-path validation.
3. Remove every invalid saved member from the local draft immediately.
4. Initialize selection controls from the remaining valid members.

Opening the editor does not persist this cleanup automatically. The cleaned member list is written only when the user completes the wizard and clicks Save.

The previous invalid-member panel is removed because invalid entries no longer remain in the editable draft.

## Card Content and Warnings

Version cards display:

- Version number or binary fallback.
- Complete installed-version path.

Language-service cards display:

- Project remark or localized “No remark”.
- Complete project path.

Long paths wrap or truncate with a tooltip so the dialog width remains stable. Existing same-module and same-port warnings remain visible beneath the affected selected cards and do not prevent selection or saving.

## Startup Order

Moving from the selection step to the startup-order step synchronizes the draft with the current leaf selections. The existing `vuedraggable` order editor remains unchanged and receives only valid selected members.

For single-selection modules, replacement inserts the new version through the existing candidate synchronization flow. Multi-selection candidates retain their existing relative order where possible, and newly selected members append as today.

## Error and Empty States

- Candidate loading continues to use the existing loading overlay.
- If no valid candidates are available, show the existing `noCandidates` empty state.
- Candidate loading failures continue to close the loading state through `finally`; no partial selection state is persisted.
- Categories and modules with no valid leaf cards are not rendered.

## Verification

- Test ordinary service-version selection replaces the previous version from the same module.
- Test PHP-FPM versions can be selected together.
- Test language-project services from the same module can be selected together.
- Test invalid saved members are removed when editor selection state is initialized.
- Test candidate presentation data contains category, display name, and full path for versions and language services.
- Add source-contract coverage for nested `el-collapse` rendering, radio/checkbox card controls, and removal of the previous invalid-member panel.
- Run Startup Group tests, formatting, targeted linting, and full Vue TypeScript checking.

## Out of Scope

- Selecting or deselecting an entire category or module from its header.
- Changing Startup Group execution, persistence format, or drag ordering.
- Adding search or filtering inside the selector.
- Changing the platform-module discovery or installed-version loading lifecycle.
