# Startup Hosts Synchronization Design

## Goal

Ensure saved local-site domains are synchronized to the system hosts file once
FlyEnv has initialized, even when Startup Groups is the initial page and the
Site module is hidden.

## Semantics

- The Site module visibility setting controls only the sidebar entry. It does
  not disable saved sites, their virtual-host configuration, or their domain
  resolution.
- After the renderer has loaded the app configuration and the complete site
  list, it synchronizes the FlyEnv-managed hosts block once per application
  start.
- The startup synchronization uses the existing `setup.hosts.write` and IPv6
  settings. Therefore a disabled hosts-writing setting removes the
  FlyEnv-managed block, preserving current behavior.
- Showing or hiding the Site module does not write the system hosts file.
  Repeated visibility changes consequently cause no duplicate writes.
- Normal site mutations and hosts/IPv6 setting changes retain their existing
  synchronization paths.
- Application shutdown continues to remove the FlyEnv-managed hosts block.

## Implementation Boundary

- Move the startup synchronization responsibility to the renderer root
  initialization flow, immediately after `AppStore.initHost()` completes.
- Remove the Site page mount-time `hostsWrite(false)` call. The Site page must
  no longer be needed for system hosts synchronization.
- Keep the Site page's initial `initHost()` fallback so the page can still
  populate a missing renderer-side list without changing system state.

## Error Handling

- Reuse the existing `handleWriteHosts()` path so elevation, platform-specific
  hosts locations, IPv6 handling, and DNS refresh remain centralized.
- A hosts synchronization failure must not prevent the rest of renderer
  initialization or Startup Group operations from loading.

## Regression Coverage

- Assert root startup waits for the site-list load and then invokes the shared
  hosts synchronization helper.
- Assert the Site page no longer writes hosts during `onMounted`.
- Assert no visibility watcher is introduced for `showItem.hosts`.
