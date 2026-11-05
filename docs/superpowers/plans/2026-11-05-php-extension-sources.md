# Windows PHP extension sources implementation plan

> **For agentic workers:** Use the approved conversation design; implement with focused tests and review.

**Goal:** Discover official PECL extensions without a per-package allowlist, keep PIE publishers independent, and prepare explicit compatible versions before installation.

**Architecture:** Fork-owned PECL repository reads the official REST catalog/releases and Windows archive; existing PHP installer owns all writes and child processes. Existing reactiveBind controller owns catalog, preparation, install IPC and terminal cleanup; Vue owns dialogs and version selection.

**Tech Stack:** TypeScript, existing fast-xml-parser/axios, Vue/Element Plus, existing script tests.

**Spec:** User-approved six-part proposal in this conversation (2026-11-05).

## Constraints and operation contract

- No exception authorization needed: no Pinia, shared configuration, generic service types, or new service lifecycle. Cache is module-local memory, expires and can explicitly refresh.
- Catalog/preparation: controller owns immutable PHP snapshot, duplicate guard, progress/error and listener settlement across page unmount. Fork owns HTTP and profile validation. Partial source failure preserves the independent source. Source query errors never mean incompatible.
- Install: controller owns guard/notices/progress until terminal; fork rechecks PHP and selected release, serializes php.ini writes, owns PIE child cleanup. No cross-source retry after process/file mutation. Refresh/notice failure cannot undo success. Missing dependency/loading failure remains visible; preserve backups and report partial/unknown results.
- Required dependencies: profile, identity, exact selected version, compatible archive, file/ini writes and load validation. Discovery failures affect only their source/candidate; preserve valid siblings and diagnostics. Supplementary UI refresh cannot fail the installation.
- PECL package identities use `pecl:<official-name>`; existing PIE names remain vendor/package. Existing publisher mappings may deduplicate known identities only; unknown publishers remain separate.
- Preparation returns `ExtensionPreparation {name, source, homepage, profile, releases:[{version, compatible, url?, error?}], command?, extension?, zend?}`. PIE compatible is unknown (null) until PIE validates it. PECL only stable numeric versions (including two-part versions), no automatic older-version selection. Authoritative selected-release package XML determines module name and Zend mode.
- IPC adds windowsExtensionPrepare(version,name,selected?), catalog refresh optional bool, install optional exact release. Only the latest/selected release's archive is queried; historical releases are checked when selected. Controller prepare()/install() retain lifecycle outside the page.
- Ruling: work in current clean checkout, no worktree/commit/push requested; task scope is local implementation and verification. User approved the design and explicitly requested implementation; do not add another approval gate.

## Tasks

- [x] Repository: tests first for catalog discovery, official names, stable versions, exact-version ABI matching, cache/refresh and independent failures; implement PeclRepository and source types.
- [x] Installer: combine catalog sources, deduplicate only verified mappings, expose preparation, pin selection and revalidate before mutation; keep existing rollback/PIE behavior, add actionable source/command diagnostics.
- [x] Renderer: source-aware rows, controller preparation lifecycle, version dialog with explicit incompatible/unknown statuses, operation links/commands, translations; test duplicate/page-reentry/failure.
- [x] Verification: existing Windows/loaded-extension/boundary suites, new source regression suite, lint/component/build checks and read-only real official catalog probes; isolated real PHP installation where available. Review failure boundaries and whole diff, record limitations.

## Review focus

Unknown publishers never borrow a same-name PECL binary; latest-incompatible does not silently downgrade; failed lookup never caches unsupported; special version formats stay valid; no install repeats after partial writes or supplementary refresh failure.

## Verification results

- New regression scripts `php-extension-sources-test.ts` and `php-extension-sources-controller-test.ts` pass. Observed RED before implementing repository/catalog preparation, metadata load type, and dependency diagnostics; regressions cover invalid candidate isolation, exact version/ABI, metadata failure retry, unknown publishers, independent source failure, prep races/synchronous failure, forced-refresh coalescing, guards and operation snapshots.
- Existing `php-windows-extensions-test.ts`, `php-loaded-extensions-test.ts`, `renderer-operation-boundaries-test.ts` pass; scoped ESLint and diff whitespace checks pass.
- Vue template/script/SCSS compilation and full fork dependency-graph esbuild build pass (145 in-memory outputs, no production artifacts overwritten).
- Live official source discovery matches PHP 8.4 TS VS17 x64: PDO_OCI 1.2.0, solr 2.9.3, timezonedb 2026.6, including authoritative package load metadata.
- Isolated real PHP 8.4.27 live test passes after metadata refactor: Redis install/reinstall replacing an old full-path directive; Xdebug installation/defaults and disable. Uses temporary PHP copies, cleans temporary directories, does not modify the user's installed runtime.
- Independent final backend/renderer review found no concrete blockers.
- Limits: no full Electron browser interaction test, no Oracle client/server integration, no release packaging or publishing. PDO_OCI/solr evidence proves official compatible archive discovery, not successful database connectivity. No periodic client operation or scheduled automation was created.
