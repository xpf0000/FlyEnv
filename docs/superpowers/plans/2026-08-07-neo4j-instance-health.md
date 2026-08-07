# Neo4j Instance Startup Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark an installation running only when the PID returned by its own launch owns the Java command for that installation and instance configuration; complete startup on the first matching observation.

**Architecture:** The Neo4j fork module owns all process liveness. After `serviceStartSpawn` returns the launcher PID, it snapshots that process command and polls the process list only until it observes a descendant Java process carrying both the selected installation `--home-dir` and instance-specific `--config-dir`; that first match is success. Neither HTTP responses nor Neo4j logs take part in readiness. Stop terminates the verified PID tree directly; if the PowerShell launcher already exited, it recovers the exact Java process by those same home/config arguments, adds its installation-owned wrapper and descendants, and terminates the resulting PID set.

**Tech Stack:** TypeScript, Electron fork process, Node process list utility, existing `tsx` assertion scripts.

---

## Operation contract

- **Owner/lifetime:** `src/fork/module/Neo4j/index.ts`; it owns the launched process and terminal start result.
- **Start event:** Existing `ModuleInstalledItem.start()` IPC request invokes `Base.startService()` then `Neo4j._startServer()`.
- **Intermediate events:** Existing spawn diagnostics; the fork polls only the operating system process list.
- **Terminal events:** Resolve on the first matching PID/command-tree observation. Keep polling only while the Java descendant has not yet appeared; reject immediately if the launcher PID exits or its command changes, and reject on timeout if the exact Java command never appears. Stop resolves on the first observation that no PID in the verified/recovered instance tree remains.
- **Duplicate invocation:** Existing `ModuleInstalledItem.running` guard remains unchanged.
- **Service interaction:** This change does not stop another version or change the shared lifecycle API. A port collision causes the new launcher/Java process to terminate and is therefore a start failure.
- **Lifecycle tests:** Cover root PID loss, root command replacement, pending Java startup followed by a match, success on the first match, direct PID-tree stop, and two instances that share a product version but use different installation paths.

## File map

- Create: `src/fork/module/Neo4j/startup.ts` — process tree and startup wait policy.
- Create: `scripts/neo4j-startup-test.ts` — process/PID startup regression tests.
- Modify: `package.json` — expose the focused test as `test:neo4j-startup`.
- Modify: `src/fork/module/Neo4j/index.ts` — snapshot launcher command and delegate final readiness to the policy.

### Task 1: Process identity regression tests

- [ ] **Step 1:** Test matching `--home-dir` plus `--config-dir`, exited PID, changed root command, and missing matching Java command.
- [ ] **Step 2:** Test that a first matching command tree resolves immediately, and that a pending Java descendant can later produce the first match.
- [ ] **Step 3:** Run `yarn test:neo4j-startup` and verify it first fails against the previous generic HTTP-readiness implementation.

### Task 2: Enforce ownership in the fork

- [ ] **Step 1:** Record the PID from `serviceStartSpawn` and its initial operating-system command line.
- [ ] **Step 2:** Poll the process list until the first root-command and descendant-Java-command match, uniquely identified by installation path plus instance configuration directory.
- [ ] **Step 3:** Remove Axios and every HTTP or Neo4j-log readiness read from the startup path.
- [ ] **Step 4:** Run `yarn test:neo4j-startup` and verify the policy passes the focused cases.

### Task 3: Verify integrated contract

- [ ] **Step 1:** Run `yarn test:neo4j-startup`, `yarn test:neo4j-service-lifecycle`, and `yarn test:neo4j-renderer`.
- [ ] **Step 2:** Run `yarn tsc --noEmit`, ESLint for the changed source and test, and `git diff --check`.
- [ ] **Step 3:** With `2026.07.0` listening on default ports, start `2025.12.1`. Verify the latter fails based on its own process tree; do not inspect any HTTP response or Neo4j log.
