# PostgreSQL pgAdmin 4 Integration Design

## Goal

Add a pgAdmin 4 browser management-panel entry to the PostgreSQL service page. It must follow the ClickHouse CH-UI interaction model while running natively as a local Python service, without creating an HTTP site or requiring Docker.

## Scope

- Show a pgAdmin 4 tool button only while a PostgreSQL version is running.
- Install and run the official `pgadmin4` Python package in a FlyEnv-owned virtual environment.
- Reuse the Python version selected in FlyEnv. Do not download or bundle Python.
- Ask the user once for the initial pgAdmin administrator email and password.
- Register the currently running FlyEnv PostgreSQL instance in pgAdmin without storing its database password.
- Stop pgAdmin 4 when PostgreSQL is stopped.

Out of scope:

- Docker or container integration.
- A FlyEnv UI for upgrading or uninstalling pgAdmin 4.
- Managing multiple simultaneously running PostgreSQL versions from one pgAdmin instance.
- Storing the PostgreSQL password or a pgAdmin administrator password in FlyEnv settings.

## User Experience

1. The user starts PostgreSQL and clicks the management-panel icon in its service toolbar.
2. If no usable FlyEnv Python is selected, FlyEnv reports that Python must be installed or selected and does not start pgAdmin.
3. On the first start, FlyEnv opens a dialog requesting an administrator email and password. The dialog validates both fields before sending them to the fork process.
4. FlyEnv creates or reuses the local pgAdmin installation, starts it on loopback, and opens the returned URL in the default browser.
5. pgAdmin contains one pre-registered connection named `FlyEnv PostgreSQL`, with the active PostgreSQL port and user `root`. The database password is not prefilled.
6. Later opens reuse the installed pgAdmin data and administrator account without showing the setup dialog.

## Architecture

### Renderer

`src/render/components/PostgreSql/Index.vue` will mirror ClickHouse's toolbar action. It obtains the active PostgreSQL version, selected Python binary, and active PostgreSQL data directory, then calls a new `openPGAdmin` action on the PostgreSQL fork module.

A focused dialog component owns the first-run email/password form. It retains credentials only for the active request and clears them when the dialog closes. The renderer does not persist either value.

### Fork Module

`src/fork/module/Postgresql/index.ts` owns the lifecycle because pgAdmin is a companion to the PostgreSQL service. A small `pgAdmin.ts` helper keeps pure values and file content testable:

- pgAdmin package version and default port.
- paths below `global.Server.PostgreSqlDir!/pgadmin4`.
- the generated `config_local.py` content.
- the `servers.json` content for `FlyEnv PostgreSQL`.
- Python version and credential validation helpers.

The module will:

1. Validate the supplied Python binary and supported version.
2. Create an isolated virtual environment in `server/postgresql/pgadmin4/venv` when required.
3. Install a pinned `pgadmin4` package version into that environment using its own `pip`.
4. Write a `config_local.py` next to pgAdmin's installed `config.py`. The config sets `DATA_DIR`, the derived SQLite/session/storage/log locations, loopback host, and the selected port.
5. On first initialization only, run `setup.py setup-db` with `PGADMIN_SETUP_EMAIL` and `PGADMIN_SETUP_PASSWORD` in its short-lived child environment: pgAdmin 9.17's first SQLite migration uses those official environment variables to create the internal `Administrator` without prompting. A FlyEnv-owned bootstrap script then uses pgAdmin's real `create_app` and models to confirm that administrator. If an interrupted initialization is retried with a different email, the bootstrap reads `PGADMIN_SETUP_PASSWORD` only from its own short-lived environment to create that requested Administrator. After importing `servers.json`, the same bootstrap clears the connection password and normalizes `save_password` to `0`, because pgAdmin's importer otherwise leaves that column `NULL` for password-free records. A separate no-secret verifier confirms the exact FlyEnv user-owned connection, including the `Servers` group and `sslmode=prefer`. The administrator password never appears in argv, logs, config, or FlyEnv settings. FlyEnv writes `pgadmin4/initialized` only after that verifier exits successfully; the SQLite file or a CLI exit code alone is never an initialization signal.
6. Generate/import `servers.json` with `Group: "Servers"` and `SSLMode: "prefer"` so the active FlyEnv PostgreSQL port and `root` user are available as a connection without its password.
7. Run pgAdmin as one owned Python process, track its PID, and return the actual loopback URL to the renderer.

pgAdmin data, logs, runtime state, completion marker, and its virtual environment remain inside `server/postgresql/pgadmin4`. User-facing pgAdmin state survives a PostgreSQL restart, while the process itself does not. Requests made while pgAdmin is opening share one underlying startup operation; only the leading request receives startup progress events.

### Ports and Process Ownership

The preferred management port is `5050`; the loopback listener scans `5050` through `5070`. This is distinct from the PostgreSQL port recorded in pgAdmin: pgAdmin 9.17 accepts database registration ports only from `1` through `65534`, so FlyEnv explicitly rejects an active PostgreSQL port of `65535` before creating a virtual environment or starting pgAdmin. The fork module reuses pgAdmin only when its saved PID is an exact FlyEnv virtual-environment Python command running `pgAdmin4.py`, and the saved port is actively listened to by that same PID. The selected-port file is written only after startup succeeds; a probe/start race retries once with a different candidate and leaves no selected-port file if both attempts fail. It never binds an externally reachable address.

The pgAdmin PID file and its selected-port file are separate from PostgreSQL's `postmaster.pid`. PostgreSQL's stop flow stops the owned pgAdmin process and includes its PID in the normal service-stop result, matching CH-UI's companion lifecycle behavior. The selected-port file lets later panel clicks reuse the actual URL when the preferred port was occupied.

## Error Handling

- Missing Python binary or unsupported Python version: fail before creating a virtual environment and direct the user to the Python module.
- Package installation failure: retain the service's standard output/error logs and return the installation error through the existing IPC error channel.
- Invalid first-run email or password: renderer validation blocks the request; fork validation protects direct IPC callers.
- PostgreSQL port `65535`: reject pgAdmin registration with a clear compatibility error; do not silently replace it with PostgreSQL's default port.
- Existing but stale PID: remove the stale PID file and start a new process. When the PID file is missing, scan only commands that strictly match FlyEnv's venv Python plus `pgAdmin4.py` before stopping or recovering a process.
- Port startup failure: select another loopback port once; if the process still cannot start, clear the selected-port file and return its log-backed error instead of opening a browser.
- Incomplete setup: leave the completion marker absent when account or server-state verification fails, so the next panel click requests credentials and safely reruns the idempotent initialization steps.
- PostgreSQL is not running: do not expose the action and reject a direct request with a clear error.

## Security

- Bind exclusively to `127.0.0.1`.
- Do not log or persist the initial pgAdmin password in FlyEnv.
- Do not include a PostgreSQL password in `servers.json`.
- Use a pinned upstream pgAdmin package version rather than an unbounded `latest` install.
- Keep pgAdmin's configuration database, sessions, and storage in a FlyEnv-owned directory with normal user-only permissions.

## Verification

Add `scripts/postgresql-pgadmin4-test.ts` to cover pure helper behavior and static integration seams:

- package version, supported Python version, and loopback URL construction;
- generated `config_local.py` confines all mutable data to the pgAdmin directory;
- generated `servers.json` uses the supplied PostgreSQL port and omits database passwords;
- first-run credentials are consumed only by short-lived `setup-db` and interrupted-initialization bootstrap environments, never by persisted config or long-running service parameters;
- a failed persisted-state verification cannot write the completion marker, while successful verification writes it only after confirming the internal Administrator and password-free FlyEnv PostgreSQL server record;
- PostgreSQL source owns pgAdmin PID cleanup and the renderer exposes the IPC action only for a running PostgreSQL service.

Run this new test together with the existing PostgreSQL, service-panel, and CH-UI regression scripts. Run `git diff --check` before integration.

The opt-in upstream check is `yarn test:postgresql-pgadmin4:integration`. It requires `PGADMIN4_INTEGRATION_PYTHON` to point to an environment with exactly `pgadmin4==9.17`. It creates and removes an isolated temporary pgAdmin root, writes the generated config, server registration, bootstrap, and verifier files, then executes real `setup-db`, normal bootstrap, interrupted-initialization recovery bootstrap, `load-servers`, bootstrap normalization, verifier, and an independent model query. The query checks the Administrator, `Servers` group, loopback PostgreSQL record, `sslmode=prefer`, `save_password=0`, and blank password without putting the generated password in arguments or output.
