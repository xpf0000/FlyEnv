import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as ProcessTools from '../src/shared/Process'
import * as StartupGroupCore from '../src/render/core/StartupGroup'
import * as StartupGroupRuntimeCore from '../src/render/core/StartupGroupRuntime'

import {
  buildStartupGroupStopQueue,
  createStartupGroup,
  createStartupGroupRunner,
  deleteStartupGroup,
  getStartupGroupCardState,
  getStartupGroupItemKey,
  normalizeStartupGroupConfig,
  resolveDefaultStartupGroup,
  setDefaultStartupGroup,
  updateStartupGroup,
  type StartupGroup,
  type StartupGroupAdapter,
  type StartupGroupItem,
  type StartupGroupMemberState
} from '../src/render/core/StartupGroup'
import {
  getStartupGroupCandidateWarnings,
  createStartupGroupRuntime,
  type StartupGroupInstalledTarget,
  type StartupGroupProjectTarget
} from '../src/render/core/StartupGroupRuntime'
import { resolveGroupExecutionRoute } from '../src/render/components/Aside/groupService'
import {
  canSetModuleVisibility,
  registerModuleVisibilityGuard
} from '../src/render/core/ModuleVisibility'

const mysql: StartupGroupItem = {
  id: 'mysql',
  type: 'service-version',
  module: 'mysql',
  versionBin: 'mysqld',
  versionPath: 'D:/mysql/8.4'
}

const redis: StartupGroupItem = {
  id: 'redis',
  type: 'service-version',
  module: 'redis',
  versionBin: 'redis-server',
  versionPath: 'D:/redis/7'
}

const api: StartupGroupItem = {
  id: 'api',
  type: 'language-project',
  module: 'node',
  projectId: 'project-api',
  projectPath: 'D:/projects/api'
}

function makeGroup(id: string, items: StartupGroupItem[]): StartupGroup {
  return {
    id,
    name: id,
    items,
    createdAt: 1,
    updatedAt: 1
  }
}

{
  const calls: string[] = []
  const states: Record<string, StartupGroupMemberState> = {
    mysql: 'running',
    redis: 'stopped',
    api: 'stopped'
  }
  const adapter: StartupGroupAdapter = {
    exists: async () => true,
    getState: async (item) => states[item.id],
    start: async (item) => {
      calls.push(`start:${item.id}`)
      if (item.id === 'redis') throw new Error('redis port is occupied')
    },
    stop: async () => undefined
  }

  const result = await createStartupGroupRunner(() => adapter).run(
    makeGroup('start', [mysql, redis, api]),
    'start'
  )

  assert.deepEqual(calls, ['start:redis'])
  assert.deepEqual(
    result.members.map((item) => item.outcome),
    ['skipped', 'failed', 'not-run']
  )
  assert.equal(result.members[1].error, 'redis port is occupied')
}

{
  let releaseStart!: () => void
  let markStarted!: () => void
  const startGate = new Promise<void>((resolve) => {
    releaseStart = resolve
  })
  const started = new Promise<void>((resolve) => {
    markStarted = resolve
  })
  const adapter: StartupGroupAdapter = {
    exists: async () => true,
    getState: async () => 'stopped',
    start: async () => {
      markStarted()
      await startGate
    },
    stop: async () => undefined
  }
  const runner = createStartupGroupRunner(() => adapter)
  const initialRevision = runner.revision?.value
  const runPromise = runner.run(makeGroup('reactive', [redis]), 'start')
  await started
  assert.equal(runner.executing?.value, true)
  assert.equal(await runner.getItemState(redis), 'executing')
  assert.ok((runner.revision?.value ?? 0) > (initialRevision ?? 0))
  releaseStart()
  await runPromise
  assert.equal(runner.executing?.value, false)
}

{
  const calls: string[] = []
  const adapter: StartupGroupAdapter = {
    exists: async () => true,
    getState: async () => 'running',
    start: async () => undefined,
    stop: async (item) => {
      calls.push(`stop:${item.id}`)
      if (item.id === 'redis') throw new Error('redis did not stop')
    }
  }

  const result = await createStartupGroupRunner(() => adapter).run(
    makeGroup('stop', [mysql, redis, api]),
    'stop'
  )

  assert.deepEqual(calls, ['stop:api', 'stop:redis', 'stop:mysql'])
  assert.deepEqual(
    result.members.map((item) => item.outcome),
    ['stopped', 'failed', 'stopped']
  )
}

{
  const queue = buildStartupGroupStopQueue([
    makeGroup('first', [mysql, redis]),
    makeGroup('second', [redis, api])
  ])
  assert.deepEqual(
    queue.map((item) => item.id),
    ['redis', 'mysql', 'api']
  )
}

{
  assert.equal(typeof StartupGroupCore.stopStartupGroupsForHide, 'function')
  const calls: string[] = []
  const states: Record<string, StartupGroupMemberState> = {
    mysql: 'executing',
    redis: 'running'
  }
  const adapter: StartupGroupAdapter = {
    exists: async () => true,
    getState: async (item) => states[item.id],
    start: async () => undefined,
    stop: async (item) => {
      calls.push(item.id)
      states[item.id] = 'stopped'
    }
  }
  const runner = createStartupGroupRunner(() => adapter)
  const busy = await StartupGroupCore.stopStartupGroupsForHide(
    [makeGroup('hide', [mysql, redis])],
    runner
  )
  assert.equal(busy.ok, false)
  assert.equal(busy.reason, 'member-busy')
  assert.equal(calls.length, 0)

  states.mysql = 'running'
  states.redis = 'running'
  const stuckAdapter: StartupGroupAdapter = {
    ...adapter,
    stop: async (item) => {
      calls.push(item.id)
      if (item.id !== 'redis') states[item.id] = 'stopped'
    }
  }
  const stuck = await StartupGroupCore.stopStartupGroupsForHide(
    [makeGroup('hide', [mysql, redis])],
    createStartupGroupRunner(() => stuckAdapter)
  )
  assert.equal(stuck.ok, false)
  assert.equal(stuck.reason, 'not-stopped')
  assert.deepEqual(
    stuck.remaining.map((item) => item.item.id),
    ['redis']
  )
}

{
  assert.equal(typeof ProcessTools.ProcessOwnedPidsByMarkers, 'function')
  const processes = [
    { PID: '10', PPID: '1', USER: 'dev', COMMAND: 'D:/mysql/8.0/bin/mysqld.exe' },
    { PID: '11', PPID: '10', USER: 'dev', COMMAND: 'mysql worker' },
    { PID: '20', PPID: '1', USER: 'dev', COMMAND: 'D:/mysql/8.4/bin/mysqld.exe' },
    { PID: '21', PPID: '20', USER: 'dev', COMMAND: 'mysql worker' }
  ]
  assert.deepEqual(ProcessTools.ProcessOwnedPidsByMarkers(['D:/mysql/8.4'], processes, false), [
    '20',
    '21'
  ])
}

{
  assert.equal(getStartupGroupCardState([]), 'stopped')
  assert.equal(getStartupGroupCardState(['running', 'running']), 'running')
  assert.equal(getStartupGroupCardState(['stopped', 'stopped']), 'stopped')
  assert.equal(getStartupGroupCardState(['running', 'stopped']), 'partial-running')
  assert.equal(getStartupGroupCardState(['running', 'executing']), 'executing')
  assert.equal(getStartupGroupCardState(['executing', 'invalid']), 'invalid')
}

{
  const empty = makeGroup('empty', [])
  const groupA = makeGroup('a', [mysql])
  const groupB = makeGroup('b', [redis])
  const config = { groups: [empty, groupA, groupB], defaultStartupGroupId: 'a' }

  assert.equal(resolveDefaultStartupGroup(config)?.id, 'a')
  assert.equal(setDefaultStartupGroup(config, 'b').defaultStartupGroupId, 'b')
  assert.equal(setDefaultStartupGroup(config, 'empty').defaultStartupGroupId, undefined)
  assert.equal(setDefaultStartupGroup(config).defaultStartupGroupId, undefined)
  assert.equal(
    resolveDefaultStartupGroup({ ...config, defaultStartupGroupId: 'missing' }),
    undefined
  )
}

{
  assert.deepEqual(normalizeStartupGroupConfig(undefined), { groups: [] })
  assert.deepEqual(
    normalizeStartupGroupConfig({
      groups: [makeGroup('empty', [])],
      defaultStartupGroupId: 'empty'
    }),
    { groups: [makeGroup('empty', [])] }
  )
}

{
  const startCalls: Array<{ id: string; options?: unknown }> = []
  const stopCalls: Array<{ id: string; options?: unknown }> = []
  const projectCalls: string[] = []
  let projectLoadCalls = 0
  const existingProjectPaths = new Set(['D:/projects/api'])
  const projectTarget: StartupGroupProjectTarget = {
    id: 'project-api',
    comment: 'API Server',
    path: 'D:/projects/api',
    isService: true,
    state: { isRun: false, running: false },
    start: async (showMessage) => {
      projectCalls.push(`start:project-api:${showMessage}`)
      return true
    },
    stop: async (showMessage) => {
      projectCalls.push(`stop:project-api:${showMessage}`)
      return true
    }
  }
  const current: StartupGroupInstalledTarget = {
    id: 'current',
    version: '8.0',
    bin: 'mysqld',
    path: 'D:/mysql/8.0',
    enable: true,
    run: true,
    running: false,
    start: async (options) => {
      startCalls.push({ id: 'current', options })
      return true
    },
    stop: async (options) => {
      stopCalls.push({ id: 'current', options })
      return true
    }
  }
  const target: StartupGroupInstalledTarget = {
    id: 'target',
    version: '8.4',
    bin: 'mysqld',
    path: 'D:/mysql/8.4',
    enable: true,
    run: false,
    running: false,
    start: async (options) => {
      startCalls.push({ id: 'target', options })
      return true
    },
    stop: async (options) => {
      stopCalls.push({ id: 'target', options })
      return true
    }
  }

  let moduleLoadCalls = 0
  const getModules = () => {
    moduleLoadCalls += 1
    return [
      {
        typeFlag: 'mysql' as const,
        moduleType: 'dataBaseServer' as const,
        label: 'MySQL',
        isService: true
      },
      {
        typeFlag: 'node' as const,
        moduleType: 'language' as const,
        label: 'NodeJS',
        isService: true
      },
      {
        typeFlag: 'php-fpm' as const,
        moduleType: 'language' as const,
        label: 'PHP-FPM',
        isService: true
      }
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

  await runtime.getAdapter(mysql)?.start(mysql)
  await runtime.getAdapter(mysql)?.stop(mysql)

  assert.deepEqual(startCalls, [
    {
      id: 'target',
      options: { updateCurrent: false, stopOtherVersions: false, exactTarget: true }
    }
  ])
  assert.deepEqual(stopCalls, [{ id: 'target', options: { exactTarget: true } }])
  const missingVersion = { ...mysql, versionPath: 'D:/missing' }
  assert.equal(await runtime.getAdapter(missingVersion)?.exists(missingVersion), false)

  await runtime.getAdapter(api)?.start(api)
  await runtime.getAdapter(api)?.stop(api)
  assert.deepEqual(projectCalls, ['start:project-api:false', 'stop:project-api:false'])
  assert.equal(projectLoadCalls, 1)
  const movedProject = { ...api, projectPath: 'D:/projects/api-moved' }
  assert.equal(await runtime.getAdapter(movedProject)?.exists(movedProject), false)
  existingProjectPaths.delete(api.projectPath)
  assert.equal(await runtime.getAdapter(api)?.exists(api), false)
  existingProjectPaths.add(api.projectPath)
  assert.equal(
    await runtime
      .getAdapter({ ...api, projectId: 'missing' })
      ?.exists({ ...api, projectId: 'missing' }),
    false
  )

  const candidates = await runtime.listCandidates()
  assert.equal(moduleLoadCalls, 1)
  assert.deepEqual(
    candidates.map((candidate) => [candidate.item.module, candidate.label]),
    [
      ['mysql', 'MySQL 8.0'],
      ['mysql', 'MySQL 8.4'],
      ['php-fpm', 'PHP-FPM 8.4.8'],
      ['node', 'API Server']
    ]
  )
}

{
  const initial = { groups: [] }
  const created = createStartupGroup(
    initial,
    { name: 'Backend', description: 'API stack', color: '#409eff', items: [mysql, api] },
    'group-backend',
    100
  )
  assert.equal(created.group.id, 'group-backend')
  assert.equal(created.group.createdAt, 100)
  assert.deepEqual(
    created.group.items.map((item) => item.id),
    ['mysql', 'api']
  )

  const updated = updateStartupGroup(
    created.config,
    'group-backend',
    { name: 'Backend v2', items: [api, mysql] },
    200
  )
  assert.equal(updated.groups[0].createdAt, 100)
  assert.equal(updated.groups[0].updatedAt, 200)
  assert.deepEqual(
    updated.groups[0].items.map((item) => item.id),
    ['api', 'mysql']
  )

  const emptied = updateStartupGroup(
    { ...updated, defaultStartupGroupId: 'group-backend' },
    'group-backend',
    { name: 'Empty backend', items: [] },
    300
  )
  assert.equal(emptied.defaultStartupGroupId, undefined)

  const deleted = deleteStartupGroup(
    { ...updated, defaultStartupGroupId: 'group-backend' },
    'group-backend'
  )
  assert.deepEqual(deleted, { groups: [] })
}

{
  const runtimeCandidates = [
    {
      key: 'mysql-80',
      label: 'MySQL 8.0',
      moduleLabel: 'MySQL',
      item: { ...mysql, id: 'mysql-80', versionPath: 'D:/mysql/8.0' },
      port: 3306
    },
    {
      key: 'mysql-84',
      label: 'MySQL 8.4',
      moduleLabel: 'MySQL',
      item: { ...mysql, id: 'mysql-84' },
      port: 3307
    },
    {
      key: 'redis-7',
      label: 'Redis 7',
      moduleLabel: 'Redis',
      item: redis,
      port: 3306
    }
  ]
  const warnings = getStartupGroupCandidateWarnings(runtimeCandidates, [
    'mysql-80',
    'mysql-84',
    'redis-7'
  ])
  assert.deepEqual(warnings.get('mysql-80'), ['same-module', 'same-port'])
  assert.deepEqual(warnings.get('mysql-84'), ['same-module'])
  assert.deepEqual(warnings.get('redis-7'), ['same-port'])
}

{
  assert.equal(typeof StartupGroupRuntimeCore.startupGroupCandidateMatchesItem, 'function')
  const candidate = {
    key: 'node-project-api',
    label: 'API Server',
    moduleLabel: 'NodeJS',
    item: api
  }
  assert.equal(StartupGroupRuntimeCore.startupGroupCandidateMatchesItem(candidate, api), true)
  assert.equal(
    StartupGroupRuntimeCore.startupGroupCandidateMatchesItem(candidate, {
      ...api,
      projectPath: 'D:/projects/api-moved'
    }),
    false
  )

  assert.equal(typeof StartupGroupRuntimeCore.syncStartupGroupSelectedItems, 'function')
  const synced = StartupGroupRuntimeCore.syncStartupGroupSelectedItems(
    [mysql, api, redis],
    [
      { key: getStartupGroupItemKey(mysql), label: 'MySQL', moduleLabel: 'DB', item: mysql },
      { key: getStartupGroupItemKey(redis), label: 'Redis', moduleLabel: 'DB', item: redis }
    ],
    [getStartupGroupItemKey(mysql), getStartupGroupItemKey(redis)],
    () => 'new-id'
  )
  assert.deepEqual(
    synced.map((item) => item.id),
    ['mysql', 'api', 'redis']
  )
}

{
  const readSource = (relativePath: string) =>
    readFileSync(new URL('../' + relativePath, import.meta.url), 'utf8')
  const typeSource = readSource('src/render/core/type.ts')
  const moduleSource = readSource('src/render/components/StartupGroup/Module.ts')
  const indexSource = readSource('src/render/components/StartupGroup/Index.vue')
  const editorSource = readSource('src/render/components/StartupGroup/GroupEditor.vue')
  const cardSource = readSource('src/render/components/StartupGroup/GroupCard.vue')
  const asideSource = readSource('src/render/components/Aside/Index.vue')
  const showHideSource = readSource('src/render/components/Setup/ModuleShowHide/index.vue')
  const moduleItemSource = readSource('src/render/components/Setup/Module/moduleItem.vue')
  const setupModuleSource = readSource('src/render/components/Setup/Module/index.vue')
  const installedItemSource = readSource('src/render/core/Module/ModuleInstalledItem.ts')
  const forkBaseSource = readSource('src/fork/module/Base/index.ts')
  const projectSource = readSource('src/render/components/LanguageProjects/Project.ts')
  const startupRuntimeSource = readSource('src/render/components/StartupGroup/runtime.ts')
  const mysqlForkSource = readSource('src/fork/module/Mysql/index.ts')
  const mariaDBForkSource = readSource('src/fork/module/Mariadb/index.ts')
  const postgreSQLForkSource = readSource('src/fork/module/Postgresql/index.ts')
  const mongoDBForkSource = readSource('src/fork/module/Mongodb/index.ts')
  assert.match(typeSource, /console = 'console'/)
  assert.match(typeSource, /'startup-group' = 'startup-group'/)
  assert.match(moduleSource, /moduleType: 'console'/)
  assert.match(moduleSource, /typeFlag: 'startup-group'/)
  assert.match(editorSource, /<el-steps/)
  assert.match(editorSource, /<draggable/)
  assert.match(editorSource, /item-key="id"/)
  assert.match(cardSource, /default-change/)
  assert.match(
    indexSource,
    /const busy = computed\(\(\) => startupGroupRuntime\.runner\.executing\.value\)/
  )
  assert.match(indexSource, /:busy="busy"/)
  assert.match(indexSource, /let refreshGeneration = 0/)
  assert.match(indexSource, /let refreshInFlight: Promise<void> \| undefined/)
  assert.match(indexSource, /while \(refreshQueued\)/)
  assert.match(indexSource, /startupGroupRuntime\.runner\.revision\.value/)
  assert.match(indexSource, /window\.setInterval\(\(\) => refreshAll\(false\), 2000\)/)
  assert.match(asideSource, /const legacyGroupDo =/)
  assert.match(asideSource, /resolveGroupExecutionRoute/)
  assert.match(asideSource, /startupGroupRuntime\.runner\.run/)
  assert.match(asideSource, /let startupGroupRefreshGeneration = 0/)
  assert.match(asideSource, /let startupGroupRefreshInFlight: Promise<void> \| undefined/)
  assert.match(asideSource, /while \(startupGroupRefreshQueued\)/)
  assert.match(asideSource, /startupGroupRuntime\.runner\.revision\.value/)
  assert.match(
    asideSource,
    /window\.setInterval\([\s\S]*refreshStartupGroupState\(\)\.catch\(\)[\s\S]*2000/
  )
  assert.match(moduleSource, /registerModuleVisibilityGuard/)
  assert.match(moduleSource, /stopStartupGroupsForHide/)
  assert.ok(
    moduleSource.indexOf('ElMessageBox.confirm') <
      moduleSource.indexOf('const stopped = await stopStartupGroupsForHide')
  )
  assert.match(showHideSource, /canSetModuleVisibility/)
  assert.match(moduleItemSource, /canSetModuleVisibility/)
  assert.match(asideSource, /consoleItem\.value, firstItem\.value/)
  assert.match(setupModuleSource, /:item="consoleItem"/)
  assert.match(installedItemSource, /startServiceExact/)
  assert.match(installedItemSource, /stopServiceExact/)
  assert.match(installedItemSource, /this\.run = options\.exactTarget === true/)
  assert.match(installedItemSource, /resolve\(options\?\.exactTarget \? `\$\{error\}` : true\)/)
  assert.match(forkBaseSource, /startServiceExact/)
  assert.match(forkBaseSource, /stopServiceExact/)
  assert.match(forkBaseSource, /_stopServerExactGracefully/)
  assert.ok(
    forkBaseSource.indexOf('await this._stopServerExactGracefully') <
      forkBaseSource.indexOf('await ProcessKillStrict')
  )
  assert.match(forkBaseSource, /ProcessKillStrict/)
  assert.match(forkBaseSource, /for \(let attempt = 0; attempt < 20; attempt \+= 1\)/)
  assert.match(forkBaseSource, /throw new Error\(`Failed to stop exact service target:/)
  assert.match(projectSource, /fetched = false/)
  assert.match(startupRuntimeSource, /if \(!project\.fetched\)/)
  assert.match(startupRuntimeSource, /getModules:\s*platformModules/)
  assert.doesNotMatch(startupRuntimeSource, /modules:\s*platformModules\(\)/)
  assert.match(mysqlForkSource, /_stopServerExactGracefully/)
  assert.match(mariaDBForkSource, /_stopServerExactGracefully/)
  assert.match(postgreSQLForkSource, /_stopServerExactGracefully/)
  assert.match(mongoDBForkSource, /_stopServerExactGracefully/)
}

{
  const defaultGroup = makeGroup('default', [mysql])
  assert.equal(resolveGroupExecutionRoute(true, defaultGroup), 'startup-group')
  assert.equal(resolveGroupExecutionRoute(true, undefined), 'legacy')
  assert.equal(resolveGroupExecutionRoute(false, defaultGroup), 'legacy')
}

{
  const calls: boolean[] = []
  const unregister = registerModuleVisibilityGuard('startup-group', async (visible) => {
    calls.push(visible)
    return visible
  })
  assert.equal(await canSetModuleVisibility('startup-group', false), false)
  assert.equal(await canSetModuleVisibility('startup-group', true), true)
  assert.deepEqual(calls, [false, true])
  unregister()
  assert.equal(await canSetModuleVisibility('startup-group', false), true)
}

console.log('startup group tests passed')
