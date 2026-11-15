# AI Memory Windows Support Design

## Context

AI Memory currently declares macOS ARM64 only. The Windows audit found that normal path handling, project registration, record storage, atomic replacement, backup/restore, native file locking, plugin packaging, and ASAR loading already work on Windows x64. Full Electron acceptance is blocked by the manifest compatibility check. Windows also lacks `O_NOFOLLOW`, so the current `O_NOFOLLOW ?? 0` fallback does not provide the intended final-component symlink protection. The test suite contains POSIX-only path, symlink, and permission assumptions.

The requested outcome is a usable Windows plugin without changing the memory data format, project identity model, IPC protocol, or operation ownership.

## Approaches

1. **Targeted Windows enablement (selected).** Declare Windows x64, add module-local regular-file opening checks, make the existing tests portable, and run the full Windows acceptance flow.
2. **Manifest-only enablement.** Smaller, but leaves the symlink protection gap and false test results. Rejected.
3. **Cross-platform storage redesign or simultaneous Linux support.** Unnecessary for the confirmed Windows issues and outside the requested scope. Rejected.

## Design

### Platform and user-facing support

- Add `Windows` to both the packaged manifest and renderer module platform lists.
- Declare `x64` only, as explicitly requested. Because manifest architecture is global rather than per-platform, this removes the previous macOS ARM64 declaration as well.
- Update the preview labels and README so they no longer claim macOS Apple Silicon only.
- Do not add Linux or ARM64 support.

### Regular-file safety

Add one AI-Memory-local helper for opening an existing or newly created regular file. It will:

1. Inspect the final path component before opening and reject symbolic links and non-regular files. A missing final component is allowed only for callers that create files.
2. Open with the caller's flags and the platform's `O_NOFOLLOW` when available.
3. Compare the opened handle and final path metadata after opening, requiring regular files with matching device/inode identity and no symbolic link.
4. Close the handle on every validation failure and translate rejection through the caller's existing error policy.

Use the helper for rule-file writes, memory record/body reads, and backup manifest/data reads. Preserve current public outcomes: `rules_unavailable`, `managed_path_invalid`/the existing record error mapping, and `backup_invalid`. Do not change body references, backup manifest paths, or project canonical paths.

### Portable tests

- Replace POSIX-only separators and suffix checks with `node:path` operations or separator-independent basename checks.
- Build expected paths with `join`.
- Use junctions for directory aliases on Windows, as the existing project-registry test already does.
- Keep real file-symlink coverage where permitted; skip only that privilege-dependent case when Windows returns `EPERM`, while mocked metadata tests cover rejection before opening.
- Skip the Unix directory-`chmod` cleanup-failure test on Windows instead of treating different ACL semantics as a product failure.
- Add focused helper tests for pre-open symlink rejection, post-open identity mismatch, regular-file success, missing-file creation, and handle cleanup.

### Documentation and compatibility

Existing memory directories and backups remain unchanged. Windows-created project mappings use native canonical paths; cross-system restore/relink behavior remains as currently designed. No migration is needed.

## Error Handling

Manifest compatibility is a required prerequisite. Regular-file validation is required before any rule append or accepted memory/backup read and must fail the dependent operation without claiming success. Handle cleanup remains supplementary and must not hide the validation failure. Test-environment privilege skips must be explicit and must not skip unrelated assertions.

No new renderer operations, retries, process actions, or failure callbacks are introduced.

## Verification

- New helper and portable regression tests pass on Windows.
- The complete AI Memory test run has zero failures; only explicit platform/privilege skips remain.
- `yarn plugin:test ai-memory` passes.
- `scripts/plugin-memory-runtime-probe.ts` passes on Windows x64, including ASAR.
- `scripts/ai-memory-acceptance.ts --skip-agents` reaches and passes the real HTTP/UI memory workflow, proving the manifest gate, dedicated worker, restart, and data-root reuse.
- Review the final diff for stale macOS-only text and confirm no unrelated files changed.

## Assumptions

- Windows x64 is the required acceptance target on the current machine. ARM64 is deliberately excluded on every supported platform.
- Real AI-agent acceptance is separate from plugin compatibility; the required end-to-end run uses `--skip-agents` to avoid external model variability.
- The unrelated `@xpf0000/node-window-manager` local build failure is not part of this work.
