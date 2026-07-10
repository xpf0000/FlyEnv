import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import {
  buildStartupGroupStopQueue,
  createStartupGroup,
  createStartupGroupRunner,
  deleteStartupGroup,
  getStartupGroupCardState,
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
  projectId: 'project-api'
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
  const stopCalls: string[] = []
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
    stop: async () => true
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
    stop: async () => {
      stopCalls.push('target')
      return true
    }
  }

  const runtime = createStartupGroupRuntime({
    createId: () => 'candidate-id',
    modules: [
      { typeFlag: 'mysql', moduleType: 'dataBaseServer', label: 'MySQL', isService: true },
      { typeFlag: 'node', moduleType: 'language', label: 'NodeJS', isService: true },
      { typeFlag: 'php-fpm', moduleType: 'language', label: 'PHP-FPM', isService: true }
    ],
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
    getProjects: async (module) =>
      module === 'node'
        ? [
            {
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
            } satisfies StartupGroupProjectTarget
          ]
        : []
  })

  await runtime.getAdapter(mysql)?.start(mysql)
  await runtime.getAdapter(mysql)?.stop(mysql)

  assert.deepEqual(startCalls, [
    {
      id: 'target',
      options: { updateCurrent: false, stopOtherVersions: false }
    }
  ])
  assert.deepEqual(stopCalls, ['target'])
  const missingVersion = { ...mysql, versionPath: 'D:/missing' }
  assert.equal(await runtime.getAdapter(missingVersion)?.exists(missingVersion), false)

  const projectCalls: string[] = []
  await runtime.getAdapter(api)?.start(api)
  await runtime.getAdapter(api)?.stop(api)
  assert.deepEqual(projectCalls, ['start:project-api:false', 'stop:project-api:false'])
  assert.equal(
    await runtime
      .getAdapter({ ...api, projectId: 'missing' })
      ?.exists({ ...api, projectId: 'missing' }),
    false
  )

  const candidates = await runtime.listCandidates()
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

  assert.match(typeSource, /console = 'console'/)
  assert.match(typeSource, /'startup-group' = 'startup-group'/)
  assert.match(moduleSource, /moduleType: 'console'/)
  assert.match(moduleSource, /typeFlag: 'startup-group'/)
  assert.match(editorSource, /<el-steps/)
  assert.match(editorSource, /<draggable/)
  assert.match(editorSource, /item-key="id"/)
  assert.match(cardSource, /default-change/)
  assert.match(indexSource, /const busy = ref\(false\)/)
  assert.match(indexSource, /busy\.value = true/)
  assert.match(indexSource, /:busy="busy"/)
  assert.match(asideSource, /const legacyGroupDo =/)
  assert.match(asideSource, /resolveGroupExecutionRoute/)
  assert.match(asideSource, /startupGroupRuntime\.runner\.run/)
  assert.match(moduleSource, /registerModuleVisibilityGuard/)
  assert.match(showHideSource, /canSetModuleVisibility/)
  assert.match(moduleItemSource, /canSetModuleVisibility/)
  assert.match(asideSource, /consoleItem\.value, firstItem\.value/)
  assert.match(setupModuleSource, /:item="consoleItem"/)
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
