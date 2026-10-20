# MySQL Cluster — plugin-only correction

User approved the in-chat design and explicitly requested implementation on 2026-10-21.
This supersedes the paired-host decision in the initial plan; existing cluster behavior remains.

## Scope and boundaries

- Restore every host runtime source and boundary script to `619d7c8d`; no source monkey patches,
  shared prototypes or new host capability flags. Plugin code, registry and documentation only.
- Local instance registry owns stable `ModuleInstalledItem` objects, reuses their real
  start/stop/restart plus existing per-module startExtParam/stopExtParam.
- Host `allInstalledVersions` returns no instance collection; a plugin-specific descriptor query
  feeds the local registry. Thus ordinary host scans cannot persist an instance as current version.
- Plugin-local Services/Versions views preserve installed versions, notes, environment/aliases,
  directories, refresh and the three installation sources using existing mysql installation APIs.
- Installation/removal admission, progress, terminal DOM/PTTY, reentry, notices and cleanup belong
  to a module-local singleton; view destruction only detaches its terminal view.
- Runtime catalog/process/SQL ownership, independent Storage and topology code remain unchanged.
- No new Pinia/config.setup fields. Existing mysql installation lists, environment and search-directory
  settings remain owned by their existing host stores. No exception to module constraints required.

## Operations

| Operation | Owner/lifetime | Events and terminal | Duplicates and failures | Service interaction/tests |
| --- | --- | --- | --- | --- |
| Descriptor refresh | local service registry, plugin lifetime | plugin descriptor RPC; reconciled/failed | duplicate refresh shared; preserve old objects on error | old host scan empty, identity stable and no config writes |
| Lifecycle | existing ModuleInstalledItem plus local registry | existing service progress/PID terminal | existing flights, exact stop args | no custom start/stop IPC; old-host integration regression |
| Source lists | installation singleton | fetch source, list/error | share identical request; independent source errors | existing mysql read APIs, no implicit uninstall |
| Install/static remove | installation singleton | download progress then installed/failed | one mutation at a time; late refresh/notice errors do not replay completed work | reject running/unknown references and lifecycle in flight; fault-injection tests |
| Package install/remove | installation singleton and retained terminal DOM | PTY output then exit-code terminal | one operation; cancel waits for PTY stop then cleanup; survives tab change | guarded removal; MacPorts does not follow dependents; quoted validated args |
| Notes/env/alias/custom paths | installation singleton delegates existing capabilities | saved/failed/dialog closed | per-action admission; no per-view IPC | existing mysql domain, not new shared config |

## Execution

1. RED regressions: local lifecycle against original host, no-host-diff contract, safe removal and
   installation-controller success/progress/error/reentry/cancel; replace old opt-out test.
2. Restore host code; implement local registry, plugin-local source/service views and operation owner.
3. Run focused suite/boundaries/lint/types; build and inspect artifact on unchanged host; real Vue
   browser preview with old-host bridge and native isolated MySQL acceptance.
4. One independent review of correction, fix important findings with regressions, preserve limitations.

No publishing/activation, source merge or user database changes are authorized by this correction.

## Implementation evidence before independent review

- Original host source/tree contract passes: `git diff 619d7c8d -- src scripts` is empty.
- Original Module and ModuleInstalledItem are exercised together with local stable registry objects;
  host installed collection stays empty and shared config write spy stays zero.
- 76 focused tests: 75 pass, 1 explicit native default skip, 0 failures.
- Separate native Oracle 8.4.8 macOS arm64 acceptance passes in 97.12s; no user databases/services touched.
- New package fault injection caught /var realpath aliases; canonical package/data/engine paths now
  protect live instances and symlinked database files. Tests use temporary empty package roots only.
- Hide waits admitted lifecycle work, then stops through public lifecycle; background intent preserved.
- Required installation failure still refreshes partial installed state; cancelled commands cannot
  report success. Dialogs settle on close even if the original host dialog emits no submit.
- Plugin messages render as text. Source views and all operation owners are bundled locally.
- ESLint clean; renderer boundary audit passes; baseline type diagnostics remain unchanged (53).
- 0.1.1 package builds on the original unmodified host; browser fixture verification and final review pending.

## Final status

Correction implemented and independently reviewed; both Important findings fixed in one RED→GREEN
pass. Final evidence and rulings: [0.1.1 review report](../reviews/2026-10-21-mysql-cluster-plugin-only.md).
78 focused tests (77 pass, 1 explicit native skip), separate native pass; types match the existing
53-diagnostic baseline, lint/boundaries/build/archive/bundled-Fork checks pass. Browser uses the actual
packaged renderer and original host bridge shape; all temporary surfaces were cleaned up.
