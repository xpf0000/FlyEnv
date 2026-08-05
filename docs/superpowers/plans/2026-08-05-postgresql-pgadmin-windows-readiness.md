# PostgreSQL pgAdmin Windows Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep pgAdmin 4 alive long enough for its Windows HTTP server to become ready.

**Architecture:** pgAdmin 4 is spawned by `Postgresql/index.ts` and polled through `waitForPgAdminHealth` in `pgAdmin.ts`. The Windows runtime needs about six seconds to bind and answer HTTP, while the current ten 250ms polls expire after 2.5 seconds. Extend only the helper's default polling window to 30 seconds, keeping explicit caller overrides intact.

**Tech Stack:** TypeScript, Node.js assertions, Electron fork process.

---

### Task 1: Cover Windows pgAdmin readiness

**Files:**
- Modify: `scripts/postgresql-pgadmin4-test.ts:143-155,725-745`
- Modify: `src/fork/module/Postgresql/pgAdmin.ts:695-707`

- [x] **Step 1: Make the existing configuration assertions platform-neutral and add the failing readiness test**

```typescript
assert.ok(
  config.includes(`SQLITE_PATH = ${JSON.stringify(join(configDataDir, 'pgadmin4.db'))}`)
)

const defaultHealthIntervals: number[] = []
assert.equal(
  await waitForPgAdminHealth({
    isPortOwned: async () => false,
    isHttpReachable: async () => true,
    wait: async (milliseconds) => {
      defaultHealthIntervals.push(milliseconds)
    }
  }),
  false
)
assert.equal(defaultHealthIntervals.length, 59)
assert.deepEqual(new Set(defaultHealthIntervals), new Set([500]))

const explicitHealthIntervals: number[] = []
assert.equal(
  await waitForPgAdminHealth({
    isPortOwned: async () => false,
    isHttpReachable: async () => true,
    wait: async (milliseconds) => {
      explicitHealthIntervals.push(milliseconds)
    },
    attempts: 2,
    intervalMilliseconds: 17
  }),
  false
)
assert.deepEqual(explicitHealthIntervals, [17])
```

- [x] **Step 2: Run the test to verify it fails with the current 2.5-second defaults**

Run: `yarn test:postgresql-pgadmin4`

Expected: FAIL because the current default retry count produces nine waits rather than 59.

- [x] **Step 3: Increase only the default pgAdmin health-polling window**

```typescript
const attempts = Math.max(1, options.attempts ?? 60)
const intervalMilliseconds = options.intervalMilliseconds ?? 500
```

Keep the loop and `options.attempts`/`options.intervalMilliseconds` overrides unchanged.

- [x] **Step 4: Run the focused regression test**

Run: `yarn test:postgresql-pgadmin4`

Expected: `PostgreSQL pgAdmin 4 regression tests passed`.

- [x] **Step 5: Compile-check the touched TypeScript and inspect the final diff**

Run: `yarn eslint src/fork/module/Postgresql/pgAdmin.ts scripts/postgresql-pgadmin4-test.ts`

Expected: no lint errors. Then run `git diff --check` and `git diff -- src/fork/module/Postgresql/pgAdmin.ts scripts/postgresql-pgadmin4-test.ts`.

The optional upstream integration test reached its final HTTP assertion but is currently blocked by its pre-existing direct `create_app()` check not initializing `app.PGADMIN_INT_KEY`, as the real `pgAdmin4.py` entry point does.
