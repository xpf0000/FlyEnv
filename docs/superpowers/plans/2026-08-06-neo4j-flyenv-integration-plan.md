# Neo4j FlyEnv Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add a local FlyEnv Neo4j Community service module that scans installed versions, binds each version to a compatible local JDK, and owns safe start/stop/config/log/Browser lifecycle without calling nest-admin.

**Architecture:** The fork module owns Neo4j processes, PID files, instance directories, configuration, logs, and health checks. A Neo4j renderer store persists install-bin to Java Home bindings; a module-local controller owns long-running renderer operations without storing or prompting for database credentials. The service list uses the existing ServiceManager slot to render a per-version Java selector.

**Tech Stack:** Electron, Vue 3, Pinia, TypeScript, node:child_process, existing serviceStartSpawn/serviceStartExec, ForkPromise, EnvSync, existing Java module discovery.

---

## File map

- Create src/fork/module/Neo4j/index.ts: installation discovery, config initialization, start/stop, PID, logs, and ports.
- Create src/fork/module/Neo4j/policy.ts: fork-safe version support and Java-major validation.
- Create src/render/components/Neo4j/Module.ts: auto-discovered module metadata.
- Create src/render/components/Neo4j/Index.vue: tabs, Browser action, service manager slot, config and log views.
- Create src/render/components/Neo4j/aside.vue: aside/tray service switch integration.
- Create src/render/components/Neo4j/Config.vue and Logs.vue.
- Create src/render/components/Neo4j/store.ts: local Java binding state.
- Create src/render/components/Neo4j/policy.ts: renderer Java policy and candidate filtering.
- Create src/render/components/Neo4j/controller.ts: singleton start/stop operation owner.
- Modify src/shared/app.d.ts: add optional runtime snapshot fields to SoftInstalled.
- Modify src/render/store/app.ts: persist Neo4j bindings in FlyEnv local configuration.
- Modify src/render/store/brew.ts: preserve Neo4j runtime snapshots during installed-item rehydration.
- Modify src/render/core/type.ts, src/main/utils/ServerPath.ts, and src/fork/BaseManager.ts.
- Modify src/global.d.ts to declare global.Server.Neo4jDir.
- Add Neo4j translation resources under src/lang and focused scripts under scripts/.

## Task 1: Define local policy and binding contract with failing tests

**Files:**
- Create scripts/neo4j-policy-test.ts
- Create src/render/components/Neo4j/policy.ts
- Create src/fork/module/Neo4j/policy.ts

- [ ] **Step 1: Write failing policy tests**

Assert this exact initial matrix:

~~~ts
expect(resolveNeo4jJavaPolicy('5.23.0')).toEqual({
  supportedMajor: [17, 21],
  recommendedMajor: 21,
})
expect(resolveNeo4jJavaPolicy('5.26.29')).toEqual({
  supportedMajor: [17, 21],
  recommendedMajor: 21,
})
expect(resolveNeo4jJavaPolicy('2025.09.0')).toEqual({
  supportedMajor: [21],
  recommendedMajor: 21,
})
expect(resolveNeo4jJavaPolicy('2025.10.0')).toEqual({
  supportedMajor: [21, 25],
  recommendedMajor: 21,
})
expect(resolveNeo4jJavaPolicy('2026.07.0')).toEqual({
  supportedMajor: [21, 25],
  recommendedMajor: 21,
})
expect(resolveNeo4jJavaPolicy('5.22.0')).toMatchObject({ supportedMajor: [] })
~~~

Also test filterJavaCandidates excludes incompatible JDKs, prefers recommendedMajor, and returns an unsupported result for versions below 5.23.0.

- [ ] **Step 2: Define the shared binding shape**

Use the same shape in renderer and fork snapshots:

~~~ts
export type Neo4jJavaBinding = {
  javaHome: string
  javaMajor: number
}
~~~

Use a normalized Neo4j bin path as the persistence key. Do not use nest-admin responses as state.

- [ ] **Step 3: Run the test and confirm it fails**

~~~bash
yarn tsx scripts/neo4j-policy-test.ts
~~~

Expected: FAIL because the policy modules are not implemented.

- [ ] **Step 4: Implement both policy modules**

Keep version comparison pure and platform-independent. The fork policy must validate javaHome by checking the platform-specific Java executable (bin/java or bin/java.exe) and detected major before starting a process.

- [ ] **Step 5: Run the policy test and commit**

~~~bash
yarn tsx scripts/neo4j-policy-test.ts
git add scripts/neo4j-policy-test.ts src/render/components/Neo4j/policy.ts src/fork/module/Neo4j/policy.ts
git commit -m "feat: add Neo4j local Java compatibility policy"
~~~

Expected: PASS.

## Task 2: Add module enum, global path, and lazy fork entry

**Files:**
- Modify src/render/core/type.ts
- Modify src/main/utils/ServerPath.ts
- Modify src/fork/BaseManager.ts
- Modify src/global.d.ts

- [ ] **Step 1: Add the module enum**

Add neo4j = 'neo4j' to AppModuleEnum near other database services. Do not bypass AppModules auto-discovery.

- [ ] **Step 2: Add the global directory**

Set global.Server.Neo4jDir = join(runpath, 'server/neo4j') in SetupGlobalPaths and include it in createBaseDirectories. Add the optional property to the global Server declaration.

- [ ] **Step 3: Add lazy fork dispatch**

Add a Neo4j property and a BaseManager branch following the ClickHouse/Qdrant pattern:

~~~ts
} else if (module === 'neo4j') {
  if (!this.Neo4j) {
    const res = await import('./module/Neo4j')
    this.Neo4j = res.default
  }
  doRun(this.Neo4j)
~~~

- [ ] **Step 4: Run the boundary check**

~~~bash
yarn test:renderer-operation-boundaries
~~~

Expected: PASS; if the checker requires a Neo4j page/controller entry, add only the declared owner paths from Task 5.

- [ ] **Step 5: Commit the runtime entry**

~~~bash
git add src/render/core/type.ts src/main/utils/ServerPath.ts src/fork/BaseManager.ts src/global.d.ts
git commit -m "feat: register Neo4j FlyEnv module runtime"
~~~

## Task 3: Implement fork installation, scanning, and instance paths

**Files:**
- Create src/fork/module/Neo4j/index.ts
- Modify src/shared/app.d.ts

- [ ] **Step 1: Add module identity and PID path**

Set this.type = 'neo4j'. Use global.Server.Neo4jDir for neo4j.pid, instance logs, and generated start scripts. Derive an instance key from a normalized installation path, not only the version string.

- [ ] **Step 2: Implement online installation mapping**

In fetchAllOnlineVersion, call _fetchOnlineVersion('neo4j'). For Unix map the installed binary to app/neo4j/{version}/bin/neo4j; for Windows map to app/neo4j/{version}/bin/neo4j.bat. Use existing archive helpers and preserve downloaded/installed flags.

- [ ] **Step 3: Implement local discovery**

Use versionLocalFetch on configured Neo4j directories, scan for the platform script, then validate with neo4j version or neo4j-admin version. Filter versions below 5.23.0 into an unsupported item with an explanatory error; do not call the online API during discovery.

- [ ] **Step 4: Add snapshot fields**

Extend SoftInstalled only with optional runtime snapshot fields:

~~~ts
javaHome?: string
javaMajor?: number
neo4jInstanceDir?: string
~~~

These fields are passed to fork for one operation and are not persistence.

- [ ] **Step 5: Test scanning contract and commit**

Add a fixture test that verifies Unix/Windows executable mapping, rejects versions below 5.23.0, and derives distinct instance keys for equal versions at different paths.

~~~bash
yarn tsx scripts/neo4j-module-contract-test.ts
git add src/fork/module/Neo4j/index.ts src/shared/app.d.ts scripts/neo4j-module-contract-test.ts
git commit -m "feat: add Neo4j installation and local discovery"
~~~

## Task 4: Implement isolated config, logs, and Browser metadata

**Files:**
- Modify src/fork/module/Neo4j/index.ts
- Create src/render/components/Neo4j/Config.vue
- Create src/render/components/Neo4j/Logs.vue

- [ ] **Step 1: Initialize instance directories**

Create conf, data, logs, import, and plugins under server/neo4j/instances/{instanceKey}. Copy the distribution conf/neo4j.conf only when the instance config is absent. Append or update absolute server.directories.* values without overwriting user edits.

- [ ] **Step 2: Implement file accessors**

Return neo4j.conf from getConfigFiles and version-specific stdout/stderr paths from getLogFiles. Config.vue uses the existing Conf component; Logs.vue uses the existing Log component and never reads renderer process state as proof of liveness.

- [ ] **Step 3: Implement port parsing**

Expose default HTTP/HTTPS/Bolt ports and parse configured listen ports from the effective config for the Browser link. Keep the parser tolerant of comments and preserve user configuration text.

- [ ] **Step 4: Add a focused config test**

Verify directory initialization is idempotent, user-edited config survives a second start, paths are absolute, and Browser follows a custom HTTP port.

- [ ] **Step 5: Commit config and logs**

~~~bash
git add src/fork/module/Neo4j/index.ts src/render/components/Neo4j/Config.vue src/render/components/Neo4j/Logs.vue scripts/neo4j-module-contract-test.ts
git commit -m "feat: add Neo4j isolated config and logs"
~~~

## Task 5: Add local binding store, controller, and Java selector UI

**Files:**
- Create src/render/components/Neo4j/store.ts
- Create src/render/components/Neo4j/controller.ts
- Create src/render/components/Neo4j/Index.vue
- Create src/render/components/Neo4j/Module.ts
- Create src/render/components/Neo4j/aside.vue
- Modify src/render/store/app.ts
- Modify src/render/store/brew.ts

- [ ] **Step 1: Add the persisted binding store**

Create a Pinia module store with javaByBin, getBinding(bin), setBinding(bin, binding), removeBinding(bin), and hydrate/save methods. Persist under FlyEnv local configuration; remove entries whose bin no longer exists after a scan. Saving a binding must not invoke nest-admin.

- [ ] **Step 2: Add the operation controller**

Create a module-local singleton that owns an immutable request snapshot, re-entry guard, progress events, terminal result, and cleanup. Its public commands are start(item), stop(item), and restart(item). A duplicate start returns the active promise; a second version is rejected while another instance is running; stop is idempotent. It must not prompt for or persist a Neo4j password.

- [ ] **Step 3: Wire Java start parameters**

Use the existing module startExtParam hook or a Neo4j-specific controller bridge to provide javaHome and neo4jInstanceDir to fork. Before returning, verify the binding still exists and matches the selected policy. Never pass a password through a loggable command-line argument.

- [ ] **Step 4: Add the per-version selector column**

In Index.vue, render the existing Service component with a column slot. For each installed row show an el-select containing compatible Java candidates, display selected major and home path, disable it while row.run or row.running, and show a link/action to the Java module when no candidate exists.

- [ ] **Step 5: Add module registration and aside/tray UI**

Follow Qdrant Module.ts, Index.vue, and aside.vue patterns. Set moduleType dataBaseServer, typeFlag neo4j, isService true, isTray true, and a stable asideIndex. Add tabs for service, version manager, config, stdout log, stderr log, and a Browser button using the parsed HTTP port.

- [ ] **Step 6: Run operation-boundary verification**

~~~bash
yarn test:renderer-operation-boundaries
~~~

Expected: the controller owns progress/terminal cleanup, and the mounted page contains no long-running IPC listener or generic loading map.

- [ ] **Step 7: Commit renderer ownership changes**

~~~bash
git add src/render/components/Neo4j src/render/store/app.ts src/render/store/brew.ts
git commit -m "feat: add Neo4j Java binding and service UI"
~~~

## Task 6: Implement safe start, health check, and graceful stop

**Files:**
- Modify src/fork/module/Neo4j/index.ts
- Implement the Neo4j-specific _stopServer override in src/fork/module/Neo4j/index.ts; do not change the generic Base process-name map.
- Update scripts/neo4j-module-contract-test.ts

- [ ] **Step 1: Validate Java in fork**

Before spawning, resolve bin/java or bin/java.exe, run the version probe, compare its major to Neo4jJavaPolicy, and reject with a localized error if incompatible. Renderer selection is advisory; fork validation is authoritative.

- [ ] **Step 2: Start with an isolated environment**

Set JAVA_HOME, prepend the selected JDK bin to PATH, set NEO4J_CONF, and start neo4j console with serviceStartSpawn on macOS/Windows or the existing root-aware executor on Linux. Use Neo4j-specific stdout/stderr files and PID paths.

- [ ] **Step 3: Initialize the first password safely**

When the instance data directory has not been initialized, do not invoke neo4j-admin dbms set-initial-password. Start Neo4j normally so it uses the official default credentials (`neo4j` / `neo4j`), leaving password changes to Neo4j Browser.

- [ ] **Step 4: Wait for terminal startup**

Treat process-started as intermediate. Probe HTTP and Bolt until ready or timeout; only then emit APP-Service-Start-Success and resolve the controller operation. On early process exit, include the Neo4j error log in the terminal failure without exposing passwords.

- [ ] **Step 5: Stop by command, then owned PID**

Call Neo4j’s stop command with the same runtime environment, wait for the PID and ports to disappear, then use ProcessOwnedPidsByPid and path markers as a narrowly scoped fallback. Do not add neo4j: java to the generic Base process-name map.

- [ ] **Step 6: Verify lifecycle scenarios**

Run the contract script with fake process/port adapters for duplicate start, no-JDK failure, early exit, successful health readiness, graceful stop, and fallback PID ownership. Expected: terminal cleanup runs exactly once in every scenario.

- [ ] **Step 7: Commit lifecycle implementation**

~~~bash
git add src/fork/module/Neo4j/index.ts scripts/neo4j-module-contract-test.ts
git commit -m "feat: add safe Neo4j service lifecycle"
~~~

## Task 7: Add translations and documentation checks

**Files:**
- Create or modify src/lang/*/neo4j.json or established module translation files
- Modify language index files required by src/lang/check.mjs

- [ ] **Step 1: Add runtime and lifecycle message keys**

Add keys for Java runtime, Browser, unsupported version, health timeout, and graceful stop. Provide complete English and Simplified Chinese text, then add fallback-safe values for every built-in locale required by the language checker.

- [ ] **Step 2: Run language validation**

~~~bash
yarn test:language-assets
yarn test:language-repository
~~~

Expected: no missing keys, invalid JSON, or repository-index errors.

- [ ] **Step 3: Commit translations**

~~~bash
git add src/lang
git commit -m "feat: add Neo4j translations"
~~~

## Task 8: Cross-platform acceptance and release gate

**Files:**
- No additional source files unless a test exposes a defect.

- [ ] **Step 1: Run focused automated checks**

~~~bash
yarn tsx scripts/neo4j-policy-test.ts
yarn tsx scripts/neo4j-module-contract-test.ts
yarn test:renderer-operation-boundaries
yarn test:service-process-exit-safety
~~~

Expected: all commands pass.

- [ ] **Step 2: Verify online installation**

On each supported platform, fetch neo4j online versions, install one 5.23 or 5.26 version and one 2025.10 or newer version, and confirm the installed list is discovered without a backend call during subsequent page entry or startup.

- [ ] **Step 3: Verify Java binding behavior**

Expose Java 17, 21, and 25 where supported. Confirm 5.23–5.26 filter to 17/21, 2025.01–2025.09 filter to 21, and 2025.10+ filter to 21/25. Change a row binding while stopped, restart FlyEnv, and confirm the binding is restored by bin path.

- [ ] **Step 4: Verify lifecycle and data safety**

Start with the default Neo4j credentials, open Browser, edit config, stop gracefully, restart, and verify data/log/config persistence. Start a second Neo4j version and confirm it is rejected while the first is running. Confirm stopping Neo4j does not terminate another Java process.

- [ ] **Step 5: Run the production build**

~~~bash
yarn build
~~~

Expected: boundary checks and production packaging complete without TypeScript, Vite, or esbuild errors.

- [ ] **Step 6: Commit only after platform evidence**

Record platform, Neo4j version, Java major, ports, and lifecycle result in the implementation PR. Do not claim completion until verification commands and the manual matrix pass.
