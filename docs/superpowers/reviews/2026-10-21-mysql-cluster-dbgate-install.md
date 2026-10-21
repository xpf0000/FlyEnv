# MySQL Cluster 0.1.13 DbGate installation and hidden Node runtime

## Findings and fix

The user reported a missing entry script using Node24.14.0. Their private panel directory contained a valid manifest and credentials/workspace but no node_modules. An isolated fresh install using the same Node/npm and configured mirror failed with ETARGET: mirror DbGate7.3.1 requests unpublished dbgate-mysql-dumper@7.3.1, while the published dumper versions are 0.1.x. Registry metadata was checked against the upstream npm registry. Upstream7.3.2 uses ^0.1.2 but was not yet available from the configured mirror. The exact original missing-entry message was not reproduced; shared spawnPromise also treats signal/null exit as success and the missing-entry check discards npm output.

The plugin now supplies the public DbGateRuntime installer option. It extends the existing PostgreSQL dumper override with published MySQL dumper0.1.3, forces a real local installation, uses selected Node/npm, waits for close and strictly distinguishes code0 from signal/nonzero exit. Errors retain npm output or the missing entry path. It preserves credentials/workspace and unrelated manifest dependencies/overrides; there is no global installation, fallback registry or automatic retry. A failed install prevents process start.

Actual installation exposed a second npm issue in aliased temporary roots: prefix /var versus child cwd /private/var causes npm to ignore overrides. Canonical cwd/prefix fixed it; actual npm logs then resolve MySQL dumper0.1.3 and complete successfully. Regression failed before canonicalization and passed afterward.

DbGate's singleton now owns asynchronous Node discovery and deduplicates clicks through discovery and panel opening. Cold hidden Node inventory is fetched through the existing module API. It reads the existing selected descriptor, falls back to an enabled installed runtime if stale, and never changes module visibility or selected configuration. Parent availability is rechecked after discovery. The button is enabled for running instances even before Node inventory loads; truly missing runtimes produce a public message.

Actual package health passed, but reopening initially restarted it. A minimal real Node server with the same default IPv6 wildcard reproduced the changed PID; the earlier IPv4-only fixture missed it. The plugin now supplies the public listeningPids option with an exact-port IPv4/IPv6 listener query. Existing runtime private identity and authenticated health remain required; this does not authorize stopping other listeners. Windows keeps its established strict query. Query errors propagate, with only lsof exit1/empty output meaning no match. The native IPv6 test now reuses the same PID.

Ownership remains the existing singleton/Fork adapter/shared runtime. Every added failure is local to the required install/discovery/listener prerequisite; completed independent MySQL operations remain unchanged. No host src/scripts, shared config/state, prototypes or service start/stop owner changed.

## Verification

- Full suite: 193 tests, 191 passed, two opt-in native skips, zero failures (`/tmp/mc-dbgate-fix-suite-verified.log`). New tests cover published overrides, private-file preservation, canonical prefix, real child close/nonzero/signal/missing-entry output, discovery deduplication, failure/retry, stopped parent, hidden module and stale selection without configuration writes.
- Native IPv6 fixture RED then GREEN: actual runtime/process start/health/reuse/last-parent stop passed (`/tmp/mc-dbgate-ipv6-{red,green}.log`).
- Actual fresh DbGate installation using user Node24.14.0 and existing configured mirror passed, then real authenticated health, same-PID reopening, private identity, final-parent stop and stopped-parent rejection passed in64.77s (`/tmp/mc-dbgate-fresh-native-final.log`). Only isolated temporary data/processes were used; no user database process, panel credential or workspace was altered. Temporary processes/files were cleaned up.
- ESLint zero errors/three existing copied-help warnings; renderer boundaries passed. vue-tsc with sufficient heap produced output byte-identical to the existing53-diagnostic baseline (`/tmp/mc-dbgate-fix-types-final2.log`); an initial low-heap run exhausted memory, and the new native test's ForkPromise/Promise assertion type was corrected before this final run.
- Production build, 7z integrity, extracted manifest and registry SHA passed. Package `dist/plugins/mysql-cluster/mysql-cluster-0.1.13.flyenv-plugin`:1,653,467 bytes; SHA-256 `0f509b4229cc7a7269385ec41cbee825a7adc41522bac2332573447b3ed41a2d`.
- Host src/scripts remain byte-identical to619d7c8d. No upload, push, release or activation. Windows/Linux native lifecycle remains unverified.
