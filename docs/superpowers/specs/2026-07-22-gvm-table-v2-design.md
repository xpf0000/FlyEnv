# GVM Table V2 Migration Design

## Context

The GVM version list can contain enough rows for the current `el-table` implementation to render
slowly on lower-spec computers. FlyEnv already uses Element Plus `el-table-v2` for other version
manager pages, including Node.js FNM and NVM.

## Goal

Replace only the GVM list renderer with a virtualized table. Preserve the existing four-column
layout, search location, newest-first ordering, status display, and all version actions.

## Non-goals

- No changes to GVM data fetching, parsing, sorting, or command execution.
- No changes to installation, uninstallation, or default-version behavior.
- No new pagination, selection, or row actions.

## Component Design

`src/render/components/GoLang/gvm/index.vue` will follow the established FNM/NVM pattern:

- Wrap the table with `el-auto-resizer` and pass its `height` and `width` to `el-table-v2`.
- Use the shared `app-el-table-v2` class.
- Set both header and row heights to 59 pixels.
- Change the setup script to TSX and define typed `Column<GvmVersionItem>[]` renderers locally.

The columns remain:

1. Version: flexible width, existing left padding, and the search input in its header.
2. Installed: fixed 150-pixel width and the existing installed icon.
3. Default: fixed 150-pixel width, showing either the active default icon or the hover action for
   an installed non-default version.
4. Action: fixed 150-pixel width and the existing install/uninstall action rules.

Keeping the renderers in the page avoids introducing a separate abstraction whose only purpose
would be to pass page-local action handlers back into the component.

## Data and Interaction Flow

The existing computed `versionList` remains the table data source. Search filtering and
newest-first sorting therefore occur before virtualization and retain their current behavior.
Cell button handlers continue to call `setVersionDefault` and `doVersionAction`; terminal task
handling and refresh behavior are unchanged.

Only rows in or near the visible viewport will be mounted by `el-table-v2`, reducing DOM work for
large GVM version lists.

## Testing and Verification

The GVM regression test will first assert the desired virtual-table structure and fail against the
current page. After implementation it will verify:

- `el-auto-resizer` and `el-table-v2` are used.
- The legacy `el-table` markup is absent.
- The virtual table consumes `versionList` and the typed column configuration.
- Existing GVM action wiring and newest-first sorting checks remain intact.

Final verification will run the GVM test, ESLint for the changed files, Vue TypeScript checking,
and `git diff --check`.
