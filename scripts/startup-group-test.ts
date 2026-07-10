import assert from 'node:assert/strict'

import {
  buildStartupGroupStopQueue,
  createStartupGroupRunner,
  getStartupGroupCardState,
  normalizeStartupGroupConfig,
  resolveDefaultStartupGroup,
  setDefaultStartupGroup,
  type StartupGroup,
  type StartupGroupAdapter,
  type StartupGroupItem,
  type StartupGroupMemberState
} from '../src/render/core/StartupGroup'

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

console.log('startup group tests passed')
