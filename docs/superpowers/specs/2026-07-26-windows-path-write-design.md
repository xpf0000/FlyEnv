# Windows PATH Write Semantics Design

## Context

On Windows, FlyEnv reads the machine-level `Path`, changes it when a service
version is activated or an environment-path entry is edited, then writes the
complete value through the privileged Go helper or its UAC PowerShell fallback.

The current write path applies a FlyEnv-specific semantic whitelist to every
entry in that complete list. It requires entries to be absolute paths or a
restricted `%ENV_VAR%\\subpath` form. That incorrectly rejects pre-existing,
Windows-usable values such as `%INTEL_DEV_REDIST%redist\\intel64\\compiler`.
It also makes the PATH editor unable to save arbitrary user-provided entries.

The version switcher additionally sends the list through a helper that trims,
deduplicates, filters, and globally sorts it. Global sorting is not the right
way to give an activated FlyEnv version priority: it changes the precedence of
unrelated user entries.

Finally, Windows environment synchronization merges the current registry PATH
with the Electron process's startup PATH. After a successful update this can
retain removed or old entries in processes FlyEnv starts, even after its cache
has been invalidated.

## Goals

1. Let the Windows PATH editor save every PATH value that Windows can store;
   FlyEnv must not impose a PATH syntax, absolute-path, traversal, or length
   policy.
2. Keep the currently selected FlyEnv service version ahead of unrelated PATH
   entries without globally reordering those unrelated entries.
3. Preserve the text and relative order of legacy entries when a version is
   changed.
4. Make fresh Windows registry environment data authoritative for newly
   spawned FlyEnv child processes.
5. Keep Go Helper and TypeScript UAC fallback behaviour identical.

## Non-goals

- Do not rewrite an existing Intel, SDK, compiler, or other third-party PATH
  configuration merely to make it look like a FlyEnv-preferred form.
- Do not introduce a FlyEnv maximum PATH length. Registry write and process
  launch results are the authoritative compatibility signal.
- Do not change `setSystemEnv` or the `otherVars` argument's existing
  allowlist and value validation; this design only changes `setSystemPath`'s
  `paths` argument.
- Do not try to classify every historical PATH entry as FlyEnv-owned or
  user-owned. Such classification is neither complete nor reliable.

## PATH writer contract

`tools/setSystemPath(paths, otherVars)` is a privileged, generic machine PATH
editor. Its `paths` array is the requested ordered PATH list, not an internal
FlyEnv-only list.

Both helper implementations must accept each string unchanged, including:

```text
%INTEL_DEV_REDIST%redist\intel64\compiler
.\tooling\bin
$env:SDK\bin
\\server\share\bin
```

The only validation at this boundary is structural: the RPC payload must have
a string-array `paths` and a string-map `otherVars`. Strings containing an
embedded NUL must fail because Windows UTF-16 registry APIs cannot represent
them without ambiguous truncation. No FlyEnv PATH length limit, directory
existence check, character whitelist, environment-variable grammar, or path
traversal check is applied to `paths`.

The Go helper continues to write the value through the Windows registry API.
The TypeScript fallback continues to write literal values through encoded
PowerShell with single-quote escaping or JSON payload files. The writer returns
the native registry/UAC error if Windows rejects a requested value.

## Priority merge for service activation

Version activation needs priority, but priority is an operation-specific
change, not a global PATH sort.

For an ordered current list `L` and the ordered entries `P` required by the
currently active FlyEnv versions, write:

```text
dedupeForPriority(P) + removeExactMatches(L, P)
```

`P` contains service executable directories in their explicit priority order,
for example `bin`, then `sbin`, then the service root when those directories
exist. `removeExactMatches` uses case-insensitive Windows path equality only
for the entries being promoted. It preserves every non-promoted `L` entry,
including duplicates and unusual strings, in its original order and spelling.

When replacing an old FlyEnv version, the version manager may remove entries
only when it can prove they are under FlyEnv's known env-junction or installed
service roots. It must use normalized directory-boundary comparison, not
substring matching such as `includes()`. This is an update algorithm for paths
FlyEnv created; it is not a validation or ownership system for all PATH data.

The System Environment tool does not apply this merge. It writes the user
arranged list in exactly the displayed order.

## Fresh environment synchronization

On Windows, `WINDOWS_ENV_SCRIPT` already reads machine and user environment
variables and constructs the effective PATH from those registry values. When
that read succeeds, `EnvSyncLocal` must use this fresh PATH only. It must not
append `process.env.PATH`, which is inherited from the Electron process at
launch and can be stale.

If reading the registry fails, the existing `process.env` fallback remains.
After a successful `setSystemPath`, both helper paths invalidate EnvSync and
perform a fresh sync before starting the next child process.

## Concurrent edits

PATH writes replace one registry value, so a stale UI or version-switch
snapshot can overwrite an external modification. The write contract gains an
optional trailing `expectedPath` argument containing the unexpanded raw PATH
read immediately before the requested edit.

The helper reads the raw machine PATH immediately before writing. If it differs
from `expectedPath`, it returns a `system_path_changed` error without writing.
The environment editor refreshes and asks the user to review the new list. A
version switcher refetches, rebuilds its priority merge once, and retries once;
if the value changes again it returns the same conflict error. The optional
argument keeps callers that do not yet have a snapshot compatible during the
rollout, but all Windows PATH mutation callers in FlyEnv will be migrated in
this change.

The compare-before-write check cannot make Windows registry replacement
globally atomic with unrelated elevated programs. It prevents ordinary stale
snapshot overwrites and gives a visible conflict instead of silently discarding
a recently observed change.

## Files and responsibilities

- `src/fork/util/PATH.win.ts`: lossless machine PATH parsing, priority merge,
  ordered write requests, and the expected raw-path snapshot.
- `src/fork/module/Tool.win/path.ts`: constructs only the current FlyEnv
  promotion list; stops using global filtering/sorting for legacy entries.
- `src/shared/WindowsHelperFallback.ts`: structural-only validation for
  `setSystemPath`, raw conflict comparison, and safe literal PowerShell write.
- `src/helper-go/module/tool.go` and `src/helper-go/module/tool_windows.go`:
  optional expected-path handling, raw conflict comparison, and registry write.
- `src/helper-go/main.go`, `src/fork/Helper.ts`, and
  `src/helper-go/contract/helper-contract.json`: add the optional contract
  argument consistently.
- `src/shared/EnvSyncLocal.ts`: use the fresh registry-derived PATH without
  appending the inherited process PATH.
- `src/render/components/Tools/SystenEnv/setup.ts` and its fork response:
  retain the raw snapshot needed to detect a stale save and present a refresh
  error when it changes.

## Verification

Automated tests must prove all of the following:

1. Go Helper and UAC fallback both accept the Intel entry unchanged and retain
   relative, variable-based, missing, UNC, and non-ASCII entries.
2. Embedded-NUL PATH input fails before reaching a registry write; there is no
   FlyEnv length or syntax rejection.
3. A version promotion prepends its explicit entries, removes only their
   case-insensitive duplicates, and leaves all remaining user entries in the
   same relative order and spelling.
4. The System Environment tool writes a manually ordered list without a
   version-priority merge.
5. A changed raw PATH returns `system_path_changed` and does not write; a
   version activation refreshes and succeeds on one retry.
6. A fresh registry PATH replaces, rather than appends to, the Electron
   process's inherited PATH after synchronization.
7. Existing helper contract, Go unit, fallback-plan, EnvSync, and Windows
   elevated acceptance tests pass.

Windows manual acceptance must include an Intel configuration that ends
`INTEL_DEV_REDIST` with `\\` and has the original
`%INTEL_DEV_REDIST%redist\\intel64\\compiler` entry. Switching Apache must
succeed without changing that third-party configuration, and `where httpd`
from a newly launched FlyEnv terminal must resolve the selected version first.
