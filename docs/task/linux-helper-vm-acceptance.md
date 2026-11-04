# Linux helper VM acceptance

The user authorized native Linux acceptance on the running VM on 2026-10-25.
Target: Parallels Debian GNU/Linux 12 ARM64, systemd 252, ordinary account
`parallels` UID/GID 1000. `/tmp` is ext4; `/run` and `/dev/shm` are tmpfs.
Initial inspection found no installed FlyEnv helper binary, unit, policy or runtime
directory. This supersedes the previous audit's unavailable-Linux limitation.

## Contract and plan

Use the current source and a HEAD/protocol-48 baseline as temporary VM fixtures.
The native helper/installer owns installation and real systemd exit/ready state;
ordinary clients must pass actual Unix peer credentials and HMAC authentication.
Run required failures as failures, preserve individual results, and always restore
the VM's initial helper state after collecting diagnostics. No Mac helper,
existing user services, hosts, CA trust or application databases are test targets.

- [x] Run compiled Linux test suites under root and ordinary UID, including the
  separate-tmpfs socket regression and filesystem replacement fixtures.
- [x] Reproduce the baseline directory-permission rejection and verify current
  actual installation/upgrade with user-owned/writable/default-ACL directories.
- [x] Verify real systemd start/restart/stop, authenticated ordinary health/RPC,
  socket ownership/privacy, unchanged existing directory metadata and cleanup.
- [x] Run native Pure-FTPd start/login/upload/account-refresh/stop acceptance
  with extracted package fixtures rather than installing a distribution daemon.
- [x] Capture results and restore the VM's original uninstalled helper state.

## Native results

- Six test runs passed: main/module/utils under both root and UID 1000, totaling
  170 top-level passing executions and 26 platform/identity/opt-in skips. The
  root main suite explicitly enabled the real helper/systemd/FTP fixtures.
- The HEAD protocol-48 baseline installed successfully and answered an ordinary
  signed version request. After changing `/etc/flyenv-helper` to `1000:1000`,
  mode `0777`, with an inheritable `nobody:rwx` ACL, its actual installer failed
  with `Unprotected install directory: /etc/flyenv-helper`.
- The current actual installer upgraded that same installation to protocol 49.
  Directory UID/GID, mode and complete ACL were identical before/after. Signed
  version and health RPC passed; systemd restarts also passed with existing
  policy directories set to `0700`, `0775` and `0777`.
- A transient root unit without systemd's `RuntimeDirectory` normalization
  started with an existing user-owned runtime directory under each of those
  three modes and an inheritable ACL. Directory metadata stayed unchanged;
  published sockets were `1000:1000 0600`, connectable, and had no staging
  residue. Both actual `/run` tmpfs publication and the `/dev/shm` regression
  passed while `/tmp` was ext4.
- Authorized UID 1000 read the key and authenticated. An unauthorized UID could
  not read the key; UID 1000 could not write it; a root client was rejected by
  peer authorization. These are file/client checks, independent of directory
  metadata.
- Debian's extracted Pure-FTPd 1.0.50 package binaries exercised real high-port
  and port-21 startup, ordinary-user login/upload, account refresh/delete,
  duplicate-start rejection and cgroup shutdown including an active session.
  The root FTP fixture passed in 21.21 seconds. The service credential fixture
  passed with UID/GID 1000, the complete system group set, only the intended
  effective/ambient low-port capability, and `NoNewPrivs=1`.

Two initial failures were test assumptions, not production changes: the guest
shell uses umask `0077`, so test executables need explicit execute permissions
and the socket test must compare original metadata rather than assume `0644`;
supplementary groups must be compared as the complete unordered account group
set rather than require `1000` first. Both failures were reproduced, fixtures
corrected, all suites rerun, and the test-only changes independently reviewed.
Native macOS Go tests also pass after the fixture changes.

For the custom transient unit, SIGTERM can leave a stale socket pathname because
the helper has no signal cleanup handler. Acceptance checks actual process exit,
connection refusal and successful stale-socket replacement on subsequent start.
The normal installed unit removes its runtime directory on stop. This run does
not introduce new shutdown behavior.

Final inspection found no helper binary, policy/runtime directory, installed or
transient FlyEnv unit, test process or `/opt` fixture. Only the preexisting CUPS
listener remained. The VM stays running; host-installed helper, hosts, CA trust
and user databases were not changed. Guest test fixtures were removed after
exporting logs.

Evidence is retained locally under
`release/linux-helper-vm-20261025-000023-1306c8/`: `evidence/logs/` contains native
test, installation and restored/final state summaries; `evidence/initial-state.json`
records the initial state. Console logs, actual
acceptance scripts, binary SHA-256 manifests and `vm-evidence.tar.gz` are also
retained. This ignored directory is not a release artifact or a committed test
dependency. The VM is ARM64; x86-64 execution, the packaged Electron UI, GUI
privilege prompts and a newly signed macOS release remain outside this run.
