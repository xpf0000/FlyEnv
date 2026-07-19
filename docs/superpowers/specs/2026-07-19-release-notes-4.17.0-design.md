# FlyEnv 4.17.0 Release Notes Design

## Goal

Add an English FlyEnv 4.17.0 entry to `RELEASE_NOTES.md` that follows the existing release-note style and accurately communicates the three changes listed in `docs/task/TASK-RELEASE.md`.

## Content Structure

Insert the new entry above version 4.16.2 with the release date `2026-07-19`. The entry will contain:

1. A **Security & Trust** section describing Windows code signing, its user-facing authenticity and integrity benefits, and SignPath's sponsorship. The SignPath name will link to its official website.
2. An **Improvements & Bug Fixes** section describing reduced memory usage without inventing measurements or unsupported implementation details.
3. A second improvement entry describing the fix for Windows scheduled-task execution failures, without attributing a cause that is not established by the task.
4. The standard **Build & Transparency** section, GitHub Issues feedback link, and closing line used by recent FlyEnv release entries.

## Writing Constraints

- Match the English headings, numbering, separators, and tone of the 4.16.2 entry.
- Explain user impact while staying within the facts supplied by the task.
- Do not invent issue links, pull requests, contributors, benchmarks, or technical implementation details.
- Preserve all existing release entries and the user's pending changes to `docs/task/TASK-RELEASE.md`.

## Verification

- Confirm the 4.17.0 entry appears once and before 4.16.2.
- Confirm all three requested changes are present.
- Confirm the release date, SignPath link, standard build section, feedback link, and Markdown heading structure.
- Review the final diff to ensure only the intended release-note content and this design document were added.
