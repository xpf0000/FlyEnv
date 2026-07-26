# ClickHouse Watchdog Root Lifecycle Design

- Date: 2026-07-26
- Status: approved

## Goal

Keep ClickHouse consistent with FlyEnv single-instance services: starting version B makes B the current version, stops and unregisters the prior version, and leaves only B reported as running.

## Root cause

ClickHouse runs as a `clickhouse-watchdog` root with the versioned `clickhouse server` process as its child. The watchdog command line does not contain the version binary path. The existing ClickHouse stop code validates a registered root PID only when the root command contains `version.bin`; it therefore rejects a valid watchdog root, returns no stopped PID, and leaves a stale main-process registration. The shared renderer status handler then correctly maps that stale registration by `bin`, but incorrectly changes `current` during a local replacement.

## Approaches considered

1. Trust every watchdog PID by process name alone. Rejected: a reused PID or unrelated ClickHouse watchdog could be stopped.
2. Keep the existing root-command-path validation. Rejected: valid ClickHouse watchdog roots never satisfy it.
3. Recommended: accept a watchdog root only when its descendant tree contains the exact target `version.bin`; manage that root and its complete tree. This preserves exact-version ownership and handles the process model ClickHouse actually creates.

## Design

### Fork lifecycle

- After launching `clickhouse server`, identify the stable root as the process-tree root whose descendant command contains the exact target binary path. On the current macOS process model this is `clickhouse-watchdog`.
- Store and return that root PID as the version's managed PID. The server child PID is not the managed PID because watchdog may restart it.
- When stopping a version, validate watchdog ownership from its descendants, signal the validated root tree, and return every PID removed from the operating system.
- If the registered/version PID is already absent or cannot be proven to belong to the target version, do not signal it. Remove the version PID file and tell the main process to unregister the target `version.bin` specifically. Do not use that untrusted numeric PID for deregistration, because a reused PID could belong to another registered version.
- Keep the existing exact binary validation for a direct server root; use descendant validation only for the ClickHouse watchdog shape.

### Main and renderer state

- `APP-Service-Stop-PID` removes validated, actually stopped root registrations. A separate stale-version signal removes only the exact target `bin` registration when its saved PID is absent or untrusted. A replacement must complete either removal before adding the new root registration.
- The renderer continues to map runtime instances to installed versions by exact `bin`.
- While any ClickHouse version has a local lifecycle operation in progress (`running`), status broadcasts may update row state but must not replace `current`. The direct start path already selected the target current version before beginning the replacement.

## Error handling and safety

- PID reuse, an Electron child, a watchdog without a descendant running the target exact binary, or a direct server root with a mismatched command must never be signalled.
- A stale PID is removed only from FlyEnv's version PID file. Its in-memory registration is removed by exact target `bin`, never by the untrusted numeric PID.
- ClickHouse remains single-instance; no shared configuration, port, or CH-UI behaviour changes.

## Regression coverage

1. A watchdog root is owned only when a descendant command contains the exact ClickHouse binary.
2. A stale registered PID is never signalled; its exact target `bin` is used for deregistration instead.
3. A local replacement cannot have its newly chosen current version overwritten by an intermediate status notification for the stopping version.
4. Existing version PID isolation and main-process delete-before-add behaviour remain covered.
