# PostgreSQL pgAdmin Companion Stop Design

## Goal

Stopping a PostgreSQL service also stops every pgAdmin 4 process launched from that PostgreSQL module, and reports those process IDs through the normal service-stop result.

## Observed Root Cause

`Postgresql._stopServer()` already calls `_stopPGAdmin()` before stopping PostgreSQL. pgAdmin ownership detection, however, requires the command's first executable to equal `pgadmin4/venv/bin/python`.

On macOS, a virtual environment's Python launcher is a symlink. The process list reports its resolved interpreter path, for example `/opt/local/.../Python`, followed by FlyEnv's `pgadmin4/venv/lib/python3.13/site-packages/pgadmin4/pgAdmin4.py`. Those processes are therefore not recognized or stopped.

## Decision

Identify pgAdmin by its canonical `pgAdmin4.py` script path inside FlyEnv's private pgAdmin virtual environment, rather than by the interpreter executable path. The script path is unique to FlyEnv's PostgreSQL module and remains stable when Python symlinks are resolved.

`pgAdminCommandOwned()` will match the exact `pgAdmin4.py` path below the resolved package root. `pgAdminCommandOwnedWithoutPackageMetadata()` will match the canonical script path below `paths.venv/lib/python*/site-packages/pgadmin4/` when package metadata cannot be read. Both forms preserve quoted command-line argument support and reject other scripts.

The existing `_stopPGAdmin()` lifecycle remains the only stop implementation: collect all owned PIDs, signal them through `stopPgAdminPidsWithVerification`, remove pgAdmin's PID and port state, then return the stopped IDs. `_stopServer()` continues calling it before PostgreSQL shutdown and merges those IDs into `APP-Service-Stop-PID`, matching ClickHouse's companion UI lifecycle.

## Error Handling

If an owned pgAdmin process does not exit after the existing strict stop verification, PostgreSQL stop fails rather than silently reporting success. Unrelated Python processes and pgAdmin scripts outside FlyEnv's private virtual environment are never selected.

## Verification

The focused pgAdmin contract test will prove that resolved/symlinked interpreters running the exact FlyEnv script are owned, while an unrelated script is rejected. It will also retain source-level coverage that PostgreSQL stops pgAdmin before database shutdown and includes its PIDs in the service-stop response.
