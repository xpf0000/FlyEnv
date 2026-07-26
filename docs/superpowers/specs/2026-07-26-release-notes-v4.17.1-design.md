# FlyEnv v4.17.1 Release Notes Design

## Goal

Add an English, user-facing v4.17.1 entry to `RELEASE_NOTES.md` for the July 2026 release.

## Content and structure

- Insert the entry above v4.17.0 and date it `2026-07-26`.
- Preserve the established title, section headings, Markdown conventions, build-transparency section, and feedback footer.
- Use a **New Features** section for ClickHouse, Temporal Server, Temporal CLI, and Startup Groups in the tray menu.
- Use an **Improvements & Bug Fixes** section for Windows elevation-method selection and automatic UAC fallback when Helper installation fails.
- Describe user-visible behavior without speculative implementation claims. Link the relevant GitHub Issues: #774, #730, #782, #756, and #797.

## Scope boundaries

- Modify only `RELEASE_NOTES.md` for the requested release content.
- Do not change application code, translations, release configuration, or the existing task document.

## Verification

- Inspect the inserted Markdown for heading hierarchy, version/date placement, all five requested changes, and valid GitHub links.
- Confirm the working-tree diff is limited to the release notes plus this process specification, while preserving the pre-existing task-file modification.
