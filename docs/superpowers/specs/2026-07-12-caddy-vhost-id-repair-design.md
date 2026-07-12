# Caddy Vhost ID Repair Design

## Problem

The one-time vhost migration creates ID-based files and removes name-based files. Caddy's startup repair path still checks and writes `${host.name}.conf`, so starting Caddy recreates the legacy file after the migration marker has already been written. Caddy then imports both files and rejects the duplicate site definition.

## Design

Keep `makeCaddyConf()` as the canonical Caddy vhost generator. Before Caddy starts, load the PHP hosts and, for each host:

1. Check the ID-based `${host.id}.conf` path.
2. Call `makeCaddyConf(host)` only when that file is missing.
3. After the ID file is available, remove the exact legacy `${host.name}.conf` and `${host.name}.caddy.log` paths.
4. Guard against deleting the ID path if a host name happens to equal its ID.

This startup repair is intentionally safe to run repeatedly. It also repairs installations whose `.id-migrated` marker already exists.

## Scope

- Modify only the Caddy startup repair path.
- Do not rerun or broaden the global one-time migration.
- Do not delete arbitrary non-ID files; only delete legacy paths derived from known hosts.
- Leave Nginx, Apache, and FrankenPHP unchanged.

## Verification

Add a regression script that checks the Caddy startup path uses the shared ID-based generator, cleans the two legacy paths, and no longer contains the old name-based generator. Run the regression script and ESLint on the changed TypeScript files.
