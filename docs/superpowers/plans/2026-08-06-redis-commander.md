# Redis Commander Web Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an on-demand, loopback-only Redis Commander panel that derives Redis connection settings inside the fork and stops with the Redis service.

**Architecture:** A Redis-local fork runtime owns package installation, private credentials, Redis configuration parsing, loopback process lifecycle, and companion shutdown. A Redis-local renderer singleton owns opening state and IPC lifecycle; the page only renders the command. IPC carries immutable Node and Redis version identities, never Redis configuration values or passwords.

**Tech Stack:** Electron fork process, TypeScript, Vue 3 Composition API, Element Plus, npm, Axios, and existing FlyEnv process and loopback helpers.

---

## File Structure

- Create: `src/fork/module/Redis/RedisCommander.ts` - Redis configuration parser and fork-owned runtime.
- Modify: `src/fork/module/Redis/index.ts` - Runtime delegation, companion-first stop, and companion logs.
- Create: `src/render/components/Redis/RedisCommanderPanel.ts` - Renderer operation controller.
- Modify: `src/render/components/Redis/Index.vue` - Running-service panel command only.
- Create: `scripts/redis-commander-test.ts` - Fork runtime and module contract test.
- Modify: `scripts/renderer-operation-boundaries-test.ts` - Register the Redis controller boundary.
- Modify: `package.json` - Add the focused test command.
- Modify: `docs/third-party-licenses.md` - Record the on-demand MIT component.

### Task 1: Establish the Failing Fork Contract

**Files:**

- Create: `scripts/redis-commander-test.ts`
- Modify: `package.json:13-29`

- [ ] **Step 1: Write the failing test**

Create `scripts/redis-commander-test.ts`. It imports the not-yet-existing runtime:

```ts
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SoftInstalled } from '../src/shared/app'
import {
  REDIS_COMMANDER_DEFAULT_PORT,
  REDIS_COMMANDER_LOGIN,
  REDIS_COMMANDER_PACKAGE,
  RedisCommanderRuntime,
  redisCommanderArgs,
  redisCommanderConfig,
  redisCommanderInstallManifest,
  redisCommanderPaths,
  redisCommanderUrl
} from '../src/fork/module/Redis/RedisCommander'
```

The first assertions define package, parsing, path, URL, and command behavior:

```ts
assert.equal(REDIS_COMMANDER_PACKAGE, 'redis-commander')
assert.equal(REDIS_COMMANDER_DEFAULT_PORT, 8081)
assert.equal(REDIS_COMMANDER_LOGIN, 'flyenv')
assert.deepEqual(redisCommanderConfig('port 6380\nrequirepass "secret value"\n'), {
  host: '127.0.0.1', port: 6380, password: 'secret value'
})
assert.deepEqual(redisCommanderConfig('# port 6390\nport invalid\nrequirepass\n'), {
  host: '127.0.0.1', port: 6379
})
assert.deepEqual(redisCommanderInstallManifest(), {
  name: 'flyenv-redis-commander', private: true,
  dependencies: { 'redis-commander': 'latest' }
})
const paths = redisCommanderPaths('/tmp/flyenv', false)
assert.equal(paths.entry, '/tmp/flyenv/redis-commander/node_modules/redis-commander/bin/redis-commander.js')
assert.equal(redisCommanderUrl(8082, { login: 'flyenv', password: 'secret' }), 'http://flyenv:secret@127.0.0.1:8082')
assert.deepEqual(
  redisCommanderArgs({ host: '127.0.0.1', port: 6380, password: 'redis-secret' }, 8082, { login: 'flyenv', password: 'panel-secret' }),
  ['--address', '127.0.0.1', '--port', '8082', '--redis-host', '127.0.0.1', '--redis-port', '6380', '--redis-password', 'redis-secret', '--http-auth-username', 'flyenv', '--http-auth-password', 'panel-secret', '--nosave', '--no-log-data']
)
```

Create an injected runtime over a temporary directory. Its installer increments a counter and writes `paths.entry`; its starter increments another counter, writes `1234` to `paths.pid`, and returns that PID; the fake process/listener/health dependencies represent PID `1234` only while `running` is true. Call `runtime.open(node, redis)`, assert one install/start and a credential-bearing loopback URL, then call `Promise.all([runtime.open(node, redis), runtime.open(node, redis)])`, assert no second start, call `stop()`, assert only `1234` was killed, and assert PID/port files no longer exist.

Add `"test:redis-commander": "tsx scripts/redis-commander-test.ts"` after `test:mongodb-dbgate` in `package.json`.

- [ ] **Step 2: Verify red**

Run `node /Users/x/Desktop/WorkSpace/GitHub/FlyEnv/node_modules/tsx/dist/cli.mjs scripts/redis-commander-test.ts`.

Expected: FAIL with `Cannot find module '../src/fork/module/Redis/RedisCommander'`.

- [ ] **Step 3: Commit the failing test**

Run `git add scripts/redis-commander-test.ts package.json`, then run `git commit -m "test: define redis commander runtime contract"`.

### Task 2: Implement the Redis Fork Runtime

**Files:**

- Create: `src/fork/module/Redis/RedisCommander.ts`
- Test: `scripts/redis-commander-test.ts`

- [ ] **Step 1: Add pure helpers**

Export the exact API introduced by Task 1:

```ts
export const REDIS_COMMANDER_PACKAGE = 'redis-commander'
export const REDIS_COMMANDER_DEFAULT_PORT = 8081
export const REDIS_COMMANDER_PORT_SCAN_COUNT = 20
export const REDIS_COMMANDER_MAX_PORT = 65535
export const REDIS_COMMANDER_LOGIN = 'flyenv'
export type RedisCommanderConnection = { host: '127.0.0.1'; port: number; password?: string }
export type RedisCommanderCredentials = { login: string; password: string }
```

Implement `redisCommanderConfig(content)` locally in the fork. It skips blank and `#` comment lines, removes matching outer single/double quotes, permits the final `port` and `requirepass` directive to win, accepts only ports 1 through 65535, and defaults to `127.0.0.1:6379`. It does not import `MCPContextResolver`, renderer code, or any front-end parser.

Implement private paths under `join(baseDir, 'redis-commander')`:

```ts
entry: join(root, 'node_modules', 'redis-commander', 'bin', 'redis-commander.js')
pid: join(root, 'redis-commander.pid')
port: join(root, 'redis-commander.port')
credentials: join(root, 'redis-commander.credentials.json')
startOut: join(root, 'log', 'redis-commander.start.out.log')
startError: join(root, 'log', 'redis-commander.start.error.log')
```

`redisCommanderArgs` must always include `--address 127.0.0.1`, Redis host/port, generated HTTP Basic Auth, `--nosave`, and `--no-log-data`; it includes `--redis-password` only for a non-empty parsed password.

- [ ] **Step 2: Add the runtime lifecycle**

Implement `RedisCommanderRuntime` with injectable `paths`, `platformWindows`, `processList`, `listeningPids`, `health`, `portFinder`, `installer`, `starter`, `config`, and `kill` dependencies. The defaults reuse `ProcessListFetch`/`ProcessPidListStrict`, shared `fetchLoopbackListeningPids`, `findLoopbackPort`, `ProcessKillStrict`, `spawnPromise`, `serviceStartSpawn`, and Axios.

The default connection reader executes only in the fork:

```ts
const major = `${redis.version ?? ''}`.split('.')[0]
if (!major) throw new Error('Redis version is required before opening Redis Commander')
const configPath = join(global.Server.RedisDir!, `redis-${major}.conf`)
if (!existsSync(configPath)) throw new Error(`Redis configuration was not found: ${configPath}`)
return redisCommanderConfig(await readFile(configPath, 'utf8'))
```

The default installer finds npm next to the selected Node binary, writes a private manifest containing `redis-commander: latest`, runs:

```ts
['install', '--loglevel', 'error', '--prefix', paths.root, '--no-package-lock', '--no-audit', '--no-fund', REDIS_COMMANDER_PACKAGE]
```

It invokes a JavaScript npm CLI through the selected Node binary, invokes an npm executable with `shell: isWindows()`, and rejects unless the expected entry exists.

Generate a random 32-byte-hex Basic Auth password when no valid private credentials file exists, write mode `0600`, and preserve it for reuse. Launch with `serviceStartSpawn`, `[paths.entry, ...redisCommanderArgs(...)]`, private PID/log paths, and start item `{ typeFlag: 'redis', version: 'redis-commander', bin: node.bin, path: paths.root }`.

Reuse an existing process only if the persisted root PID command exactly owns `paths.entry`, the PID owns the persisted loopback listener, and authenticated health succeeds. Kill only verified owned processes before clearing stale PID/port files. Coalesce `open(node, redis)` calls through `openFlight`; after startup error call `stop()` then rethrow. `stop()` removes only runtime PID/port files and preserves the installed package plus credentials.

- [ ] **Step 3: Verify green**

Run the Task 1 test command. Expected: PASS, including parsing, command flags, install, concurrent reuse, and owned-process cleanup.

- [ ] **Step 4: Commit the runtime**

Run `git add src/fork/module/Redis/RedisCommander.ts scripts/redis-commander-test.ts`, then run `git commit -m "feat: add redis commander runtime"`.

### Task 3: Connect the Runtime to Redis Lifecycle

**Files:**

- Modify: `src/fork/module/Redis/index.ts:1-170`
- Modify: `scripts/redis-commander-test.ts`

- [ ] **Step 1: Extend the test with lifecycle assertions**

Append this source contract after the runtime assertions:

```ts
const projectRoot = join(import.meta.dirname, '..')
const redisModule = readFileSync(join(projectRoot, 'src/fork/module/Redis/index.ts'), 'utf8')
assert.match(redisModule, /RedisCommanderRuntime/)
assert.match(redisModule, /openRedisCommander\(node: SoftInstalled, redis: SoftInstalled\)/)
assert.match(redisModule, /this\.redisCommanderRuntime\.open\(node, redis, on\)/)
assert.match(redisModule, /const redisCommanderPids = await this\.redisCommanderRuntime\.stop\(\)/)
assert.match(redisModule, /\[\.\.\.\(result\['APP-Service-Stop-PID'\] \?\? \[\]\), \.\.\.redisCommanderPids\]/)
```

- [ ] **Step 2: Verify red**

Run the focused test. Expected: FAIL at the lifecycle assertion because `Redis/index.ts` has not imported or stopped the runtime.

- [ ] **Step 3: Implement module ownership**

In `Redis/index.ts`, import the runtime and add a lazy getter constructed as `new RedisCommanderRuntime(global.Server.BaseDir!)`. Add this fork entry point:

```ts
openRedisCommander(node: SoftInstalled, redis: SoftInstalled): ForkPromise<RedisCommanderOpenResult> {
  return new ForkPromise((resolve, reject, on) => {
    this.redisCommanderRuntime.open(node, redis, on).then(resolve).catch(reject)
  })
}
```

Restructure `_stopServer` into one wrapping `ForkPromise`. Obtain `redisCommanderPids` from `this.redisCommanderRuntime.stop()` before delegating to the existing Windows-specific Redis stop path or `super._stopServer`. Merge every terminal service result with:

```ts
result['APP-Service-Stop-PID'] = Array.from(
  new Set([...(result['APP-Service-Stop-PID'] ?? []), ...redisCommanderPids])
)
```

Preserve existing Redis service logs and Windows fallback. Add `redis-commander-start-out` and `redis-commander-start-error` to `getLogFiles` after the Redis log.

- [ ] **Step 4: Verify green and commit**

Run the focused test. Expected: PASS.

Run `git add src/fork/module/Redis/index.ts scripts/redis-commander-test.ts`, then run `git commit -m "feat: stop redis commander with redis"`.

### Task 4: Add Renderer Controller and Button

**Files:**

- Create: `src/render/components/Redis/RedisCommanderPanel.ts`
- Modify: `src/render/components/Redis/Index.vue:1-41`
- Modify: `scripts/renderer-operation-boundaries-test.ts:76-116`

- [ ] **Step 1: Add the failing renderer boundary**

Add this controller registration:

```ts
{
  page: 'Redis/Index.vue',
  controller: 'Redis/RedisCommanderPanel.ts',
  instance: 'redisCommanderPanel',
  className: 'RedisCommanderPanel'
}
```

Add these assertions after the controller loop:

```ts
const redisPage = readFileSync(join(componentsDir, 'Redis/Index.vue'), 'utf-8')
const redisPanel = readFileSync(join(componentsDir, 'Redis/RedisCommanderPanel.ts'), 'utf-8')
assert.match(redisPage, /<template v-if="isRunning" #tool-left>/)
assert.match(redisPage, /:disabled="redisCommanderOpening \|\| !redisCommanderNodeAvailable"/)
assert.match(redisPanel, /IPC\.sendSensitive\('app-fork:redis', 'openRedisCommander'/)
assert.match(redisPanel, /isWebPanelInstallNotice/)
assert.match(redisPanel, /shell\.openExternal\(res\.data\.url\)/)
assert.doesNotMatch(redisPage, /from ['"]@\/util\/IPC['"]/)
assert.doesNotMatch(redisPage, /requirepass|RedisDir|readFile|redisCommanderConfig/)
assert.doesNotMatch(redisPanel, /requirepass|RedisDir|readFile|redisCommanderConfig/)
```

- [ ] **Step 2: Verify red**

Run `node /Users/x/Desktop/WorkSpace/GitHub/FlyEnv/node_modules/tsx/dist/cli.mjs scripts/renderer-operation-boundaries-test.ts`.

Expected: FAIL because `RedisCommanderPanel.ts` does not exist.

- [ ] **Step 3: Implement the controller and page binding**

Create `RedisCommanderPanel` with singleton-owned state:

```ts
export class RedisCommanderPanel {
  readonly opening = ref(false)
  readonly nodeAvailable = computed(() => !!BrewStore().currentVersion('node')?.bin)
  private installNotice: { close: () => void } | undefined
}
```

`open()` ignores duplicate clicks, gets the selected Node and currently running Redis item from `BrewStore`, deep clones only those identity objects, then calls:

```ts
IPC.sendSensitive('app-fork:redis', 'openRedisCommander', selectedNode, selectedRedis)
```

On `code === 200` with `isWebPanelInstallNotice(res.msg)`, show `base.webPanelFirstInstall` with `duration: 0` and retain `opening`. On success, failure, or send exception, close the notice, unregister the IPC listener, and clear `opening`; on success open the returned URL and otherwise call `MessageError`. This controller must not read or derive Redis configuration, port, or password.

Update `Redis/Index.vue` with MongoDB's `#tool-left` structure: render only while a Redis item is running, show `Loading` while opening, use `http.svg` otherwise, disable while opening or when Node is absent, and invoke only `redisCommanderPanel.open()`. The page must not import IPC.

- [ ] **Step 4: Verify green and commit**

Run the Step 2 command. Expected: PASS.

Run `git add src/render/components/Redis/RedisCommanderPanel.ts src/render/components/Redis/Index.vue scripts/renderer-operation-boundaries-test.ts`, then run `git commit -m "feat: add redis commander panel entry"`.

### Task 5: License, Formatting, and Final Verification

**Files:**

- Modify: `docs/third-party-licenses.md:1-9`
- Test: `scripts/redis-commander-test.ts`
- Test: `scripts/renderer-operation-boundaries-test.ts`

- [ ] **Step 1: Record the external component**

Append:

```md
## Redis Commander Web

- Package: redis-commander (latest version resolved from npm at first use)
- License: MIT
- Source: https://github.com/joeferner/redis-commander
- Distribution: downloaded from npm on first explicit use; not bundled in FlyEnv
- Local install path: Server.BaseDir/redis-commander
```

- [ ] **Step 2: Format and test**

Run:

```bash
node /Users/x/Desktop/WorkSpace/GitHub/FlyEnv/node_modules/prettier/bin/prettier.cjs --write src/fork/module/Redis/RedisCommander.ts src/fork/module/Redis/index.ts src/render/components/Redis/RedisCommanderPanel.ts src/render/components/Redis/Index.vue scripts/redis-commander-test.ts scripts/renderer-operation-boundaries-test.ts package.json docs/third-party-licenses.md
node /Users/x/Desktop/WorkSpace/GitHub/FlyEnv/node_modules/tsx/dist/cli.mjs scripts/redis-commander-test.ts
node /Users/x/Desktop/WorkSpace/GitHub/FlyEnv/node_modules/tsx/dist/cli.mjs scripts/renderer-operation-boundaries-test.ts
node /Users/x/Desktop/WorkSpace/GitHub/FlyEnv/node_modules/tsx/dist/cli.mjs scripts/mongodb-dbgate-test.ts
node /Users/x/Desktop/WorkSpace/GitHub/FlyEnv/node_modules/typescript/bin/tsc --noEmit --pretty false
git diff --check
```

Expected: every command exits zero. Re-run the two focused Redis checks after formatting if Prettier changes source.

- [ ] **Step 3: Commit the disclosure and integrate**

Run `git add docs/third-party-licenses.md`, then run `git commit -m "docs: record redis commander license"`.

Fast-forward merge into `master`, run the Redis Commander and renderer operation boundary tests from the main worktree, then remove only `.worktrees/redis-commander`. Do not modify the PostgreSQL worktree or untracked files in the main worktree.
