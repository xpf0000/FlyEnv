# Neo4j Windows 启动与 Java 自动绑定 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 在 Windows 上无可见 PowerShell 窗口启动 Neo4j，并在本地 Neo4j/Java 安装列表变化时自动为未绑定实例保存兼容 JDK。

**Architecture:** fork Neo4j 模块直接调用发行包内的 neo4j.ps1，以隐藏、非交互的 PowerShell 进程运行；缺少脚本时退回到隐藏的 cmd.exe 批处理调用。renderer 中既有 Neo4jJavaBindingManager 继续通过 StorageSetAsync 管理绑定，并在 aside 首次挂载时启动一个序列化的模块 singleton watch；页面仅持有行内选择器。

**Tech Stack:** TypeScript、Vue 3 Composition API、Electron fork process、Node child_process、既有 serviceStartSpawn、StorageGetAsync/StorageSetAsync、tsx 断言脚本。

---

## File map

- Modify: src/fork/module/Neo4j/index.ts — 选择 Windows 专用启动命令并继续委托已有 fork 生命周期。
- Modify: src/render/components/Neo4j/store.ts — 启动一次的安装列表 watch，调用既有串行 reconcileBindings。
- Modify: src/render/components/Neo4j/aside.vue — 在 Neo4j module lifetime 起点启用 Java 绑定 watch。
- Modify: src/render/components/Neo4j/Index.vue — 移除页面生命周期内的重复 watch。
- Modify: scripts/neo4j-service-lifecycle-test.ts — 断言 Windows 启动适配的契约。
- Modify: scripts/neo4j-renderer-test.ts — 断言绑定 watch 归模块 singleton/aside，而非页面。

### Task 1: Lock the Windows startup command contract with a failing test

**Files:**

- Modify: scripts/neo4j-service-lifecycle-test.ts
- Test: scripts/neo4j-service-lifecycle-test.ts

- [ ] **Step 1: Write the failing Windows launcher test**

Append the following exact assertions after the existing Neo4j lifecycle assertions:

~~~ts
const neo4jFork = readFileSync(join(root, 'src/fork/module/Neo4j/index.ts'), 'utf-8')

assert.match(neo4jFork, /function neo4jStartCommand\(version: SoftInstalled\)/)
assert.match(neo4jFork, /join\(dirname\(version\.bin\), 'neo4j\.ps1'\)/)
assert.match(neo4jFork, /EnvSync\.PowerShellPath \|\| 'powershell\.exe'/)
assert.match(neo4jFork, /'-NoProfile'/)
assert.match(neo4jFork, /'-NonInteractive'/)
assert.match(neo4jFork, /'-WindowStyle'/)
assert.match(neo4jFork, /'Hidden'/)
assert.match(neo4jFork, /bin: 'cmd\.exe'/)
assert.match(neo4jFork, /'\/d', '\/s', '\/c'/)
assert.match(neo4jFork, /call "/)
assert.match(neo4jFork, /const command = neo4jStartCommand\(version\)/)
assert.match(neo4jFork, /bin: command\.bin,[\s\S]{0,100}execArgs: command\.execArgs/)
~~~

- [ ] **Step 2: Run the test and verify RED**

Run: yarn test:neo4j-service-lifecycle

Expected: failure at the first neo4jStartCommand assertion, because no platform command selector exists yet.

- [ ] **Step 3: Implement the minimal Windows launch selector**

Add this import with the other shared imports in src/fork/module/Neo4j/index.ts:

~~~ts
import EnvSync from '@shared/EnvSync'
~~~

Define the type and function immediately after javaBinForHome:

~~~ts
type Neo4jStartCommand = {
  bin: string
  execArgs: string[]
}

function neo4jStartCommand(version: SoftInstalled): Neo4jStartCommand {
  if (!isWindows()) return { bin: version.bin, execArgs: ['console'] }

  const powershellScript = join(dirname(version.bin), 'neo4j.ps1')
  if (existsSync(powershellScript)) {
    return {
      bin: EnvSync.PowerShellPath || 'powershell.exe',
      execArgs: [
        '-NoProfile',
        '-NonInteractive',
        '-NoLogo',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        powershellScript,
        'console'
      ]
    }
  }

  return {
    bin: 'cmd.exe',
    execArgs: ['/d', '/s', '/c', 'call "' + version.bin + '" console']
  }
}
~~~

The direct script invocation avoids neo4j.bat launching a visible nested PowerShell. The cmd fallback only covers older hand-installed distributions without neo4j.ps1.

- [ ] **Step 4: Route _startServer through that selector**

Replace only bin and execArgs in the existing serviceStartSpawn request. Keep version for the event/PID/log identity.

~~~ts
const command = neo4jStartCommand(version)
const res = await serviceStartSpawn({
  version,
  pidPath: paths.pidFile,
  baseDir: paths.instanceDir,
  bin: command.bin,
  execArgs: command.execArgs,
  execEnv: this.envFor(version, paths, java.javaHome),
  cwd: paths.root,
  outFile: paths.startOut,
  errFile: paths.startError,
  on,
  sensitive: true,
  waitTime: 3000
})
~~~

- [ ] **Step 5: Run the test and verify GREEN**

Run: yarn test:neo4j-service-lifecycle

Expected: Neo4j service lifecycle tests passed and exit code 0.

- [ ] **Step 6: Commit the isolated change**

~~~bash
git add src/fork/module/Neo4j/index.ts scripts/neo4j-service-lifecycle-test.ts
git commit -m "fix: hide Neo4j Windows startup window"
~~~

### Task 2: Lock Java binding watcher ownership with a failing renderer test

**Files:**

- Modify: scripts/neo4j-renderer-test.ts
- Test: scripts/neo4j-renderer-test.ts

- [ ] **Step 1: Write the failing watcher-ownership test**

Load aside.vue next to the existing Neo4j sources, then add:

~~~ts
const aside = read('src/render/components/Neo4j/aside.vue')

assert.match(store, /import \{ watch \} from 'vue'/)
assert.match(store, /watchInstalledVersions\(\)/)
assert.match(store, /private installedVersionsWatching = false/)
assert.match(store, /if \(this\.installedVersionsWatching\) return/)
assert.match(
  store,
  /this\.reconcileBindings\(neo4jModule\.installed\)\.catch\(\(\) => undefined\)/
)
assert.match(aside, /Neo4jManager\.watchInstalledVersions\(\)/)
assert.doesNotMatch(index, /neo4jManager\.reconcileBindings\(/)
assert.doesNotMatch(index, /watch\(/)
~~~

- [ ] **Step 2: Run the test and verify RED**

Run: yarn test:neo4j-renderer

Expected: failure at watchInstalledVersions because the reconciliation watch is still page-owned.

- [ ] **Step 3: Implement the module-lifetime watcher**

In src/render/components/Neo4j/store.ts add this import:

~~~ts
import { watch } from 'vue'
~~~

Add the guard after mutationQueue:

~~~ts
private installedVersionsWatching = false
~~~

Add this method immediately before reconcileBindings:

~~~ts
watchInstalledVersions() {
  if (this.installedVersionsWatching) return
  this.installedVersionsWatching = true

  const neo4jModule = BrewStore().module('neo4j')
  const javaModule = BrewStore().module('java' as any)
  watch(
    () => ({
      neo4jFetched: neo4jModule.installedFetched,
      neo4j: neo4jModule.installed.map((item) => [item.bin, item.path, item.version]),
      java: javaModule.installed.map((item) => [item.bin, item.path, item.version, item.num])
    }),
    () => {
      if (!neo4jModule.installedFetched) return
      this.reconcileBindings(neo4jModule.installed).catch(() => undefined)
    },
    { immediate: true }
  )
}
~~~

The signature tracks only properties that can affect bind eligibility. Existing reconcileBindings removes stale keys, fills only absent keys by filterJavaCandidates(...)[0], preserves explicit bindings, and serializes persistence through mutationQueue. Do not add Pinia or config.setup state.

- [ ] **Step 4: Start that watcher from the Neo4j aside**

After this existing line in src/render/components/Neo4j/aside.vue:

~~~ts
const neo4jModule = BrewStore().module('neo4j')
~~~

Add:

~~~ts
Neo4jManager.watchInstalledVersions()
~~~

The application mounts built-in aside components for its module list, so the binding watch no longer depends on visiting the Neo4j page.

- [ ] **Step 5: Remove the page-owned watcher**

In src/render/components/Neo4j/Index.vue replace the Vue import and installed declarations with:

~~~ts
import { computed } from 'vue'

const installed = computed(() => brewStore.module('neo4j').installed)
~~~

Delete javaInstalled and the entire watch([installed, javaInstalled], ...) block. Keep Neo4jManager.init().catch() so stored bindings hydrate before selector reads. Keep all selector helpers unchanged.

- [ ] **Step 6: Run the test and verify GREEN**

Run: yarn test:neo4j-renderer

Expected: Neo4j renderer tests passed and exit code 0.

- [ ] **Step 7: Commit the isolated change**

~~~bash
git add src/render/components/Neo4j/store.ts src/render/components/Neo4j/aside.vue src/render/components/Neo4j/Index.vue scripts/neo4j-renderer-test.ts
git commit -m "fix: auto-bind Java for installed Neo4j versions"
~~~

### Task 3: Run integration checks and inspect final scope

**Files:**

- Verify: src/fork/module/Neo4j/index.ts
- Verify: src/render/components/Neo4j/store.ts
- Verify: src/render/components/Neo4j/aside.vue
- Verify: src/render/components/Neo4j/Index.vue
- Verify: scripts/neo4j-service-lifecycle-test.ts
- Verify: scripts/neo4j-renderer-test.ts

- [ ] **Step 1: Run focused Neo4j regression checks**

Run:

~~~bash
yarn tsx scripts/neo4j-policy-test.ts
yarn test:neo4j-service-lifecycle
yarn test:neo4j-renderer
~~~

Expected: every command exits 0 and prints its passed message.

- [ ] **Step 2: Run the renderer ownership boundary check**

Run: yarn test:renderer-operation-boundaries

Expected: renderer operation boundary tests passed and exit code 0. The new list watcher is module singleton domain reconciliation, not a page-owned long-running IPC operation.

- [ ] **Step 3: Check diff correctness and unrelated worktree changes**

Run:

~~~bash
git diff --check
git diff -- src/fork/module/Neo4j/index.ts src/render/components/Neo4j/store.ts src/render/components/Neo4j/aside.vue src/render/components/Neo4j/Index.vue scripts/neo4j-service-lifecycle-test.ts scripts/neo4j-renderer-test.ts
git status --short
~~~

Expected: git diff --check has no output. Preserve the pre-existing untracked docs/deepwiki/llama-cpp-integration-research.md; do not stage or modify it.

- [ ] **Step 4: Perform Windows manual acceptance when a local Neo4j package is available**

Use a Windows Neo4j distribution containing bin/neo4j.ps1 and a compatible installed JDK. Start from the aside and service page; then add or remove a local Java or Neo4j installation and refresh its installed list.

Expected: no visible PowerShell window; health check reaches the configured HTTP port; a previously unbound Neo4j row selects and persists a compatible JDK; explicit user bindings remain unchanged; bindings for removed Neo4j paths are deleted.
