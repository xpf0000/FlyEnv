# Redis Commander Web Panel Design

## Goal

Add an on-demand Redis Commander web panel for a running FlyEnv Redis service. The
panel is installed only when first opened, connects with the service's configured
port and password, opens without user-managed panel credentials, and stops when
Redis stops.

## Scope

- Support FlyEnv-managed Redis on macOS, Linux, and Windows.
- Install `redis-commander` from npm at first explicit use, without bundling it in
  FlyEnv or pinning a package version.
- Bind the panel only to `127.0.0.1`.
- Keep the Redis Commander files in `Server.BaseDir/redis-commander`.
- Record the package's MIT license and on-demand distribution in
  `docs/third-party-licenses.md`.

The feature does not add a Redis Commander settings page, expose its credentials,
or turn Redis Commander into a generic multi-database panel.

## Architecture

### Fork ownership

`src/fork/module/Redis/RedisCommander.ts` will export a Redis-specific
`RedisCommanderRuntime`. It owns all external-process state:

- package installation and its private directory;
- a generated, persisted internal HTTP Basic Auth credential;
- loopback port allocation, PID and port persistence;
- command ownership validation, health checks, process reuse, and strict cleanup;
- the Redis Commander connection command line; and
- parsing the running Redis service configuration.

The runtime will use existing shared loopback-port and listening-PID helpers. It
will not add a second port scanner or process-list implementation.

`src/fork/module/Redis/index.ts` will lazily create one runtime instance. Its
`openRedisCommander` fork command delegates to `runtime.open`. Its `_stopServer`
will call `runtime.stop()` before stopping Redis and merge the companion PIDs into
`APP-Service-Stop-PID`, including the Windows-specific stop path.

### Renderer ownership

`src/render/components/Redis/RedisCommanderPanel.ts` will export one singleton
controller. It owns the renderer operation lifecycle: `opening`, duplicate-click
suppression, IPC registration, the first-install notice, terminal cleanup, error
display, and opening the returned loopback URL.

`src/render/components/Redis/Index.vue` remains a mounted view. It only computes
whether Redis is running, displays the panel icon, binds `RedisCommanderPanel`'s
state, and invokes `open()`. It does not import IPC, hold the operation's loading
state, parse Redis configuration, or handle process lifecycle events.

## Redis Configuration Boundary

The renderer must never read or parse a Redis configuration file. It must never
send Redis configuration text, `port`, `requirepass`, or a derived Redis password
through IPC.

The renderer sends only immutable service identities needed by the fork:

- the selected Node.js executable, required to run the npm-installed panel; and
- the running Redis version identity, required to select
  `RedisDir/redis-<major>.conf`.

The fork reads that file itself. A parser local to `src/fork/module/Redis/` will
skip blank and comment lines, accept quoted values, validate `port` in the normal
TCP range, and read `requirepass`. An absent or invalid `port` uses Redis's
default `6379`; an absent `requirepass` means no password argument is passed.
The parsed password remains in the fork process and is supplied directly to the
Redis Commander child-process arguments.

## Runtime Behavior

The runtime directory is `Server.BaseDir/redis-commander` and contains:

- `node_modules/redis-commander` and its private installation manifest;
- a private JSON file with FlyEnv's generated HTTP Basic Auth credential;
- `redis-commander.pid` and `redis-commander.port`; and
- startup stdout and stderr logs.

The runtime uses the selected Node installation's npm executable to run
`npm install redis-commander`. It passes `--no-package-lock`, `--no-audit`, and
`--no-fund`; the installation manifest requests `redis-commander: latest`.

Redis Commander starts with a free loopback port and with these relevant options:

- `--address 127.0.0.1` and the allocated `--port`;
- the fork-parsed `--redis-host`, `--redis-port`, and optional
  `--redis-password`;
- FlyEnv's generated `--http-auth-username` and `--http-auth-password`;
- `--nosave`, so Redis Commander does not write connection settings; and
- `--no-log-data`, so Redis values are not written to the panel log.

The returned URL embeds FlyEnv's internal Basic Auth credential. The renderer
uses the sensitive IPC path and opens that URL directly, so the user does not see
or manage a separate Redis Commander login. The URL is only returned after the
owned process is listening on loopback and its HTTP endpoint responds.

On a later click, a recorded PID is accepted only when its command still belongs
to this runtime, its PID owns the recorded loopback listener, and the HTTP health
check succeeds. A healthy process returns its existing URL without restart. A
stale process is killed only after ownership verification; stale PID and port
files are then removed before a fresh launch.

## Operation Contract

| Contract item | Definition |
| --- | --- |
| Renderer owner and lifetime | `RedisCommanderPanel` singleton; survives `Redis/Index.vue` unmounts. |
| Fork owner and lifetime | `RedisCommanderRuntime`; owns child process, PID, port, credentials, health, and cleanup. |
| Start event | A user clicks the icon while Redis is running and a Node version is selected. |
| Intermediate event | Fork emits `web-panel-install` before first npm install. Renderer shows the first-install notice and retains `opening`. |
| Terminal success | Fork returns a healthy URL. Renderer removes the IPC listener, closes the notice, clears `opening`, and opens the URL. |
| Terminal failure | Fork rejects. Renderer removes the listener, closes the notice, clears `opening`, and displays the error. |
| Duplicate invocation | Renderer ignores it while opening; fork coalesces concurrent opens into one runtime promise. |
| Parent interaction | The icon appears only for a running Redis service. Redis stop stops the runtime first and reports its PIDs with the Redis PIDs. |
| Retry | A failed open cleans stale runtime state, clears renderer state, and a later click starts a new operation. |

## Tests

Add focused contract tests before implementation for:

- Redis configuration parsing, including comments, quoted values, invalid ports,
  and optional passwords;
- private path and command-line construction, including loopback-only binding,
  no saved panel configuration, and no data logging;
- first-install notification, PID/port persistence, health-based reuse,
  duplicate open coalescing, stale-process cleanup, and stop cleanup;
- Redis module delegation and companion-first shutdown; and
- renderer controller ownership, progress retention, terminal cleanup, page
  re-entry, and the absence of Redis secret/config parsing in renderer sources.

Update `scripts/renderer-operation-boundaries-test.ts` to register the Redis
entry page and controller, and add `test:redis-commander` to `package.json`.

## Error Handling

Missing Node, npm, Redis configuration, package entry, free loopback port, or
panel health are terminal failures. Errors are surfaced to the user through the
existing UI error mechanism. The fork removes only companion state that it owns;
it never stops a process merely because a stale PID file exists.
