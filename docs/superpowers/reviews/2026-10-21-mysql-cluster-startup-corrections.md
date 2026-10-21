# MySQL Cluster 0.1.10 startup corrections

## Delivered behavior

- Ordinary start/stop/restart no longer opens the administrator credential dialog, requires group credentials, reruns replication configuration, authenticates to MySQL, or probes TCP for readiness. Real instances still use public ModuleInstalledItem lifecycle. Fork reuses serviceStartSpawn and exact executable/config/PID discovery; only initial root-password application waits for this startup's completion log before removing its private init-file.
- First creation still applies the requested root password and configures the chosen replication mode. Ordinary GTID restart resumes MySQL's stored channels through version-compatible startup arguments, with replica read-only protection. Ready GR members start read-only; their explicit Configure / recover replication action preserves the existing all-member history comparison and safe bootstrap policy. Root credentials remain session-only unless explicitly remembered.
- Group/member name validation runs in the form and serialized catalog mutation before side effects. Trimmed, case-insensitive duplicates fail; edits exclude their own identities. Cluster and member namespaces are separate, allowing a standalone group/member to share its name. Legacy catalogs and exact interrupted-preparation retries remain readable/recoverable.
- User explicitly chose host zero changes and deferred startup-group multi-selection. No patch was applied to src/scripts; the existing single-selection policy remains.

## Review corrections

1. GR startup with replication disabled must not expose writable offline members. Added ready-stage read_only/super_read_only process arguments; initial root setup remains writable. Explicit account provisioning snapshots protection, temporarily relaxes only super_read_only for administrator DDL, and restores it even on failed CREATE/GRANT. Restore errors remain required failures with original context. Existing partial CREATE/GRANT retry remains supported.
2. A manually pending SQL status request must not hold the process refresh flight and block lifecycle. Process refresh and explicit status observation now have independent controller-owned flights. Status requests capture credentials/PID and cannot overwrite a newer stopped/restarted process. Regression reproduced the blocking behavior before the fix.
3. Failed startup cleanup must not silently report cleanup success or delete an unread init-file needed by a still-running initial process. Cleanup failure now propagates; unread private init-file is retained only when stop cannot be confirmed.

Independent final review found no remaining Critical/Important findings. These changes do not add shared configuration, a Pinia store, module-specific host properties, or prototype patches.

## Verification

- `node --import tsx --test plugins/mysql-cluster/tests/*.test.ts`: 157 tests, 156 passed, one native default skip, zero failures. Covers credential-free lifecycle through the real renderer manager and ModuleInstalledItem structured-clone boundary in GTID/GR, stale credentials, independent SQL observation, explicit recovery, concurrent duplicate-name mutation, failed cleanup/protection restoration, and process startup errors. Log: `/tmp/mc-credentials-tests.log`.
- Native Homebrew MySQL 9.6.0 macOS arm64 acceptance passed in 138.52 seconds: initial complex root password, standalone restart with absent/incorrect credentials, persisted GTID channel resume without credentials, replica protection, source port change and explicit reconfiguration, GR election, restarted offline member write rejection, full-stop read-only protection and explicit recovery, data management and backup. Native fixture's temporary processes/data were cleaned. Log: `/tmp/mc-credentials-native-final.log`.
- ESLint: zero errors, three existing copied-help v-html warnings. Renderer operation boundary check passed. vue-tsc still exits with the same 53 baseline diagnostics; output is byte-identical to `/tmp/mc-baseline-types.log`, no new diagnostics. Logs: `/tmp/mc-credentials-{lint,boundaries,types-final}.log`.
- Plugin build passed; extracted 7z archive manifest and registry match version 0.1.10, packaged Fork loads and exposes required methods, checksum matches. Package: `dist/plugins/mysql-cluster/mysql-cluster-0.1.10.flyenv-plugin`, 1,643,695 bytes, SHA-256 `77ad7195ae017e9a79d0f8bcca8ddcc99bbd9767c92644138b9a145f2c5128dc`.
- `git diff 619d7c8d -- src scripts` remains empty. No plugin activation, user-service operation, upload, publication, or push. Windows/Linux and other MySQL versions were not rerun natively for this correction.
