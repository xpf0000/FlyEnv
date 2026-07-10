# Startup Group Platform Module Lazy Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent Startup Group from capturing an empty platform module list before `window.Server` receives its operating-system flags.

**Architecture:** Replace the eager `modules` dependency with a `getModules()` provider. Candidate discovery takes one provider snapshot per `listCandidates()` call, while the runtime singleton remains safe to construct during renderer module evaluation.

**Tech Stack:** TypeScript 5.8, Vue 3 renderer runtime, Node `assert`, `tsx`, ESLint, `vue-tsc`

---

## File Structure

- Modify `scripts/startup-group-test.ts`: add the regression proving module discovery is lazy and verify the renderer integration passes the provider without invoking it.
- Modify `src/render/core/StartupGroupRuntime.ts`: define the lazy dependency contract and resolve a stable module snapshot inside `listCandidates()`.
- Modify `src/render/components/StartupGroup/runtime.ts`: pass `platformModules` as the lazy provider.

### Task 1: Add the Lazy Module Resolution Regression and Fix the Runtime

**Files:**
- Test: `scripts/startup-group-test.ts:316-383`
- Modify: `src/render/core/StartupGroupRuntime.ts:44-50,245-294`
- Modify: `src/render/components/StartupGroup/runtime.ts:22-25`

- [ ] **Step 1: Write the failing runtime regression**

In the existing `createStartupGroupRuntime()` test block in `scripts/startup-group-test.ts`, replace the inline `modules` array with a counted provider and assert that construction does not call it:

```typescript
  let moduleLoadCalls = 0
  const getModules = () => {
    moduleLoadCalls += 1
    return [
      { typeFlag: 'mysql' as const, moduleType: 'dataBaseServer' as const, label: 'MySQL', isService: true },
      { typeFlag: 'node' as const, moduleType: 'language' as const, label: 'NodeJS', isService: true },
      { typeFlag: 'php-fpm' as const, moduleType: 'language' as const, label: 'PHP-FPM', isService: true }
    ]
  }

  const runtime = createStartupGroupRuntime({
    createId: () => 'candidate-id',
    getModules,
    getInstalled: async (module) => {
      if (module === 'mysql') return [current, target]
      if (module === 'php') {
        return [
          {
            ...target,
            id: 'php-84',
            version: '8.4.8',
            path: 'D:/php/8.4.8'
          }
        ]
      }
      return []
    },
    getProjects: async (module) => {
      projectLoadCalls += 1
      return module === 'node' ? [projectTarget] : []
    },
    pathExists: async (path) => existingProjectPaths.has(path)
  })

  assert.equal(moduleLoadCalls, 0)
```

Immediately after candidate discovery, assert that the provider was evaluated exactly once:

```typescript
  const candidates = await runtime.listCandidates()
  assert.equal(moduleLoadCalls, 1)
```

In the existing source-contract block near the end of `scripts/startup-group-test.ts`, read the renderer runtime source and require the lazy wiring:

```typescript
  const runtimeSource = readSource('src/render/components/StartupGroup/runtime.ts')

  assert.match(runtimeSource, /getModules:\s*platformModules/)
  assert.doesNotMatch(runtimeSource, /modules:\s*platformModules\(\)/)
```

- [ ] **Step 2: Run the Startup Group test and verify RED**

Run:

```bash
yarn test:startup-groups
```

Expected: FAIL because the current runtime implementation still reads `dependencies.modules` and does not support `getModules()`; the renderer source assertion also rejects `modules: platformModules()`.

- [ ] **Step 3: Change the dependency contract to a provider**

In `src/render/core/StartupGroupRuntime.ts`, replace the eager array property:

```typescript
export type StartupGroupRuntimeDependencies = {
  createId(): string
  getModules(): StartupGroupRuntimeModule[]
  getInstalled(module: AllAppModule): Promise<StartupGroupInstalledTarget[]>
  getProjects(module: AllAppModule): Promise<StartupGroupProjectTarget[]>
  pathExists(path: string): Promise<boolean>
}
```

- [ ] **Step 4: Resolve one stable module snapshot per candidate scan**

At the beginning of `listCandidates()` in `src/render/core/StartupGroupRuntime.ts`, obtain the provider result and use it for all three module lookups:

```typescript
  const listCandidates = async (): Promise<StartupGroupCandidate[]> => {
    const candidates: StartupGroupCandidate[] = []
    const modules = dependencies.getModules()
    const serviceModules = modules.filter(
      (module) => module.isService && module.moduleType !== 'language'
    )
    const phpFpm = modules.find((module) => module.typeFlag === 'php-fpm')
    if (phpFpm) serviceModules.push(phpFpm)

    for (const module of serviceModules) {
      const installed = await dependencies.getInstalled(
        module.typeFlag === 'php-fpm' ? 'php' : module.typeFlag
      )
      for (const target of installed.filter((item) => item.enable)) {
        const item: StartupGroupItem = {
          id: dependencies.createId(),
          type: 'service-version',
          module: module.typeFlag,
          versionBin: target.bin,
          versionPath: target.path
        }
        const label = moduleLabel(module)
        candidates.push({
          key: getStartupGroupItemKey(item),
          label: `${label} ${target.version || target.bin}`,
          moduleLabel: label,
          item,
          port: target.port
        })
      }
    }

    for (const module of modules.filter((item) => item.moduleType === 'language')) {
      const projects = await projectsFor(module.typeFlag)
      for (const project of projects.filter((item) => item.isService)) {
        const item: StartupGroupItem = {
          id: dependencies.createId(),
          type: 'language-project',
          module: module.typeFlag,
          projectId: project.id,
          projectPath: project.path
        }
        candidates.push({
          key: getStartupGroupItemKey(item),
          label: project.comment || project.path,
          moduleLabel: moduleLabel(module),
          item,
          port: project.projectPort
        })
      }
    }

    return candidates
  }
```

Do not cache `modules` outside `listCandidates()`: later calls must recover after `window.Server` becomes ready.

- [ ] **Step 5: Pass the renderer platform function without invoking it**

In `src/render/components/StartupGroup/runtime.ts`, update the runtime construction:

```typescript
export const startupGroupRuntime = createStartupGroupRuntime({
  createId: uuid,
  getModules: platformModules,
  getInstalled: async (module: AllAppModule) => {
    const manager = BrewStore().module(module)
    await manager.fetchInstalled()
    return manager.installed
  },
  getProjects: async (module: AllAppModule) => {
    const project = ProjectSetup(module)
    if (!project.fetched) {
      await project.fetchProject()
    }
    return project.project
  },
  pathExists: (path: string) => fs.existsSync(path)
})
```

- [ ] **Step 6: Run the focused test and verify GREEN**

Run:

```bash
yarn test:startup-groups
```

Expected: PASS with `startup group tests passed`.

- [ ] **Step 7: Run formatting and static verification**

Run:

```bash
npx prettier --check scripts/startup-group-test.ts src/render/core/StartupGroupRuntime.ts src/render/components/StartupGroup/runtime.ts
npx eslint scripts/startup-group-test.ts src/render/core/StartupGroupRuntime.ts src/render/components/StartupGroup/runtime.ts
npx vue-tsc --noEmit -p tsconfig.json
```

Expected: all commands exit with status 0 and report no new formatting, lint, or type errors. If the repository-wide type check reports pre-existing unrelated failures, record those exact failures and confirm none reference the three changed files.

- [ ] **Step 8: Review the final diff**

Run:

```bash
git diff --check
git diff -- scripts/startup-group-test.ts src/render/core/StartupGroupRuntime.ts src/render/components/StartupGroup/runtime.ts
```

Expected: no whitespace errors; the diff contains only the lazy provider regression and the two minimal runtime changes.

- [ ] **Step 9: Commit the implementation**

```bash
git add scripts/startup-group-test.ts src/render/core/StartupGroupRuntime.ts src/render/components/StartupGroup/runtime.ts
git commit -m "fix: resolve startup group platform modules lazily"
```
