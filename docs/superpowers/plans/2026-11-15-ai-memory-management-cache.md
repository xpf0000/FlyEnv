# AI Memory management cache

Goal: returning to memory management uses the loaded data; the toolbar offers explicit refresh.

Implementation and operation contract:
- Reuse MemoryController/MemoryManager singleton. Cache complete successful universe results by immutable target, search filters and query mode, bounded to 12 entries. Cache successful project listing, including an empty listing. No disk copy, new Pinia or shared config; no lifecycle or process changes and no exception required.
- Existing request owner retains progress, terminal cleanup, latest-request ordering and duplicate-flight guard across page destruction. Page inputs/dialogs remain view state. Manual refresh bypasses the cache and reloads project mapping before the selected scope; concurrent identical searches share the request.
- Writes, deletion (including partial cleanup), unknown writes, restore and project relink invalidate cached queries in the singleton, preventing late pre-change results from restoring old data. A refresh failure reports its own error and preserves same-query display data, never showing a different scope's data or replaying a write. Project list and memory queries have independent results; only a complete project list may reset a missing selection.

Steps:
- [x] Add focused cache reuse, scope/query isolation, explicit refresh, empty-data, invalidation and stale-response tests; observe failure.
- [x] Add controller cache, invalidation and cached project reads; wire restore invalidation.
- [x] Bind cached entry/tab navigation and icon refresh in Index.vue, retaining the established toolbar style.
- [x] Run controller/maintenance tests, scoped type check, ESLint, renderer boundary check; verify the real toolbar in isolated QA. Sync task files to the existing preview worktree, preserving other changes.

Validation: 216 plugin tests (46 focused controller/maintenance tests), scoped types, ESLint, renderer boundaries, plugin build/contract and diff check passed. Independent review: no findings. Isolated native module/tab round trips retained listProjects=1/universe=1; an external write remained invisible until explicit refresh, which updated 1 to 2 memories and read counts to 2 each. A following identical Search used the cache. QA closed; no real user data/config changed. Evidence: tmp/memory-management-cache-20261115. Maintenance checks explicitly request fresh project paths.
