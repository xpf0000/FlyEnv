import assert from 'node:assert/strict'
import { StartupGroupRunner } from '../src/render/components/StartupGroup/class/StartupGroupRunner'
import type {
  StartupGroupAdapter,
  StartupGroupData,
  StartupGroupItem
} from '../src/render/components/StartupGroup/type'

const item = (module: string): StartupGroupItem =>
  ({
    type: 'service-version',
    module,
    versionPath: `/opt/${module}`
  }) as StartupGroupItem

const group = (continueOnFailure?: boolean): StartupGroupData => ({
  id: 'g',
  name: 'g',
  continueOnFailure,
  items: [item('mysql'), item('redis'), item('nginx')],
  createdAt: 0,
  updatedAt: 0
})

// "mysql" always fails to start; everything else starts.
const createRunner = (started: string[]) => {
  const adapter: StartupGroupAdapter = {
    exists: async () => true,
    getState: async () => 'stopped',
    start: async (it) => {
      if (it.type === 'service-version' && it.module === 'mysql') throw new Error('boom')
      started.push(it.type === 'service-version' ? it.module : '')
    },
    stop: async () => {}
  }
  return new StartupGroupRunner(() => adapter)
}

async function main() {
  // default: a failed member stops the rest (dependency order is kept)
  let started: string[] = []
  let result = await createRunner(started).run(group(), 'start')
  assert.deepEqual(
    result.members.map((m) => m.outcome),
    ['failed', 'not-run', 'not-run']
  )
  assert.deepEqual(started, [])

  // continueOnFailure: the failure is still reported, remaining members start
  started = []
  result = await createRunner(started).run(group(true), 'start')
  assert.deepEqual(
    result.members.map((m) => m.outcome),
    ['failed', 'started', 'started']
  )
  assert.equal(result.members[0].error, 'boom')
  assert.deepEqual(started, ['redis', 'nginx'])

  console.log('Startup group runner tests passed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
