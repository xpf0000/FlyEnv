# macOS Helper Hardening Implementation Plan

> For agentic workers: use independent scoped implementation tasks and review the combined change before completion; preserve the approved spec and current user scope.

**Goal:** macOS closes generic root capabilities while retaining explicitly authorized hosts, approved CA, DNS, PID recovery and FTP business operations.

**Architecture:** Reuse Linux business algorithms and Unix ordinary execution paths; platform files contain only macOS policy/ACL/launchd/Keychain differences. Keep the existing RPC transport and service lifecycle; no permission framework or generic action registry.

**Tech Stack:** Go, TypeScript/Electron/Vue, macOS launchd and native system utilities.

**Spec:** [Approved design](macos-helper-hardening-plan.md).

## Global Constraints

- User authorized implementation on 2026-10-06; prioritize simple, centralized logic.
- No `ProcessSend.ts` presentation changes; keep true installation/write/business failures.
- Hosts allows arbitrary domains/IP/full text, fixed target, conflict/no-change handling; DNS is supplementary.
- Retain ordinary service lifecycle; Linux capability path and Windows privilege routing stay separate.
- FTP uses the recommended Linux-compatible user-installed program exception; no new executable/dependency integrity system.
- No saved/admin password injection or background arbitrary sudo; explicit terminal sudo remains.
- No new Pinia/shared config/module lifecycle exceptions; owners and terminal events remain those recorded in spec section 9.
- No real helper installation, hosts/keychain mutation, external publishing or production credentials for development verification.

## Review Focus

- Closed RPC with valid signature must still be denied, including script/file/PID paths.
- Protected policy/key/socket parent, actual UID/PID and read-only key ACL cannot be replaced by caller claims.
- Existing legacy root artifacts, absent CA and signature retry must not cause unauthorized replay or false success.
- Hosts ACL/xattr/conflict and DNS failure must preserve completed writes and unrelated text.
- Persistent FTP sessions, startup failure and stop verification must preserve real PID state; ordinary installed programs remain supported.

## Task 1: Go fixed macOS business boundary

**Files:** `src/helper-go/main.go`, platform Go files, `utils/peer_darwin.go`, contract and focused Go tests; only this task changes Go files.

**Consumes:** Existing TaskItem/Response/HMAC, Linux business structures and approved spec.

**Produces:** Darwin fixed dispatcher; policy/key/CA at `/Library/Application Support/FlyEnv/Helper/`, socket `/private/var/run/flyenv-helper/helper.sock`; install flag `--install-darwin-policy UID:GID DATA_ROOT CA_PATH CA_FINGERPRINT`; existing named hosts/CA/DNS/PID/FTP RPC shapes. Request returns actual result/failure; no legacy dispatcher fallback.

- [x] Exercise rejection and business contracts with focused tests; reproduce boundary failures before implementation where possible.
- [x] Share hosts text/digest/managed-block algorithms and simple FTP schema checks rather than duplicating Linux code.
- [x] Implement root policy/ACL/socket initialization and PID binding, fixed CA/security and DNS calls, PID directory handle repair, fixed FTP foreground launchd ownership and complete stop checks.
- [x] Run native Go tests and Darwin/Linux/Windows compile checks; report platform-dependent coverage limits.

## Task 2: Trusted installation lifecycle

**Files:** `src/main/core/AppHelper.ts`, `static/sh/macOS/flyenv-helper-init.sh`, macOS plist/build packaging if required, scoped installer tests. Do not change Go or other client files.

**Consumes:** Task 1 installation flag and fixed paths/policy format.

**Produces:** Correctly quoted installation command containing CA snapshot/fingerprint, protected verified production snapshot/bootstrap, old-service-stop prerequisite before credentials change, installed new version then health verification. Existing single-flight, cancellation and manual terminal behavior retained.

- [x] Pin stop-failure/quoting/source/production-versus-development behavior in focused installer tests.
- [x] Remove desktop-writable root script/plist execution; use fixed trusted bootstrap and protected publish snapshot.
- [x] Update policy/install invocation and root-owned assets; do not automatically authorize new CA on business failure.
- [x] Verify script syntax/behavior with injected system-tool fixtures and existing install single-flight tests; do not install on host.

## Task 3: Client and module migration

**Files:** shared process/child-process/checker, main file IPC/config/PTY/hosts cleanup, fork Helper/Fn/services/Host/Tool/PHP/RabbitMQ/MacPorts/MySQL/MariaDB/PureFtpd, applicable renderer files/languages and migration tests. Excludes Task 1 Go and Task 2 AppHelper/installer files.

**Consumes:** Task 1 fixed RPC and paths; installed Helper prerequisite stays unavailable until explicitly installed.

**Produces:** One Unix hosts facade and shutdown queue; no macOS generic root file/process/script or saved-sudo-password fallback; ordinary module execution and explicit terminal maintenance.

**MacPorts source maintenance contract:** Existing module gains one local `MacPortsSrc/Controller.ts` singleton bound with `reactiveBind`; no Pinia or shared persistence. It owns immutable source/config previews, preview IPC, duplicate guard, XTerm system authentication, terminal exit result and cleanup across page unmount/remount. Each target write is required; a later failure preserves earlier writes and reports partial completion, without replay. Preview-file cleanup is supplementary. The page owns only its source selection and binds controller state/commands.

- [x] Extend relevant Linux behavioral checks to both Unix platforms without weakening Windows coverage.
- [x] Centralize fixed hosts paths/read/edit/sync/cleanup and close ordering; general files remain ordinary.
- [x] Share ordinary Unix process execution, PHP user config, RabbitMQ/user integration behavior; preserve Linux-only low-port paths.
- [x] Route approved CA and FTP to fixed APIs; stop swallowing required macOS writes/trust failures; simplify terminal migration for sudo projects and MacPorts sources.
- [x] Run relevant renderer/main/fork integration checks and report any baseline failures separately.

## Task 4: Integration and review

- [x] Confirm shared version and contract agree; build five helper targets without installing them.
- [x] Run focused aggregate checks and compile main/fork/changed Vue; inspect actual output and failures.
- [x] Request independent review of the combined diff against spec, owners, failure boundaries and Review Focus; address significant findings.
- [x] Record implementation decisions, results and unperformed true-system acceptance in approved design; leave concrete reviewable changes without publishing.

**Completion evidence and remaining system acceptance:** See approved design section 13. Code and isolated checks completed; actual signed deployment/Keychain/FTP/old MacPorts acceptance remains unperformed and is not covered by checked code tasks.

## Review follow-up (2026-10-06)

User authorized handling the verified review findings. Keep the approved scope, simple centralized logic, no new Pinia/config state or module-boundary exceptions.

- Terminal sudo: fork custom-service/language-project owners retain process/PID lifecycle; share command quoting and macOS terminal script construction. Explicit sudo/system authentication is required only for sudo-mode commands; test captured terminal commands, quoting and ordinary mode.
- Helper installation: AppHelper owns one installation flight for graphical and terminal execution from preparation through real PTY exit and health. Duplicate GUI calls share their GUI flight; cross-mode and duplicate terminal calls reject. NodePTY directly sends the fixed quoted command to the terminal without a writable outer script and owns actual exit acknowledgement, including stop/renderer disconnect; page detach retains the controller and running operation. Health failure is required, while post-ready hosts synchronization/logging cannot negate successful installation. Test both cross-mode directions, preparation races, PTY failure/cancellation and detached completion.
- Hosts: full-text callers must supply the digest of the content they read; generic file-write APIs reject system hosts and direct callers use the dedicated interface. Managed sync reads/transforms within its process queue. Queues are per process; helper mutex/digest detects cross-process conflicts. Write/conflict failures propagate; DNS/logging remain supplementary and never replay writes. Test stale digest, absent digest and queued operations.
- MacPorts: prepare owns preview IPC and terminal cleanup; failed preparation preserves previous preview and per-file outcomes. Fork returns content only; snapshots are created by the controller after a successful reply, so late replies create no files. Snapshot cleanup is supplementary; new successful preview resets old outcomes/terminal. Apply keeps completed/failed/unknown outcomes across detach.
- Go: preserve request correlation on bounded-response failure; use bounded coherent Unix RPC/client budgets, retain unknown outcomes without replay. Reject non-updatable hosts flags before temp creation and retain security attributes before publish. Validate protected input bounds and approved certificate health; platform stubs fail closed. Native/cross compilation and isolated tests only; real system acceptance remains pending.
- Documentation/cleanup: clarify unsigned production builds cannot install helpers, per-process hosts queue, and intentional fixed FTP lifecycle. Remove clearly unreachable Unix password injection; do not remove Windows/shared RPC types used by other platforms.
