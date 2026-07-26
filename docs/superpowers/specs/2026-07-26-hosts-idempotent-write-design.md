# Idempotent System Hosts Write Design

## Goal

Avoid privileged system hosts writes when FlyEnv's managed hosts block already
matches the current saved-site mappings, including the case where both the
desired mappings and the managed block are absent.

## Scope

- Applies only to the system hosts file written by `Host._initHost()`.
- Does not change the independently generated `app.hosts.txt` intermediate
  file.
- Does not change normal site mutation, IPv6, hosts-writing-toggle, or DNS
  refresh entry points.

## Behavior

1. Build the desired `#X-HOSTS-BEGIN# ... #X-HOSTS-END#` block from the current
   site list using the existing IPv4/IPv6 and loopback filtering rules.
2. Read the system hosts file and inspect the existing FlyEnv-managed block.
3. Skip `writeFileByRoot()` when either condition is true:
   - The desired block is empty and no existing FlyEnv block is present.
   - The existing FlyEnv block exactly matches the desired block.
4. When the managed block differs, retain the current replacement behavior:
   remove the existing managed block, append the desired block when non-empty,
   then write only if the resulting complete file text differs from the source
   text.
5. Return `true` only after an actual system hosts write. Existing DNS refresh
   logic consequently runs only when a system hosts change was made.

## Non-Goals

- Do not rewrite unrelated system hosts entries merely to normalize whitespace
  or line endings.
- Do not add a cache, hash, or module-visibility condition. The system file is
  the source of truth because users and other tools may edit it externally.
- Do not alter the global disabled-hosts-writing cleanup path.

## Regression Coverage

- A system hosts file with no FlyEnv block and an empty desired block performs
  no privileged write.
- An existing FlyEnv block identical to the desired block performs no
  privileged write.
- Missing, stale, or removable FlyEnv blocks produce one write and report that
  a system change occurred.
