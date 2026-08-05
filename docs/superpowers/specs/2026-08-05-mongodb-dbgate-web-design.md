# MongoDB DbGate Web Integration Design

## Goal

Add a Web management entry for MongoDB by integrating the DbGate Community Web
package. The integration should use FlyEnv's selected Node.js version, persist
DbGate's own workspace under FlyEnv, and behave like a shared companion service
whose current lifecycle owner is MongoDB.

## Decisions

- Use `dbgate-serve@7.2.4`, which bundles the MongoDB plugin.
- Install the package locally under `global.Server.BaseDir/dbgate`; do not use a
  global npm install and do not require Docker.
- Use the Node.js version selected in FlyEnv's Node module. The MongoDB Web
  button is unavailable until a usable Node.js binary is selected.
- Store DbGate runtime data, connections, settings, logs, PID, and port state
  beneath `global.Server.BaseDir/dbgate`.
- Set DbGate `WORKSPACE_DIR` to the FlyEnv DbGate workspace. Do not set
  `CONNECTIONS`, so DbGate opens an empty workspace and users can create and
  save their own MongoDB connections and credentials.
- Enable DbGate `BASIC_AUTH` with a FlyEnv-generated credential pair. The pair
  is stored in a private file below `BaseDir/dbgate` and is never presented as
  a user setting.
- MongoDB owns the companion lifecycle for this first integration. Stopping
  MongoDB stops DbGate first and returns both process groups in
  `APP-Service-Stop-PID`.
- Future database modules may reuse the running shared DbGate instance, but
  their lifecycle ownership rules are outside this scope.

## Architecture

### Shared DbGate runtime

Add a shared DbGate helper module under the fork-side database tooling boundary,
separate from `Mongodb/index.ts`, for constants, paths, package installation,
port selection, command ownership, health checks, and stop verification. The
MongoDB module coordinates that helper but does not encode a MongoDB-specific
installation directory.

The expected directory layout is:

```text
$SERVER_BASE_DIR/dbgate/
├── node_modules/
├── package.json
├── workspace/
├── dbgate.pid
├── dbgate.port
└── log/
```

The exact npm metadata files may vary by npm version, but all generated files
must remain below this directory.

### Installation and startup

On the first Web-entry request:

1. Validate the selected Node.js binary and its supported version.
2. Create the DbGate directory structure.
3. Install `dbgate-serve@7.2.4` locally with the selected Node.js runtime if
   its package entry is absent.
4. Choose an available loopback port, pass it through `PORT`, and start the
   DbGate entry script with `serviceStartSpawn`.
5. Set `WORKSPACE_DIR` to the local workspace and disable shell connections and
   shell scripting for the embedded local tool.
6. Wait for both the expected listener PID and an HTTP response before writing
   `dbgate.port` and returning the URL.

The launch command must invoke the installed package through the selected Node
binary rather than relying on a shell-resolved global `dbgate-serve` command.

### Connection and authentication model

DbGate is started without `CONNECTIONS` environment variables. It therefore
starts with no preconfigured connection and persists user-created connection
records in its FlyEnv workspace. MongoDB usernames, passwords, auth sources,
TLS options, and saved credentials remain DbGate concerns.

DbGate is started with `BASIC_AUTH=1`, a fixed non-sensitive login name such as
`flyenv`, and a cryptographically random password generated once per local
installation. The credentials are stored in a private file below
`BaseDir/dbgate` with user-only permissions. They are not MongoDB credentials
and are not exposed in FlyEnv settings.

The returned browser URL contains URL-encoded Basic Auth user information so a
normal external browser can authenticate without showing a login prompt. The
open request and response use the renderer's sensitive IPC path; credentials
must not appear in IPC debug logs, error messages, or normal FlyEnv state.

The DbGate npm server still binds using its own `server.listen(port)` call. The
Basic Auth layer therefore remains mandatory even if a future release adds a
loopback bind option. The URL is always generated with `127.0.0.1`; this
integration does not advertise DbGate as a remote administration service.

## Lifecycle

### Reuse

Each click runs a single-flight open operation. It reuses DbGate when:

- the persisted PID belongs to the FlyEnv-installed DbGate entry script;
- the persisted port is valid and is owned by that PID; and
- `http://127.0.0.1:PORT` responds successfully.

If any condition fails, stale PID/port files are removed, owned stale
processes are stopped, and a new instance is started. Concurrent clicks share
one in-flight operation and cannot create duplicate instances.

### Stop

MongoDB's stop path invokes the DbGate stop helper before stopping `mongod`.
The helper only kills processes whose command line belongs to the FlyEnv
`dbgate` installation, removes its PID/port files, and returns all stopped
PIDs. MongoDB merges those PIDs with its own stop result.

### Failures

Installation failures, unsupported Node versions, port exhaustion, process
ownership mismatches, and health-check failures reject the open operation,
leave diagnostic logs in `BaseDir/dbgate/log`, remove partial PID/port state,
and do not change MongoDB's running state.

## Renderer integration

Extend `src/render/components/MongoDB/Index.vue` using the ClickHouse HTTP
entry pattern:

- show the icon only while MongoDB is running;
- disable it while opening or while no Node.js version is selected;
- send the running MongoDB version and selected Node version over the existing
  `app-fork:mongodb` IPC channel;
- open the returned loopback URL with `shell.openExternal`; and
- show a localized or existing FlyEnv error message when startup fails.

The renderer must not receive or serialize DbGate credentials. The DbGate UI
owns all connection credential input.

## Verification

Add focused contract tests for:

- DbGate path derivation under `Server.BaseDir` on Unix and Windows;
- package entry and selected-Node install command construction;
- workspace and environment generation without `CONNECTIONS`;
- port selection, persisted-port reuse, health checks, and retry behavior;
- command-line ownership and stale PID rejection;
- concurrent open single-flight behavior;
- MongoDB stop ordering and PID merging; and
- renderer IPC payload and returned URL handling.

Run the focused contract tests, existing stop-process and service-web-panel
tests, ESLint, Prettier, and `git diff --check` before completion.

## Scope exclusions

- No automatic FlyEnv MongoDB connection is created in DbGate.
- No DbGate account, cloud sync, or premium storage database is configured.
- No Docker integration is added.
- No PostgreSQL, MySQL, or ClickHouse renderer entries are added in this
  iteration; only the shared runtime boundary is prepared for reuse.

## Distribution and security review

`dbgate-serve` is published under GPL-3.0. FlyEnv will not bundle DbGate or
place it in the application package. The package is downloaded from npm only
after the user explicitly opens the MongoDB Web entry, and is stored under
`Server.BaseDir/dbgate`; users who never open the entry receive no DbGate
files.

The implementation must still expose the exact DbGate version, license, and
source URL in `docs/third-party-licenses.md`. It must not
modify or merge DbGate code into FlyEnv's main or renderer bundles. Release
checks should verify that the production application artifacts do not contain
the DbGate package and that the on-demand installer preserves npm package
license metadata.
