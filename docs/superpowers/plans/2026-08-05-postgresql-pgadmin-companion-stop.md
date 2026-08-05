# PostgreSQL pgAdmin Companion Stop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop all FlyEnv-owned pgAdmin 4 processes whenever PostgreSQL is stopped, including processes whose virtual-environment Python interpreter is resolved through a symlink.

**Architecture:** pgAdmin process ownership is determined by the exact FlyEnv-private `pgAdmin4.py` script argument, not the executable Python argument. The existing PostgreSQL `_stopServer()` and `_stopPGAdmin()` lifecycle remains responsible for strict shutdown and reporting companion PIDs.

**Tech Stack:** TypeScript, Electron fork process, Node process inspection, existing pgAdmin contract test.

---

## File Map

- Modify: `src/fork/module/Postgresql/pgAdmin.ts` - recognize pgAdmin commands even when the virtual-environment interpreter resolves to another executable path.
- Modify: `scripts/postgresql-pgadmin4-test.ts` - regression coverage for resolved interpreters and PostgreSQL companion-stop behavior.

## Task 1: Recognize and Stop Resolved-Interpreter pgAdmin Processes

**Files:**
- Modify: `scripts/postgresql-pgadmin4-test.ts`
- Modify: `src/fork/module/Postgresql/pgAdmin.ts`

- [ ] **Step 1: Add failing ownership assertions.**

Add a macOS-style resolved interpreter command that runs the exact package-root script and require it to be owned:

```ts
const resolvedInterpreterCommand =
  '/opt/local/Library/Frameworks/Python.framework/Versions/3.13/Resources/Python.app/Contents/MacOS/Python ' +
  `${join(packageRoot, 'pgAdmin4.py')}`
assert.equal(pgAdminCommandOwned(resolvedInterpreterCommand, unixPaths, packageRoot, false), true)
```

Add a metadata-independent resolved interpreter command that runs the exact `unixPaths.venv/lib/python3.13/site-packages/pgadmin4/pgAdmin4.py` script and require it to be owned. Keep assertions that `not-pgadmin.py`, `/other/pgAdmin4.py`, and unrelated Python processes are not owned.

Add source assertions that `_stopServer()` invokes `_stopPGAdmin()` before PostgreSQL shutdown and merges `pgAdminPids` into `APP-Service-Stop-PID`.

- [ ] **Step 2: Run the focused test and confirm red.**

Run:

```bash
yarn test:postgresql-pgadmin4
```

Expected: ownership assertion fails because `pgAdminCommandOwned()` requires `paths.python` as the command's first argument.

- [ ] **Step 3: Match the private script argument without constraining the interpreter.**

In `pgAdminCommandOwned()`, build the command regex from the exact `join(packageRoot, 'pgAdmin4.py')` argument and accept it after a command boundary regardless of the interpreter path:

```ts
const commandPattern = new RegExp(
  `(?:^|\\s)${commandArgumentPattern(scriptPath)}(?=\\s|$)`
)
```

In `pgAdminCommandOwnedWithoutPackageMetadata()`, use the existing canonical virtual-environment script pattern with the same command-boundary form, without a `paths.python` prefix. Keep `commandPath()` normalization and `commandArgumentPattern()` quoting support.

Do not change `_stopPGAdmin()`, `stopPgAdminPidsWithVerification()`, pgAdmin configuration, stored credentials, or PostgreSQL PID-file handling.

- [ ] **Step 4: Run focused regression checks and inspect the diff.**

```bash
yarn test:postgresql-pgadmin4
yarn eslint src/fork/module/Postgresql/pgAdmin.ts scripts/postgresql-pgadmin4-test.ts
yarn prettier --check src/fork/module/Postgresql/pgAdmin.ts scripts/postgresql-pgadmin4-test.ts
git diff --check
```

Expected: all commands exit successfully. The contract test proves resolved interpreters are selected only when their script argument is under FlyEnv's private pgAdmin virtual environment.

- [ ] **Step 5: Commit.**

```bash
git add src/fork/module/Postgresql/pgAdmin.ts scripts/postgresql-pgadmin4-test.ts
git commit -m "fix: stop pgAdmin with resolved virtualenv Python"
```

## Task 2: Final Verification

**Files:**
- No production changes.

- [ ] **Step 1: Run cross-module regression checks.**

```bash
yarn test:postgresql-pgadmin4
yarn tsx scripts/stop-process-list-cache-test.ts
yarn tsx scripts/service-web-panel-test.ts
git diff --check
```

Expected: all commands exit successfully.

- [ ] **Step 2: Confirm no broader pgAdmin behavior changed.**

Verify from source and test contracts that PostgreSQL still calls `_stopPGAdmin()` before database shutdown, returns companion PIDs, preserves user-saved PostgreSQL connection credentials, and never uses `postmaster.pid` in the pgAdmin launch path.
