# MongoDB DbGate Web Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans (recommended) to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Add an on-demand, shared DbGate Community Web companion that opens from the MongoDB service page, persists its workspace under Server.BaseDir, and stops with MongoDB.

**Architecture:** A fork-side DbGate runtime owns generic install, start, reuse, health, and stop behavior. MongoDB supplies the lifecycle owner and renderer entry, while future database modules can reuse the runtime. The latest dbgate-serve package is installed only after an explicit user click with the selected Node.js binary and is never bundled into FlyEnv.

**Tech Stack:** Electron IPC, Vue 3 Composition API, TypeScript, serviceStartSpawn, Node.js/npm, axios, existing process-list helpers, and tsx contract tests.

---

### Task 1: Establish failing DbGate contracts

**Files:**
- Create: scripts/mongodb-dbgate-test.ts
- Modify: package.json (add test:mongodb-dbgate)

- [ ] **Step 1: Add the focused test command**

Add this script beside the existing focused tests:

~~~json
"test:mongodb-dbgate": "tsx scripts/mongodb-dbgate-test.ts"
~~~

- [ ] **Step 2: Write the failing contracts**

Create scripts/mongodb-dbgate-test.ts with assertions for the public helper contract and integration source. The first assertions import these exact exports, which do not exist yet:

~~~ts
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DBGATE_DEFAULT_PORT,
  DBGATE_PACKAGE,
  dbGateCommandOwned,
  dbGateEnv,
  dbGatePaths,
  dbGateUrl,
  mongodbPortFromConfig
} from '../src/fork/module/DbGate'

const unix = dbGatePaths('/tmp/FlyEnv/server', false)
assert.equal(DBGATE_PACKAGE, 'dbgate-serve')
assert.equal(DBGATE_DEFAULT_PORT, 3000)
assert.equal(unix.root, '/tmp/FlyEnv/server/dbgate')
assert.equal(unix.workspace, '/tmp/FlyEnv/server/dbgate/workspace')
assert.equal(unix.pid, '/tmp/FlyEnv/server/dbgate/dbgate.pid')
assert.equal(unix.port, '/tmp/FlyEnv/server/dbgate/dbgate.port')
assert.equal(unix.entry, '/tmp/FlyEnv/server/dbgate/node_modules/dbgate-serve/bin/dbgate-serve.js')

const env = dbGateEnv(unix, 3001)
assert.equal(env.WORKSPACE_DIR, unix.workspace)
assert.equal(env.PORT, '3001')
assert.equal(env.BASIC_AUTH, '1')
assert.equal(env.LOGIN, 'flyenv')
assert.equal(env.PASSWORD, 'test-password')
assert.equal(env.SHELL_CONNECTION, '0')
assert.equal(env.SHELL_SCRIPTING, '0')
assert.equal(env.CONNECTIONS, undefined)
assert.equal(mongodbPortFromConfig('net:\n  port: 27019\n'), 27019)
assert.equal(mongodbPortFromConfig('net:\n  bindIp: 127.0.0.1\n'), 27017)
assert.equal(dbGateUrl(3001), 'http://127.0.0.1:3001')
assert.equal(dbGateCommandOwned('node ' + unix.entry, unix, false), true)
assert.equal(dbGateCommandOwned('node /tmp/other/dbgate-serve.js', unix, false), false)

const root = join(import.meta.dirname, '..')
const forkSource = readFileSync(join(root, 'src/fork/module/Mongodb/index.ts'), 'utf8')
const pageSource = readFileSync(join(root, 'src/render/components/MongoDB/Index.vue'), 'utf8')
assert.match(forkSource, /openDbGate\(/)
assert.match(forkSource, /_stopDbGate\(/)
assert.match(pageSource, /openDbGate/)
assert.doesNotMatch(pageSource, /password|credentials/i)

console.log('MongoDB DbGate contract tests passed')
~~~

- [ ] **Step 3: Verify the test is red**

Run:

~~~bash
yarn test:mongodb-dbgate
~~~

Expected: failure because src/fork/module/DbGate and the MongoDB integration methods do not exist.

- [ ] **Step 4: Commit the red test**

~~~bash
git add package.json scripts/mongodb-dbgate-test.ts
git commit -m "test: define MongoDB DbGate contracts"
~~~

### Task 2: Add reusable loopback probing and pure DbGate helpers

**Files:**
- Create: src/shared/LoopbackPort.ts
- Create: src/fork/module/DbGate/index.ts
- Modify: src/fork/module/Postgresql/pgAdmin.ts
- Test: scripts/mongodb-dbgate-test.ts and scripts/postgresql-pgadmin4-test.ts

- [ ] **Step 1: Add the shared probe contract**

Add a test seam with an injected probe:

~~~ts
assert.equal(
  await findLoopbackPort(3000, 3, 3002, [3000], async port => port === 3001),
  3001
)
await assert.rejects(
  () => findLoopbackPort(3000, 2, 3001, [], async () => false),
  /No loopback port is available/
)
~~~

- [ ] **Step 2: Implement src/shared/LoopbackPort.ts**

Export these signatures:

~~~ts
export type LoopbackPortProbe = (port: number) => Promise<boolean>
export function canBindLoopback(port: number): Promise<boolean>
export async function findLoopbackPort(
  start: number,
  count: number,
  max: number,
  excluded: readonly number[] = [],
  probe: LoopbackPortProbe = canBindLoopback
): Promise<number>
~~~

canBindLoopback must listen on 127.0.0.1, close on success or error, and return false for invalid or unavailable ports. findLoopbackPort must skip excluded ports and stop at max.

- [ ] **Step 3: Preserve pgAdmin behavior**

Replace the private duplicate bind implementation in src/fork/module/Postgresql/pgAdmin.ts with findLoopbackPort(PGADMIN4_DEFAULT_PORT, PGADMIN4_PORT_SCAN_COUNT, PGADMIN4_MAX_PORT, excluded), retaining the existing findPgAdminPort signature as a wrapper so current callers and tests do not change.

- [ ] **Step 4: Implement src/fork/module/DbGate/index.ts pure helpers**

Define these exports:

~~~ts
export const DBGATE_PACKAGE = 'dbgate-serve'
export const DBGATE_DEFAULT_PORT = 3000
export const DBGATE_PORT_SCAN_COUNT = 20
export const DBGATE_MAX_PORT = 65535

export type DbGatePaths = {
  root: string
  workspace: string
  entry: string
  pid: string
  port: string
  log: string
  startOut: string
  startError: string
}

export function dbGatePaths(baseDir: string, windows: boolean): DbGatePaths
export function dbGateEnv(
  paths: DbGatePaths,
  port: number,
  credentials?: { login: string; password: string }
): Record<string, string>
export function dbGateUrl(port: number): string
export function dbGateCommandOwned(command: string, paths: DbGatePaths, windows: boolean): boolean
export function mongodbPortFromConfig(content: string): number
~~~

The path helper must keep all files below Server.BaseDir/dbgate and use node_modules/dbgate-serve/bin/dbgate-serve.js as the entry on every platform. The environment helper must set WORKSPACE_DIR, PORT, BASIC_AUTH=1, LOGIN, PASSWORD, SHELL_CONNECTION=0, and SHELL_SCRIPTING=0, while leaving CONNECTIONS unset. Credentials are generated once and persisted in a private file below the DbGate root. The MongoDB parser accepts net.port from 1 to 65535 and defaults to 27017. Ownership matching must require the normalized package entry path and reject sibling or external paths.

- [ ] **Step 5: Run focused contracts and checks**

~~~bash
yarn test:mongodb-dbgate
yarn test:postgresql-pgadmin4
yarn eslint src/shared/LoopbackPort.ts src/fork/module/DbGate/index.ts src/fork/module/Postgresql/pgAdmin.ts scripts/mongodb-dbgate-test.ts
yarn prettier --check src/shared/LoopbackPort.ts src/fork/module/DbGate/index.ts src/fork/module/Postgresql/pgAdmin.ts scripts/mongodb-dbgate-test.ts
~~~

Expected: all tests pass with no ESLint errors and formatted files.

- [ ] **Step 6: Commit the helpers**

~~~bash
git add src/shared/LoopbackPort.ts src/fork/module/DbGate/index.ts src/fork/module/Postgresql/pgAdmin.ts scripts/mongodb-dbgate-test.ts scripts/postgresql-pgadmin4-test.ts
git commit -m "feat: add shared DbGate runtime contracts"
~~~


### Task 3: Implement the DbGate install, start, reuse, and stop runtime

**Files:**
- Modify: src/fork/module/DbGate/index.ts
- Test: scripts/mongodb-dbgate-test.ts

- [ ] **Step 1: Add failing lifecycle cases**

Test an injected runtime where the first open performs one install and one start, a second healthy open performs neither, and stop returns the owned PID while removing PID/port state. Also test failed-start cleanup and a stale PID command that is rejected.

- [ ] **Step 2: Implement local npm installation**

Run the equivalent of this command with the selected Node runtime:

~~~text
node npm-cli.js install --loglevel error --prefix Server.BaseDir/dbgate --no-package-lock --no-audit --no-fund dbgate-serve
~~~

Resolve npm without a global shell lookup by checking the selected Node directory's npm/npm.cmd, its node_modules/npm/bin/npm-cli.js, and its sibling lib/node_modules/npm/bin/npm-cli.js. Reject with “npm is not available for the selected Node.js version” when none exists, and accept installation only when the DbGate entry exists afterward.

- [ ] **Step 3: Implement health-aware open**

Add DbGateRuntime.open(node, on) to create directories, validate persisted PID/port state, check exact command ownership, check the listener PID through the existing loopback-listener process helpers, and perform an HTTP health request to dbGateUrl(port). If no healthy instance exists, install if needed, select a loopback port, and call serviceStartSpawn with the selected Node binary and entry script. Pass PORT, WORKSPACE_DIR, BASIC_AUTH, LOGIN, PASSWORD, SHELL_CONNECTION, and SHELL_SCRIPTING in execEnv; wait for PID and HTTP health before persisting the port. Return a URL containing URL-encoded Basic Auth user information so the user never needs to handle the generated credentials.

Return { url, 'APP-Service-Start-PID', 'APP-Service-Start-Item' }, where the start item has typeFlag: 'mongodb', version: 'dbgate', bin set to the selected Node binary, and path set to the DbGate root. Wrap concurrent calls in a single-flight promise.

- [ ] **Step 4: Implement ownership-safe stop**

Add DbGateRuntime.stop() to validate the persisted PID against the exact FlyEnv package entry, use the existing verified interrupt process path, wait for owned PIDs to disappear, and remove dbgate.pid and dbgate.port. A stale or missing PID must never trigger a broad port kill.

- [ ] **Step 5: Run runtime checks and commit**

~~~bash
yarn test:mongodb-dbgate
yarn eslint src/fork/module/DbGate/index.ts scripts/mongodb-dbgate-test.ts
yarn prettier --check src/fork/module/DbGate/index.ts scripts/mongodb-dbgate-test.ts
git add src/fork/module/DbGate/index.ts scripts/mongodb-dbgate-test.ts
git commit -m "feat: manage on-demand DbGate Web runtime"
~~~

### Task 4: Attach DbGate to MongoDB's fork lifecycle

**Files:**
- Modify: src/fork/module/Mongodb/index.ts
- Test: scripts/mongodb-dbgate-test.ts

- [ ] **Step 1: Add failing lifecycle assertions**

Assert that MongoDB exposes openDbGate, stops DbGate before both Unix and Windows MongoDB stop branches, adds DbGate logs under Server.BaseDir/dbgate, and merges companion PIDs into APP-Service-Stop-PID.

- [ ] **Step 2: Add the shared runtime instance and open IPC method**

Instantiate one DbGateRuntime using global.Server.BaseDir! and add openDbGate(node: SoftInstalled): ForkPromise<DbGateOpenResult>. The method validates the selected Node binary, delegates to the runtime, forwards progress events, and returns the URL, PID, and explicit DbGate start item so IPCHandler never registers the selected Node version as the running service item.

- [ ] **Step 3: Wrap MongoDB stop with DbGate stop**

At the beginning of the existing _stopServer implementation, call the runtime stop method. Preserve the current Windows mongosh shutdown and Unix super._stopServer behavior. Merge PIDs before resolving:

~~~ts
const dbGatePids = await this.dbGateRuntime.stop().catch(error => {
  console.error('stop DbGate error: ', error)
  return []
})
const result = await stopMongoDb(version)
result['APP-Service-Stop-PID'] = Array.from(
  new Set([...(result['APP-Service-Stop-PID'] ?? []), ...dbGatePids])
)
resolve(result)
~~~

Use the existing module log callback for stop success/end and allow MongoDB to stop even when a stale DbGate process cannot be verified.

- [ ] **Step 4: Expose DbGate diagnostics**

Extend getLogFiles with dbgate.start.out.log, dbgate.start.error.log, and the DbGate application log under global.Server.BaseDir/dbgate/log, without moving the existing MongoDB log path.

- [ ] **Step 5: Run lifecycle checks and commit**

~~~bash
yarn test:mongodb-dbgate
yarn tsx scripts/stop-process-list-cache-test.ts
yarn eslint src/fork/module/Mongodb/index.ts src/fork/module/DbGate/index.ts scripts/mongodb-dbgate-test.ts
yarn prettier --check src/fork/module/Mongodb/index.ts src/fork/module/DbGate/index.ts scripts/mongodb-dbgate-test.ts
git add src/fork/module/Mongodb/index.ts src/fork/module/DbGate/index.ts scripts/mongodb-dbgate-test.ts
git commit -m "feat: stop DbGate with MongoDB"
~~~

### Task 5: Add the MongoDB Web entry

**Files:**
- Modify: src/render/components/MongoDB/Index.vue
- Test: scripts/mongodb-dbgate-test.ts

- [ ] **Step 1: Add failing renderer assertions**

Require the HTTP icon slot, dbGateOpening loading guard, selected Node lookup, app-fork:mongodb/openDbGate IPC payload, and shell.openExternal handling. Assert that no credential object appears in the renderer source.

- [ ] **Step 2: Implement the UI state and action**

Add the ClickHouse-style slot:

~~~vue
<template v-if="isRunning" #tool-left>
  <el-button
    class="button"
    link
    :disabled="dbGateOpening || !nodeVersion"
    @click.stop="openDbGate"
  >
    <el-icon v-if="dbGateOpening" class="is-loading"><Loading /></el-icon>
    <yb-icon v-else :svg="import('@/svg/http.svg?raw')"></yb-icon>
  </el-button>
</template>
~~~

In script setup, derive isRunning from the MongoDB store, derive nodeVersion from BrewStore().currentVersion('node'), guard the action with MessageError(I18nT('base.needSelectVersion')), clone only the version object, send IPC.send('app-fork:mongodb', 'openDbGate', nodeVersion), and open only res.data.url.

- [ ] **Step 3: Run renderer checks and commit**

~~~bash
yarn test:mongodb-dbgate
yarn eslint src/render/components/MongoDB/Index.vue scripts/mongodb-dbgate-test.ts
yarn prettier --check src/render/components/MongoDB/Index.vue scripts/mongodb-dbgate-test.ts
git add src/render/components/MongoDB/Index.vue scripts/mongodb-dbgate-test.ts
git commit -m "feat: add MongoDB DbGate Web entry"
~~~

### Task 6: Record the on-demand third-party license

**Files:**
- Create: docs/third-party-licenses.md
- Test: scripts/mongodb-dbgate-test.ts

- [ ] **Step 1: Add the exact dependency record**

Create this inventory entry:

~~~markdown
## DbGate Community Web

- Package: dbgate-serve (latest version resolved from npm at first use)
- License: GPL-3.0
- Source: https://github.com/dbgate/dbgate
- Distribution: downloaded from npm on first explicit use; not bundled in FlyEnv
- Local install path: Server.BaseDir/dbgate
~~~

- [ ] **Step 2: Add the no-bundling assertion**

Extend scripts/mongodb-dbgate-test.ts to assert that package.json does not list dbgate-serve as an application dependency and that the license document contains dbgate-serve, GPL-3.0, and the source URL.

- [ ] **Step 3: Run documentation checks and commit**

~~~bash
yarn test:mongodb-dbgate
git diff --check
git add docs/third-party-licenses.md scripts/mongodb-dbgate-test.ts
git commit -m "docs: record DbGate on-demand license"
~~~

### Task 7: Run the complete verification gate

**Files:**
- Test: scripts/mongodb-dbgate-test.ts
- Verify: all files changed by Tasks 1-6

- [ ] **Step 1: Run focused feature and cross-module tests**

~~~bash
yarn test:mongodb-dbgate
yarn test:postgresql-pgadmin4
yarn tsx scripts/stop-process-list-cache-test.ts
yarn tsx scripts/service-web-panel-test.ts
~~~

Expected: every command exits with code 0 and reports its test suite passed.

- [ ] **Step 2: Run static checks**

~~~bash
yarn eslint src/shared/LoopbackPort.ts src/fork/module/DbGate/index.ts src/fork/module/Mongodb/index.ts src/render/components/MongoDB/Index.vue scripts/mongodb-dbgate-test.ts
yarn prettier --check src/shared/LoopbackPort.ts src/fork/module/DbGate/index.ts src/fork/module/Mongodb/index.ts src/render/components/MongoDB/Index.vue scripts/mongodb-dbgate-test.ts
git diff --check ba5cc24e..HEAD
~~~

Expected: zero ESLint errors, all files formatted, and no whitespace errors.

- [ ] **Step 3: Verify the final worktree**

~~~bash
git status --short
git log --oneline --decorate -8
~~~

Expected: only intentional feature commits are present; the unrelated docs/task/clickhouse-demo directory in the main worktree remains untouched.
