# OpenSearch Dashboards integration

## Approved scope

The user approved integrating the official Dashboards UI into the existing OpenSearch
plugin, with local development mode first. Add a service-page button that installs a
matching version, starts a loopback-only companion, waits for readiness and opens the
browser. Support official Windows/Linux archives and matching macOS Homebrew installs.
Authenticated-cluster account/certificate configuration is a follow-up: this release
must clearly reject unsupported secure connections rather than change cluster security.

## Operation contract and boundaries

- Renderer owner: plugin-local singleton controller bound with `reactiveBind`; survives
  page unmount. Owns request snapshot, re-entry guard, IPC listener, progress, errors,
  terminal cleanup and browser opening. No new Pinia or `config.setup` properties.
- Fork owner: plugin-local Dashboards runtime; owns install staging, PID, port,
  backend identity, health and shutdown. Backend versions remain in existing BrewStore;
  companion installations and instance manifests live under the plugin's data directory.
- Start: click with an actual running OpenSearch instance; immutable version snapshot.
- Intermediate: `code: 200` download/install/start progress remains non-terminal.
- Terminal: `code: 0` gives a ready URL and companion registration; `code: 1` fails.
- Duplicates: renderer shares the pending operation; fork serializes open and stop so
  a queued/in-progress open cannot publish a companion after stop finishes.
- Parent interaction: existing `ModuleInstalledItem.start/stop/restart` is unchanged;
  fork `_stopServer` additionally stops owned companions, including after parent exit.
  Explicit panel-only stop arguments allow main's companion registration to clean up
  on quit without treating the panel PID as the OpenSearch service PID.
- Success: ready local Dashboards connects to the running backend of the same version.
  A successful download alone is not readiness; unrelated listeners are not reused.

## Failure contract

- Backend confirmation, matching installation, config write and readiness are required
  dependencies. Their failure stops opening, retaining completed downloads/installations
  where valid, and never stops or changes the running OpenSearch backend.
- Parent and companion stops are independent required items: attempt both, aggregate
  failures and report confirmed stopped PIDs in the partial-failure log/message. Main
  retains registrations on failed terminal results; retry reconciles already stopped
  candidates through the existing snapshot contract. No shared IPC policy change.
  Base failures do not expose partial PID results, so completion inside a rejected Base
  stop remains unknown. Runtime batch failures report their own confirmed instance PIDs.
- PID discovery uses the supplied initial stop snapshot. Base owns signals, fresh exit
  confirmation and safe PID cleanup. Do not poll the immutable discovery snapshot.
- Browser opening is supplementary: it must not replay installation or process start.
- Health failure stops only the newly started companion; cleanup failure remains visible.
- Skip unowned/unverifiable processes individually; never signal arbitrary Node processes.

## Implementation tasks

1. Runtime/config/installer: exact version and platform checks; YAML backend config;
   actual backend HTTP/version probe; plugin-owned staging and runtime/data/config/log
   paths; no-security Dashboards setup; Homebrew discovery/install; port scan/readiness;
   single-flight/stop coordination; reuse Base for owned process shutdown.
2. Renderer: service-page action, singleton lifecycle controller, progress/terminal
   handling, en/zh plugin translations, meaningful transport/lifecycle tests and plugin
   entry-page additions to renderer-operation boundary checks.
3. Lifecycle integration: companion-only registration/stop; main service stop and
   restart clean companions even when the parent is absent or another stop fails.
4. Verification/review: runtime behavior fixtures (platform, version/security, download
   failure, partial install, ready/timeout, reuse, duplicate, stop races, PID safety),
   renderer tests, common lifecycle/boundary checks, plugin build/contract smoke, lint
   and diff check. Real downloaded Dashboards startup where practical; document platform
   limits and pending desktop acceptance. Do not publish or commit automatically.

## Constraints checklist

- No exception authorization; all module-owned state/files/helpers stay inside plugin.
- No shared configuration persistence, new Pinia, shared enums or generic service fields.
- Only the extra companion workflow is module-specific; the main service continues using
  `ModuleInstalledItem` and Base. Existing service lifecycle cannot represent installing
  and opening a separate on-demand web process, so the companion runtime owns this work.
- Prior session llama.cpp shutdown changes are unrelated and preserved.

## Verification result

### Follow-up: Windows startup console windows

Native child-process tracing identified four startup `execSync` calls in the official
3.9.0 `@osd/cross-platform/target/path.js` full/short-path resolution. They launch
PowerShell through CMD without `windowsHide`; FlyEnv's outer launcher, environment,
process-list and listener queries already hide their own windows. The plugin-owned
generated CommonJS bootstrap will set `windowsHide: true` on synchronous shell calls
inside the Windows companion only, before requiring its CLI. Keep command/options,
return values and errors unchanged, including encoding and timeouts. No shared child
process policy or changes to third-party installed files. Runtime/controller ownership,
IPC, re-entry, cancellation and required/supplementary boundaries remain unchanged.
The native launcher regression intercepts the actual synchronous execution options,
exercises output/error behavior and verifies continued logging after worker exit;
repeat native 3.9.0 startup with tracing to confirm hidden options and HTTP readiness.
Before the fix, native tracing captured four `execSync` calls with no hiding option;
after the fix, all four calls passed `windowsHide: true`, and the real panel became
HTTP-ready. The six-suite regression and focused ESLint pass. The process fixture
waits for its periodic log as well as initial output so synchronous startup probes
cannot prematurely end its worker-exit observation.

### Follow-up operation contract: preparation before service startup

The official Windows 3.9.0 archive is 459 MB; native download and extraction exceed
the five-minute opening budget. Keep one renderer singleton request snapshot and
single-flight promise, but run `prepareDashboards` (software preparation, 15-minute
fork budget / 16-minute renderer maximum) before `openDashboards` (existing companion
service start, five-minute fork budget / 6.5-minute renderer maximum). Both phases
emit progress; only declared terminal responses complete a phase. A failed or
cancelled preparation prevents service start and browser opening. Preparation never
spawns a companion or emits service-start metadata, and therefore uses normal IPC
without changing the application's six-minute service-start watchdog. Parent stop
aborts the active phase and fences pending operations in the same fork serializer.
Installation is a required dependency; completed software files survive subsequent
start failures. Browser opening remains supplementary. Duplicate invocations share
the complete two-phase operation, and listener/timer cleanup occurs at each terminal
response. Tests cover preparation without spawn, shared promises, cancellation,
progress retention, immutable snapshots and preparation failure preventing open.
Generic requests can run on separate fork workers. Plugin-owned atomic generation
records fence the whole prepare/open chain; preparation returns its generation and
opening must present the same token. An abort watcher cancels signal-aware work when
another worker stops. A per-version software lock serializes installation, and a
separate lifecycle lock covers companion spawn/readiness and stop discovery/cleanup.
Stop invalidates the generation before acquiring the lifecycle lock, so a starting
worker cleans its child before stop scans. Lock recovery requires a confirmed dead
worker and exclusive reaper claim, never a timeout/age assumption. Required coordination
write/read failures propagate. No new shared service state or worker affinity policy.
Concurrent stops serialize generation writers using a separate short lock on Windows;
this never waits on the lifecycle lock before cancelling an active operation. Unknown
or dead recovery-owner records remain a bounded explicit failure rather than granting
permission to delete another worker's lock. Lock-release diagnostics preserve already
completed service results and companion registration.
Windows readers can briefly hold lock-owner files while a writer renames their
directory. Required atomic renames retry only sharing-related Windows errors for
at most 2.5 seconds with 25 ms backoff and retain ownership checks. The 30-concurrent
invalidation regression reproduced both generation replacement and lock-release
`EPERM` failures before these fixes; it passes three consecutive fresh Windows runs.
All module constraints still apply; no exception or shared lifecycle change.

### Follow-up: icon entry and backend startup readiness

The panel entry now uses the established green HTTP icon and a loading icon; the
tooltip retains the label/progress. In the supplied Windows OpenSearch 3.9.0 installation,
the PID file appeared over 20 seconds before HTTP became usable. The companion's
fork-owned prerequisite now waits up to 60 seconds for the backend HTTP endpoint, with
progress and cancellation under the owning phase's operation budget. Auth/TLS and
version failures remain terminal, and a connection timeout reports the URL and transport
error. No cluster configuration or security settings are changed by opening the panel.

The socket regression reproduces the original connection error before the fix and
checks delayed availability, auth failure, cancellation and stopping during the wait.
The supplied native backend passed the same probe after waiting 23.6 seconds from PID
creation. Main service startup/PID semantics remain unchanged.

- `yarn test:opensearch-dashboards`: backend readiness, cross-worker coordination,
  runtime, renderer, parent/companion stop and
  native detached-process lifetime regressions pass. The native fixture keeps writing
  its log after the launching worker exits and cleans up its own child afterward.
- `yarn plugin:test opensearch`: renderer/fork build and plugin interface checks pass.
  The minified production bundle also imports and exposes the expected entry methods.
- ESLint passes for changed OpenSearch and regression files; `git diff --check` passes.
- Full TypeScript checking reports no OpenSearch Dashboards diagnostics. It still fails
  on 38 existing diagnostics elsewhere in the repository.
- Independent review findings for queued opens, localized auth handling, repeated YAML
  keys, worker-owned logging and Homebrew reuse were fixed and rechecked.
- Native Windows acceptance uses the supplied OpenSearch 3.9.0 installation and the
  official matching 459,516,846-byte Dashboards archive. Download/unpack completed
  during the first run, which exposed the old five-minute budget. Its completed staging
  package was version/CLI/Node-verified, configured without the bundled security plugin
  in FlyEnv's own installation, and published for runtime acceptance; a fresh full
  download under the new fifteen-minute preparation budget was not repeated.
  `prepare`/`open` and reuse pass; backend and panel versions are 3.9.0,
  `/api/status` is HTTP 200 with green health, and `/app/home` is HTTP 200 with the
  OpenSearch Dashboards page title. A fresh runtime's Base-backed stop confirms the
  actual companion PID exited and removed its PID file. Backend configuration is
  untouched. The launcher uses `.cjs`, including under a parent package with
  `type: module`; the native detached-process regression covers that path.
  macOS/Linux desktop acceptance remains manual verification.
- Local package: `dist/plugins/opensearch/opensearch-0.1.0.flyenv-plugin`. No registry
  update, publishing or commit was performed.
