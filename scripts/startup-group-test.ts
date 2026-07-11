import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import {
  resolveGroupAutoStartAction,
  resolveGroupExecutionRoute
} from '../src/render/components/Aside/groupService'
import {
  canSetModuleVisibility,
  registerModuleVisibilityGuard
} from '../src/render/core/ModuleVisibility'
import { StartupGroup as StartupGroupEntity } from '../src/render/components/StartupGroup/class/StartupGroup'
import { StartupGroupRunner as StartupGroupRunnerClass } from '../src/render/components/StartupGroup/class/StartupGroupRunner'
import { StartupGroupCandidate as StartupGroupCandidateClass } from '../src/render/components/StartupGroup/class/StartupGroupCandidate'
import { StartupGroupRuntime as StartupGroupRuntimeClass } from '../src/render/components/StartupGroup/class/StartupGroupRuntime'
import { StartupGroupStore as StartupGroupStoreClass } from '../src/render/components/StartupGroup/class/StartupGroupStore'
import type {
  StartupGroupAdapter,
  StartupGroupCandidateData,
  StartupGroupConfigData,
  StartupGroupInstalledTarget,
  StartupGroupItem,
  StartupGroupMemberState,
  StartupGroupProjectTarget,
  StartupGroupRuntimeModule,
  StartupGroupRunnerContract
} from '../src/render/components/StartupGroup/type'

type StartupGroup = StartupGroupEntity
type StartupGroupCandidate = StartupGroupCandidateData

const createStartupGroupRunner = (
  getAdapter: (item: StartupGroupItem) => StartupGroupAdapter | undefined
) => new StartupGroupRunnerClass(getAdapter)
const createStartupGroupRuntime = (
  dependencies: ConstructorParameters<typeof StartupGroupRuntimeClass>[0]
) => new StartupGroupRuntimeClass(dependencies)
const candidateTools = new StartupGroupCandidateClass(() => 'candidate-id')
const getStartupGroupItemKey = StartupGroupEntity.itemKey
const getStartupGroupCardState = (states: StartupGroupMemberState[]) =>
  new StartupGroupRunnerClass(() => undefined).cardState(states)
const buildStartupGroupStopQueue = (groups: StartupGroup[]) =>
  new StartupGroupRunnerClass(() => undefined).buildStopQueue(groups)
const startupGroupCandidateAllowsMultiple = (candidate: StartupGroupCandidate) =>
  candidateTools.allowsMultiple(candidate)
const updateStartupGroupCandidateSelection = (
  selectedKeys: string[],
  candidate: StartupGroupCandidate,
  candidates: StartupGroupCandidate[],
  selected: boolean
) => candidateTools.updateSelection(selectedKeys, candidate, candidates, selected)
const toggleStartupGroupCandidateSelection = (
  selectedKeys: string[],
  candidate: StartupGroupCandidate,
  candidates: StartupGroupCandidate[]
) => candidateTools.toggleSelection(selectedKeys, candidate, candidates)
const normalizeStartupGroupCandidateSelection = (
  selectedKeys: string[],
  candidates: StartupGroupCandidate[]
) => candidateTools.normalizeSelection(selectedKeys, candidates)
const filterValidStartupGroupItems = (
  items: StartupGroupItem[],
  candidates: StartupGroupCandidate[]
) => candidateTools.filterValidItems(items, candidates)
const getStartupGroupCandidateWarnings = (
  candidates: StartupGroupCandidate[],
  selectedKeys: string[]
) => candidateTools.warnings(candidates, selectedKeys)

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

const testRunner: StartupGroupRunnerContract = {
  executing: false,
  revision: 0,
  getItemState: async () => 'stopped',
  getGroupState: async () => 'stopped',
  run: async (_group, action) => ({ action, members: [] })
}

function makeGroup(id: string, items: StartupGroupItem[]): StartupGroup {
  return new StartupGroupEntity({ id, name: id, items, createdAt: 1, updatedAt: 1 }, testRunner)
}

{
  const calls: string[] = []
  const runner: StartupGroupRunnerContract = {
    executing: false,
    revision: 0,
    getItemState: async (item) => (item.id === 'mysql' ? 'running' : 'stopped'),
    getGroupState: async () => 'stopped',
    run: async (_group, action) => {
      calls.push(action)
      return { action, members: [] }
    }
  }
  const group = new StartupGroupEntity(
    { id: 'dev', name: 'Dev', items: [mysql, redis], createdAt: 1, updatedAt: 1 },
    runner
  )
  assert.equal(group.empty, false)
  assert.equal(group.canBeDefault, true)
  assert.deepEqual(group.itemKeys, [
    'service-version:mysql:D:/mysql/8.4',
    'service-version:redis:D:/redis/7'
  ])
  assert.deepEqual(
    group.stopItems.map((item) => item.id),
    ['redis', 'mysql']
  )
  group.update({ name: 'Local', items: [api] }, 2)
  assert.equal(group.name, 'Local')
  assert.equal(group.updatedAt, 2)
  assert.deepEqual(group.toJSON(), {
    id: 'dev',
    name: 'Local',
    description: undefined,
    color: undefined,
    items: [api],
    createdAt: 1,
    updatedAt: 2
  })
  await group.start()
  await group.stop()
  await group.toggle()
  assert.deepEqual(calls, ['start', 'stop', 'start'])
}

{
  const runner = new StartupGroupRunnerClass(() => ({
    exists: async () => true,
    getState: async () => 'stopped',
    start: async () => undefined,
    stop: async () => undefined
  }))
  assert.equal(runner.executing, false)
  assert.equal(runner.revision, 0)
  assert.equal(runner.cardState(['running', 'stopped']), 'partial-running')
  assert.deepEqual(
    runner
      .buildStopQueue([
        new StartupGroupEntity(makeGroup('first', [mysql, redis]), runner),
        new StartupGroupEntity(makeGroup('second', [redis, api]), runner)
      ])
      .map((item) => item.id),
    ['redis', 'mysql', 'api']
  )
}

{
  const candidate = new StartupGroupCandidateClass(() => 'candidate-id')
  assert.equal(typeof candidate.toggleSelection, 'function')
  const runtime = new StartupGroupRuntimeClass({
    createId: () => 'runtime-id',
    getModules: () => [],
    getInstalled: async () => [],
    getProjects: async () => [],
    pathExists: async () => true
  })
  assert.ok(runtime.runner instanceof StartupGroupRunnerClass)
  assert.deepEqual(await runtime.listCandidates(), [])
}

{
  const writes: StartupGroupConfigData[] = []
  const storeRunner: StartupGroupRunnerContract = {
    executing: false,
    revision: 0,
    getItemState: async () => 'stopped',
    getGroupState: async () => 'stopped',
    run: async (_group, action) => ({ action, members: [] })
  }
  const store = new StartupGroupStoreClass(storeRunner, {
    createId: () => 'created',
    now: () => 10,
    get: async () => ({
      groups: [{ id: 'saved', name: 'Saved', items: [mysql], createdAt: 1, updatedAt: 1 }],
      defaultStartupGroupId: 'saved'
    }),
    set: async (value) => {
      writes.push(value)
    }
  })
  await store.init()
  assert.ok(store.groups[0] instanceof StartupGroupEntity)
  assert.equal(store.defaultGroup?.id, 'saved')
  const created = await store.add({ name: 'Created', items: [redis] })
  assert.ok(created instanceof StartupGroupEntity)
  assert.deepEqual(writes.at(-1)?.groups.at(-1), JSON.parse(JSON.stringify(created.toJSON())))
  await store.setDefault('created')
  await store.update('created', { name: 'Updated', items: [api] })
  assert.equal(store.find('created')?.name, 'Updated')
  await store.remove('created')
  assert.equal(store.find('created'), undefined)
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
  const initialRevision = runner.revision
  const runPromise = runner.run(makeGroup('reactive', [redis]), 'start')
  await started
  assert.equal(runner.executing, true)
  assert.equal(await runner.getItemState(redis), 'executing')
  assert.ok(runner.revision > initialRevision)
  releaseStart()
  await runPromise
  assert.equal(runner.executing, false)
}

{
  const calls: string[] = []
  const states: Record<string, StartupGroupMemberState> = {
    mysql: 'running',
    redis: 'running',
    api: 'running'
  }
  const adapter: StartupGroupAdapter = {
    exists: async () => true,
    getState: async (item) => states[item.id],
    start: async () => undefined,
    stop: async (item) => {
      calls.push(`stop:${item.id}`)
      if (item.id === 'redis') throw new Error('redis did not stop')
      states[item.id] = 'stopped'
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
  const adapter: StartupGroupAdapter = {
    exists: async () => true,
    getState: async () => 'running',
    start: async () => undefined,
    stop: async () => undefined
  }

  const result = await createStartupGroupRunner(() => adapter).run(
    makeGroup('stop-native-result', [mysql]),
    'stop'
  )

  assert.equal(result.members[0].outcome, 'stopped')
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
  const busy = await runner.stopForHide([makeGroup('hide', [mysql, redis])])
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
  const stuck = await createStartupGroupRunner(() => stuckAdapter).stopForHide([
    makeGroup('hide', [mysql, redis])
  ])
  assert.equal(stuck.ok, false)
  assert.equal(stuck.reason, 'not-stopped')
  assert.deepEqual(
    stuck.remaining.map((item) => item.item.id),
    ['redis']
  )
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
  const missingProjectTarget: StartupGroupProjectTarget = {
    ...projectTarget,
    id: 'project-missing',
    comment: 'Missing Service',
    path: 'D:/projects/missing'
  }
  const current: StartupGroupInstalledTarget = {
    id: 'current',
    version: '8.0',
    bin: 'mysqld',
    path: 'D:/mysql/8.0',
    enable: true,
    run: true,
    running: false,
    start: async () => {
      startCalls.push({ id: 'current', options: undefined })
      return true
    },
    stop: async () => {
      stopCalls.push({ id: 'current', options: undefined })
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
    start: async () => {
      startCalls.push({ id: 'target', options: undefined })
      return true
    },
    stop: async () => {
      stopCalls.push({ id: 'target', options: undefined })
      return true
    }
  }

  const runtimeModules: StartupGroupRuntimeModule[] = [
    {
      typeFlag: 'mysql',
      moduleType: 'dataBaseServer',
      label: 'MySQL',
      isService: true
    },
    {
      typeFlag: 'node',
      moduleType: 'language',
      label: 'NodeJS',
      isService: true
    },
    {
      typeFlag: 'php-fpm',
      moduleType: 'language',
      label: 'PHP-FPM',
      isService: true
    }
  ]
  let availableModules: StartupGroupRuntimeModule[] = []
  let moduleLoadCalls = 0
  const getModules = () => {
    moduleLoadCalls += 1
    return availableModules
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
      return module === 'node' ? [projectTarget, missingProjectTarget] : []
    },
    pathExists: async (path) => existingProjectPaths.has(path)
  })

  assert.equal(moduleLoadCalls, 0)

  await runtime.getAdapter(mysql)?.start(mysql)
  await runtime.getAdapter(mysql)?.stop(mysql)

  assert.deepEqual(startCalls, [{ id: 'target', options: undefined }])
  assert.deepEqual(stopCalls, [{ id: 'target', options: undefined }])
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

  assert.deepEqual(await runtime.listCandidates(), [])
  assert.equal(moduleLoadCalls, 1)
  availableModules = runtimeModules
  existingProjectPaths.clear()
  const candidates = await runtime.listCandidates()
  assert.equal(moduleLoadCalls, 2)
  assert.deepEqual(
    candidates
      .filter((candidate) => candidate.item.module === 'node')
      .map((candidate) => candidate.displayName),
    ['API Server', 'Missing Service']
  )
  assert.deepEqual(
    candidates.map((candidate) => [candidate.item.module, candidate.label]),
    [
      ['mysql', 'MySQL 8.0'],
      ['mysql', 'MySQL 8.4'],
      ['php-fpm', 'PHP-FPM 8.4.8'],
      ['node', 'API Server'],
      ['node', 'Missing Service']
    ]
  )
  assert.deepEqual(
    candidates.map((candidate) => [
      candidate.item.module,
      candidate.moduleType,
      candidate.displayName,
      candidate.displayPath
    ]),
    [
      ['mysql', 'dataBaseServer', '8.0', 'D:/mysql/8.0'],
      ['mysql', 'dataBaseServer', '8.4', 'D:/mysql/8.4'],
      ['php-fpm', 'language', '8.4.8', 'D:/php/8.4.8'],
      ['node', 'language', 'API Server', 'D:/projects/api'],
      ['node', 'language', 'Missing Service', 'D:/projects/missing']
    ]
  )
}

{
  assert.equal(typeof startupGroupCandidateAllowsMultiple, 'function')
  assert.equal(typeof updateStartupGroupCandidateSelection, 'function')
  assert.equal(typeof filterValidStartupGroupItems, 'function')

  const makeCandidate = (
    key: string,
    item: StartupGroupItem,
    moduleType: StartupGroupCandidate['moduleType'],
    displayName: string,
    displayPath: string
  ): StartupGroupCandidate => ({
    key,
    label: displayName,
    moduleLabel: item.module,
    moduleType,
    displayName,
    displayPath,
    item
  })

  const mysql80 = makeCandidate(
    'mysql-80',
    { ...mysql, id: 'mysql-80', versionPath: 'D:/mysql/8.0' },
    'dataBaseServer',
    '8.0',
    'D:/mysql/8.0'
  )
  const mysql84 = makeCandidate(
    'mysql-84',
    { ...mysql, id: 'mysql-84' },
    'dataBaseServer',
    '8.4',
    'D:/mysql/8.4'
  )
  const php82 = makeCandidate(
    'php-fpm-82',
    { ...mysql, id: 'php-fpm-82', module: 'php-fpm', versionPath: 'D:/php/8.2' },
    'language',
    '8.2',
    'D:/php/8.2'
  )
  const php84 = makeCandidate(
    'php-fpm-84',
    { ...mysql, id: 'php-fpm-84', module: 'php-fpm', versionPath: 'D:/php/8.4' },
    'language',
    '8.4',
    'D:/php/8.4'
  )
  const nodeApi = makeCandidate('node-api', api, 'language', 'API Server', 'D:/projects/api')
  const nodeAdmin = makeCandidate(
    'node-admin',
    { ...api, id: 'admin', projectId: 'project-admin', projectPath: 'D:/projects/admin' },
    'language',
    'Admin Server',
    'D:/projects/admin'
  )
  const all = [mysql80, mysql84, php82, php84, nodeApi, nodeAdmin]

  assert.equal(startupGroupCandidateAllowsMultiple(mysql80), false)
  assert.equal(startupGroupCandidateAllowsMultiple(php82), true)
  assert.equal(startupGroupCandidateAllowsMultiple(nodeApi), true)

  let selected = updateStartupGroupCandidateSelection([], mysql80, all, true)
  selected = updateStartupGroupCandidateSelection(selected, mysql84, all, true)
  assert.deepEqual(selected, ['mysql-84'])

  selected = updateStartupGroupCandidateSelection(selected, php82, all, true)
  selected = updateStartupGroupCandidateSelection(selected, php84, all, true)
  assert.deepEqual(selected, ['mysql-84', 'php-fpm-82', 'php-fpm-84'])

  selected = updateStartupGroupCandidateSelection(selected, nodeApi, all, true)
  selected = updateStartupGroupCandidateSelection(selected, nodeAdmin, all, true)
  assert.deepEqual(selected, ['mysql-84', 'php-fpm-82', 'php-fpm-84', 'node-api', 'node-admin'])

  selected = updateStartupGroupCandidateSelection(selected, php82, all, false)
  assert.deepEqual(selected, ['mysql-84', 'php-fpm-84', 'node-api', 'node-admin'])

  assert.deepEqual(
    normalizeStartupGroupCandidateSelection(
      ['mysql-80', 'mysql-84', 'php-fpm-82', 'php-fpm-84', 'node-api', 'node-admin'],
      all
    ),
    ['mysql-84', 'php-fpm-82', 'php-fpm-84', 'node-api', 'node-admin']
  )

  assert.deepEqual(toggleStartupGroupCandidateSelection([], mysql84, all), ['mysql-84'])
  assert.deepEqual(toggleStartupGroupCandidateSelection(['mysql-84'], mysql84, all), [])
  assert.deepEqual(toggleStartupGroupCandidateSelection(['php-fpm-82'], php84, all), [
    'php-fpm-82',
    'php-fpm-84'
  ])

  const validMysql: StartupGroupCandidate = {
    key: getStartupGroupItemKey(mysql),
    label: 'MySQL 8.4',
    moduleLabel: 'MySQL',
    moduleType: 'dataBaseServer',
    displayName: '8.4',
    displayPath: mysql.versionPath,
    item: mysql
  }
  assert.deepEqual(
    filterValidStartupGroupItems(
      [mysql, { ...redis, versionPath: 'D:/redis/missing' }],
      [validMysql]
    ),
    [mysql]
  )
}

{
  const runtimeCandidates = [
    {
      key: 'mysql-80',
      label: 'MySQL 8.0',
      moduleLabel: 'MySQL',
      moduleType: 'dataBaseServer' as const,
      displayName: '8.0',
      displayPath: 'D:/mysql/8.0',
      item: { ...mysql, id: 'mysql-80', versionPath: 'D:/mysql/8.0' },
      port: 3306
    },
    {
      key: 'mysql-84',
      label: 'MySQL 8.4',
      moduleLabel: 'MySQL',
      moduleType: 'dataBaseServer' as const,
      displayName: '8.4',
      displayPath: 'D:/mysql/8.4',
      item: { ...mysql, id: 'mysql-84' },
      port: 3307
    },
    {
      key: 'redis-7',
      label: 'Redis 7',
      moduleLabel: 'Redis',
      moduleType: 'cacheAndQueue' as const,
      displayName: '7',
      displayPath: 'D:/redis/7',
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
  const candidate = {
    key: 'node-project-api',
    label: 'API Server',
    moduleLabel: 'NodeJS',
    moduleType: 'language' as const,
    displayName: 'API Server',
    displayPath: 'D:/projects/api',
    item: api
  }
  assert.equal(candidateTools.matchesItem(candidate, api), true)
  assert.equal(
    candidateTools.matchesItem(candidate, {
      ...api,
      projectPath: 'D:/projects/api-moved'
    }),
    false
  )

  const synced = new StartupGroupCandidateClass(() => 'new-id').syncSelectedItems(
    [mysql, api, redis],
    [
      {
        key: getStartupGroupItemKey(mysql),
        label: 'MySQL',
        moduleLabel: 'DB',
        moduleType: 'dataBaseServer',
        displayName: 'MySQL',
        displayPath: mysql.versionPath,
        item: mysql
      },
      {
        key: getStartupGroupItemKey(redis),
        label: 'Redis',
        moduleLabel: 'DB',
        moduleType: 'cacheAndQueue',
        displayName: 'Redis',
        displayPath: redis.versionPath,
        item: redis
      }
    ],
    [getStartupGroupItemKey(mysql), getStartupGroupItemKey(redis)]
  )
  assert.deepEqual(
    synced.map((item) => item.id),
    ['mysql', 'api', 'redis']
  )
}

{
  const readSource = (relativePath: string) =>
    readFileSync(new URL('../' + relativePath, import.meta.url), 'utf8')
  for (const relativePath of [
    'src/render/core/StartupGroup.ts',
    'src/render/core/StartupGroupManager.ts',
    'src/render/core/StartupGroupRuntime.ts',
    'src/render/components/StartupGroup/store.ts',
    'src/render/components/StartupGroup/runtime.ts',
    'src/render/components/StartupGroup/setup.ts'
  ]) {
    assert.equal(existsSync(new URL('../' + relativePath, import.meta.url)), false)
  }
  const typeSource = readSource('src/render/core/type.ts')
  const moduleSource = readSource('src/render/components/StartupGroup/Module.ts')
  const indexSource = readSource('src/render/components/StartupGroup/Index.vue')
  const editorSource = readSource('src/render/components/StartupGroup/GroupEditor.vue')
  const cardSource = readSource('src/render/components/StartupGroup/GroupCard.vue')
  const asideSource = readSource('src/render/components/Aside/Index.vue')
  const showHideSource = readSource('src/render/components/Setup/ModuleShowHide/index.vue')
  const moduleItemSource = readSource('src/render/components/Setup/Module/moduleItem.vue')
  const setupModuleSource = readSource('src/render/components/Setup/Module/index.vue')
  const moduleCoreSource = readSource('src/render/core/Module/Module.ts')
  const installedItemSource = readSource('src/render/core/Module/ModuleInstalledItem.ts')
  const forkBaseSource = readSource('src/fork/module/Base/index.ts')
  const projectSource = readSource('src/render/components/LanguageProjects/Project.ts')
  const startupRuntimeSource = readSource(
    'src/render/components/StartupGroup/class/StartupGroupRuntime.ts'
  )
  const startupRuntimeCoreSource = startupRuntimeSource
  const startupGroupAsideSource = readSource('src/render/components/StartupGroup/aside.vue')
  const startupGroupSetupSource = readSource(
    'src/render/components/StartupGroup/class/StartupGroupManager.ts'
  )
  const startupGroupStoreSource = readSource(
    'src/render/components/StartupGroup/class/StartupGroupStore.ts'
  )
  const startupGroupManagerSource = readSource(
    'src/render/components/StartupGroup/class/StartupGroupManager.ts'
  )
  const routerSource = readSource('src/render/router/index.ts')
  const appStoreSource = readSource('src/render/store/app.ts')
  const mysqlForkSource = readSource('src/fork/module/Mysql/index.ts')
  const mariaDBForkSource = readSource('src/fork/module/Mariadb/index.ts')
  const postgreSQLForkSource = readSource('src/fork/module/Postgresql/index.ts')
  const mongoDBForkSource = readSource('src/fork/module/Mongodb/index.ts')
  const processSource = readSource('src/shared/Process.ts')
  const enCommonSource = readSource('src/lang/en/common.json')
  const zhCommonSource = readSource('src/lang/zh/common.json')
  assert.match(typeSource, /console = 'console'/)
  assert.match(typeSource, /'startup-group' = 'startup-group'/)
  assert.match(startupGroupManagerSource, /StorageGetAsync/)
  assert.match(startupGroupManagerSource, /new StartupGroupRuntime/)
  assert.match(startupGroupManagerSource, /new StartupGroupStore/)
  assert.match(startupGroupManagerSource, /new StartupGroupCandidate/)
  assert.match(startupGroupManagerSource, /export const StartupGroupManager = reactiveBind/)
  assert.match(startupGroupStoreSource, /reactiveBind\(new StartupGroup/)
  assert.match(indexSource, /store\.init\(\)\.catch\(\)/)
  assert.match(asideSource, /StartupGroupManager/)
  assert.match(indexSource, /StartupGroupManager/)
  assert.match(editorSource, /StartupGroupManager\.candidate/)
  assert.match(editorSource, /StartupGroupManager\.runtime\.listCandidates/)
  assert.match(cardSource, /StartupGroupManager\.getMemberDisplayTitle/)
  assert.match(startupGroupAsideSource, /StartupGroupManager/)
  assert.match(moduleSource, /StartupGroupManager/)
  assert.match(startupGroupManagerSource, /StorageSetAsync/)
  assert.doesNotMatch(startupGroupStoreSource, /AppStore/)
  assert.doesNotMatch(startupGroupStoreSource, /saveConfig\(/)
  assert.doesNotMatch(appStoreSource, /startupGroups/)
  assert.match(startupGroupAsideSource, /StartupGroupManager/)
  assert.doesNotMatch(startupGroupAsideSource, /config\.setup\.startupGroups/)
  assert.match(moduleSource, /StartupGroupManager/)
  assert.doesNotMatch(moduleSource, /config\.setup\.startupGroups/)
  assert.match(asideSource, /StartupGroupManager/)
  assert.doesNotMatch(asideSource, /config\.setup\.startupGroups/)
  assert.match(indexSource, /store\.init\(\)\.catch\(\)/)
  assert.match(moduleSource, /moduleType: 'console'/)
  assert.match(moduleSource, /typeFlag: 'startup-group'/)
  assert.match(editorSource, /<el-steps/)
  assert.match(editorSource, /<draggable/)
  assert.match(editorSource, /item-key="id"/)
  assert.match(editorSource, /<el-collapse/)
  assert.match(editorSource, /startup-group-candidate-card/)
  assert.match(editorSource, /<el-radio/)
  assert.match(editorSource, /<el-checkbox/)
  assert.match(editorSource, /candidate\.displayPath/)
  assert.match(editorSource, /common\.startupGroup\.noRemark/)
  assert.match(editorSource, /candidateManager\.normalizeSelection/)
  assert.match(editorSource, /<el-scrollbar/)
  assert.match(editorSource, /el-dialog-content-flex-1 h-\[75%\]/)
  assert.match(editorSource, /startup-group-module-collapse ml-4/)
  assert.match(editorSource, /candidateManager\.toggleSelection/)
  assert.match(editorSource, /@click\.capture\.prevent\.stop="toggleCandidate\(candidate\)"/)
  assert.match(editorSource, /expandedCategories\.value = candidateSections\.value/)
  assert.match(editorSource, /\.filter\(\(category\) =>/)
  assert.doesNotMatch(editorSource, /<el-checkbox-group/)
  assert.doesNotMatch(editorSource, /invalidItems\.length/)
  assert.doesNotMatch(editorSource, /overflow:\s*auto/)
  assert.match(enCommonSource, /"noRemark": "No remark"/)
  assert.match(zhCommonSource, /"noRemark": "无备注"/)
  assert.match(zhCommonSource, /"controlDefaultTooltip": "启动或停止默认启动组：\{name\}"/)
  assert.match(zhCommonSource, /"controlLegacyTooltip": "启动或停止所有已显示的服务"/)
  assert.match(
    zhCommonSource,
    /"defaultTooltip": "左上角一键启停和应用自动启动服务时，将使用此启动组。"/
  )
  assert.match(
    enCommonSource,
    /"controlDefaultTooltip": "Start or stop the default startup group: \{name\}"/
  )
  assert.match(enCommonSource, /"controlLegacyTooltip": "Start or stop all displayed services"/)
  assert.match(
    enCommonSource,
    /"defaultTooltip": "The top-left one-click control and automatic service startup will use this startup group\."/
  )
  assert.match(zhCommonSource, /"licenseTips": "未获得许可证，只能创建一个启动组。"/)
  assert.match(
    enCommonSource,
    /"licenseTips": "Without a license, only one startup group can be created\."/
  )
  assert.match(cardSource, /StartupGroupManager\.isGroupRunning/)
  assert.match(cardSource, /StartupGroupManager\.isMemberRunning/)
  assert.match(cardSource, /StartupGroupManager\.isMemberDisabled/)
  assert.match(cardSource, /:before-change="groupBeforeChange"/)
  assert.match(cardSource, /:before-change="\(\) => memberBeforeChange\(item\)"/)
  assert.doesNotMatch(cardSource, /@change="groupChange"/)
  assert.doesNotMatch(cardSource, /@change="memberChange\(item, \$event\)"/)
  assert.match(
    cardSource,
    /emit\('group-change', props\.group, !groupRunning\.value\)[\s\S]*?return false/
  )
  assert.match(
    cardSource,
    /emit\('member-change', props\.group, item, !memberRunning\(item\)\)[\s\S]*?return false/
  )
  assert.match(cardSource, /<el-checkbox/)
  assert.match(cardSource, /:icon="Edit"/)
  assert.match(cardSource, /:icon="Delete"/)
  assert.match(cardSource, /size="small"/)
  assert.match(cardSource, /<el-tooltip/)
  assert.match(cardSource, /<el-scrollbar[^>]*height="248px"/)
  assert.match(cardSource, /class="flex h-14 items-center/)
  assert.match(cardSource, /StartupGroupManager\.getMemberDisplayTitle/)
  assert.match(cardSource, /memberDisplayTitle/)
  assert.match(cardSource, /memberPath\(item\)/)
  assert.match(cardSource, /h-\[248px\]/)
  assert.doesNotMatch(cardSource, /<el-tag/)
  assert.doesNotMatch(cardSource, /common\.action\.start/)
  assert.doesNotMatch(cardSource, /common\.action\.stop/)
  assert.match(
    cardSource,
    /<el-tooltip[^>]*:content="I18nT\('common\.startupGroup\.defaultTooltip'\)"/
  )
  assert.match(cardSource, /<el-checkbox[^>]*:model-value="isDefault"/)
  assert.match(startupGroupAsideSource, /StartupGroupManager\.isAnyGroupRunning/)
  assert.match(startupGroupAsideSource, /StartupGroupManager\.ensureSources/)
  assert.match(startupGroupAsideSource, /:class="\{ run: startupGroupRunning \}"/)
  assert.doesNotMatch(startupGroupAsideSource, /setInterval/)
  assert.doesNotMatch(startupGroupAsideSource, /runningMap/)
  assert.match(indexSource, /StartupGroupManager\.ensureSources/)
  assert.match(indexSource, /SetupStore/)
  assert.match(indexSource, /store\.isCreationLocked/)
  assert.match(indexSource, /const isAddLocked = computed/)
  assert.match(indexSource, /:icon="Lock"/)
  assert.match(indexSource, /common\.startupGroup\.licenseTips/)
  assert.match(indexSource, /const toLicense =/)
  assert.match(indexSource, /setupStore\.tab = 'licenses'/)
  assert.match(indexSource, /if \(!group && isAddLocked\.value\)/)
  assert.match(indexSource, /StartupGroupManager\.setGroupEnabled/)
  assert.match(indexSource, /StartupGroupManager\.setMemberEnabled/)
  assert.match(indexSource, /@group-change="executeGroup"/)
  assert.match(indexSource, /@member-change="executeMember"/)
  assert.doesNotMatch(indexSource, /stateMap/)
  assert.doesNotMatch(indexSource, /runningMap/)
  assert.doesNotMatch(indexSource, /setInterval/)
  assert.doesNotMatch(indexSource, /runner\.getItemState/)
  assert.match(asideSource, /const legacyGroupDo =/)
  assert.match(asideSource, /resolveGroupExecutionRoute/)
  assert.match(asideSource, /const groupTooltip = computed/)
  assert.match(asideSource, /common\.startupGroup\.controlDefaultTooltip/)
  assert.match(asideSource, /common\.startupGroup\.controlLegacyTooltip/)
  assert.match(asideSource, /name: defaultStartupGroup\.value\.name/)
  assert.match(asideSource, /\{\{ groupTooltip \}\}/)
  assert.doesNotMatch(asideSource, /I18nT\('aside\.groupStart'\)/)
  assert.match(asideSource, /startupGroupStateForId/)
  assert.match(asideSource, /defaultStartupGroup\.value\?\.id !== startupGroupStateForId\.value/)
  assert.match(asideSource, /group!\.toggle\(\)/)
  assert.match(asideSource, /let startupGroupRefreshGeneration = 0/)
  assert.match(asideSource, /let startupGroupRefreshInFlight: Promise<void> \| undefined/)
  assert.match(asideSource, /while \(startupGroupRefreshQueued\)/)
  assert.match(asideSource, /StartupGroupManager\.runner\.revision/)
  assert.match(
    asideSource,
    /window\.setInterval\([\s\S]*refreshStartupGroupState\(\)\.catch\(\)[\s\S]*2000/
  )
  assert.match(moduleSource, /registerModuleVisibilityGuard/)
  assert.match(moduleSource, /runner\.stopForHide/)
  assert.ok(
    moduleSource.indexOf('ElMessageBox.confirm') <
      moduleSource.indexOf('const stopped = await StartupGroupManager.runner.stopForHide')
  )
  assert.match(showHideSource, /canSetModuleVisibility/)
  assert.match(moduleItemSource, /canSetModuleVisibility/)
  assert.match(asideSource, /consoleItem\.value, firstItem\.value/)
  assert.match(routerSource, /redirect: '\/startup-group'/)
  assert.match(appStoreSource, /currentPage: '\/startup-group'/)
  assert.match(asideSource, /const isRouteCurrent = computed/)
  assert.match(asideSource, /const item = allModule\.value\[0\]/)
  assert.match(asideSource, /const sub = item\?\.sub\?\.\[0\]/)
  assert.match(setupModuleSource, /:item="consoleItem"/)
  assert.match(
    moduleCoreSource,
    /if \(Object\.prototype\.hasOwnProperty\.call\(versions, this\.typeFlag\)\) \{[\s\S]*?await this\.applyInstalledVersions\(versions\[this\.typeFlag\] \?\? \[\]\)[\s\S]*?\} else \{[\s\S]*?this\.installedFetched = true[\s\S]*?this\.fetchInstalleding = false[\s\S]*?\}/
  )
  assert.doesNotMatch(moduleCoreSource, /ModuleStartOptions|ModuleStopOptions/)
  assert.doesNotMatch(installedItemSource, /exactTarget|startServiceExact|stopServiceExact/)
  assert.doesNotMatch(
    forkBaseSource,
    /startServiceExact|stopServiceExact|_stopServerExactGracefully/
  )
  assert.doesNotMatch(processSource, /ProcessOwnedPidsByMarkers/)
  assert.match(projectSource, /fetched = false/)
  assert.match(startupGroupSetupSource, /if \(!project\.fetched\)/)
  assert.match(startupGroupSetupSource, /getModules:\s*platformModules,/)
  assert.doesNotMatch(startupGroupSetupSource, /getModules:\s*platformModules\(\)/)
  assert.match(startupGroupSetupSource, /new StartupGroupManagerService/)
  assert.match(startupGroupSetupSource, /reactiveBind\(/)
  assert.match(startupGroupSetupSource, /export const StartupGroupManager/)
  assert.match(startupGroupSetupSource, /BrewStore\(\)\.module/)
  assert.match(startupGroupSetupSource, /ProjectSetup/)
  assert.match(startupGroupSetupSource, /runtime\.runner/)
  assert.match(startupGroupSetupSource, /AppModules/)
  assert.match(startupGroupSetupSource, /getModuleLabel/)
  assert.match(startupGroupSetupSource, /typeof label === 'function'/)
  assert.doesNotMatch(
    startupRuntimeCoreSource,
    /for \(const project of projects\.filter[\s\S]*?if \(!\(await dependencies\.pathExists\(project\.path\)\)\) continue/
  )
  assert.match(
    startupRuntimeCoreSource,
    /return project && \(await this\.dependencies\.pathExists\(project\.path\)\) \? project : undefined/
  )
  assert.doesNotMatch(mysqlForkSource, /_stopServerExactGracefully/)
  assert.doesNotMatch(mariaDBForkSource, /_stopServerExactGracefully/)
  assert.doesNotMatch(postgreSQLForkSource, /_stopServerExactGracefully/)
  assert.doesNotMatch(mongoDBForkSource, /_stopServerExactGracefully/)
}

{
  const defaultGroup = makeGroup('default', [mysql])
  assert.equal(resolveGroupExecutionRoute(true, defaultGroup), 'startup-group')
  assert.equal(resolveGroupExecutionRoute(true, undefined), 'legacy')
  assert.equal(resolveGroupExecutionRoute(false, defaultGroup), 'legacy')

  assert.equal(typeof resolveGroupAutoStartAction, 'function')
  assert.equal(
    resolveGroupAutoStartAction({
      enabled: true,
      disabled: true,
      running: false
    }),
    'wait'
  )
  assert.equal(
    resolveGroupAutoStartAction({
      enabled: true,
      disabled: false,
      running: true
    }),
    'handled'
  )
  assert.equal(
    resolveGroupAutoStartAction({
      enabled: true,
      disabled: false,
      running: false
    }),
    'start'
  )
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
