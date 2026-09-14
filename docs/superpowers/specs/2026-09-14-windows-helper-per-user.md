# Windows Helper Per-User Instance Design

## Goal

Make the privileged Windows helper a complete SID-scoped instance so a FlyEnv user never installs, repairs, starts, stops, or rewrites another user's helper resources.

## Accepted product decisions

- A SID owns one helper instance containing its binary, task, process, pipe, key, instance metadata, and allowed roots.
- The running FlyEnv version is authoritative. A helper version mismatch replaces the binary in that SID's fixed instance path.
- No old helper version is retained and no binary rollback is attempted. A failed install remains failed and is retried through the existing install lifecycle.
- FlyEnv is single-instance for a user. The existing `AppHelper` single-flight/re-entry guard is the operation guard; no additional install mutex is added.
- Binary provenance is outside this task. Keep the accepted SHA-256 comparison among the packaged source/backup, pending copy, and installed copy.

## Instance identity and layout

`instanceId` is the first 32 lowercase hexadecimal characters of SHA-256 over the canonical SID string. The full SID remains authoritative and is stored and checked so a truncated-hash collision fails closed.

```text
%ProgramData%\FlyEnv\Helper\users\<instanceId>\
├─ bin\flyenv-helper.exe
├─ instance.json
├─ helper.key
└─ allowed-roots
```

The instance directory, executable, key, metadata, and allowed-roots file are owned by SYSTEM or Administrators. SYSTEM and Administrators have full control. The target SID has only the read/execute rights required to connect and authenticate. Other users have no access.

The Task Scheduler identity is:

```text
Task:      \FlyEnv\Helper\<instanceId>
Principal: SYSTEM / ServiceAccount / Highest
Trigger:   logon of the full target SID
Action:    <instance root>\bin\flyenv-helper.exe
Arguments: --instance-id <instanceId> --expected-user-sid <full SID>
```

The Windows named pipe is `\\.\pipe\FlyEnv.Helper.<instanceId>`. Its DACL permits SYSTEM and the full target SID. The existing OS-derived peer SID, PID/executable binding, HMAC, timestamp, nonce, and operation/path allowlists remain required.

## Installation and repair

The main-process `AppHelper` singleton owns check/install/repair. It captures the target identity before UAC and passes an encoded configuration to the elevated installer. The renderer only observes the existing status events.

The elevated installer validates `instanceId == SHA256(target SID)[:32]`, validates all paths against the canonical ProgramData instance root, prepares the source binary in a `.pending` file, verifies SHA-256, stops only the current instance task, and atomically replaces the fixed instance executable. It then writes the per-instance key, allowed roots, and `instance.json`, registers the task, starts it, and reports success only after task configuration is valid. A later main-process health check verifies the SID, instance ID, protocol, task, pipe, and binary fingerprint.

Existing root tasks named `FlyEnvHelperTask` or `flyenv-helper` are legacy resources. A new SID-scoped task does not need to delete them. Automatic cleanup may remove a legacy task only when its configured target SID is the current SID; ambiguous or other-user tasks are left untouched.

## Operation contract

- **Owner:** existing main-process `AppHelper` singleton.
- **Lifetime:** FlyEnv application for orchestration; Task Scheduler owns the SYSTEM process beyond page lifetimes.
- **Start:** startup health check or explicit helper installation request.
- **Intermediate events:** existing `needInstall`, `installing`, and `installed` states.
- **Terminal events:** existing `checkSuccess` or `installFaild` with a typed helper error.
- **Duplicate invocation:** existing main-process single-flight rejects/reuses duplicate checks and installs.
- **Service interaction:** the helper continues to execute privileged module requests; fork modules remain the source of truth for managed child processes and services.
- **Persistence:** helper infrastructure is stored under the protected per-SID ProgramData instance. No renderer Pinia state and no `config.setup` data are added.

## Acceptance

- Alice and Bob receive different instance IDs, paths, tasks, pipes, keys, policies, and processes.
- Installing or repairing Alice never stops, replaces, deletes, or rewrites Bob's instance.
- A standard user can approve UAC with a separate administrator account while all helper authorization remains bound to the original target SID.
- A helper version mismatch replaces only the current SID's fixed executable and restarts only its task.
- The same-user UAC flow remains functional.
- A production package build and a real two-account Windows test cover task startup, concurrent sessions, logout/login, repair, and version replacement.
