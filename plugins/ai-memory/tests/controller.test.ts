import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MemoryController, type MemoryControllerDeps } from '../render/controller'

function fixture(overrides: Partial<MemoryControllerDeps> = {}) {
  const calls: {
    key: string
    command: string
    args: any[]
    cb?: (key: string, response: any) => void
  }[] = []
  const removed: string[] = []
  let ids = 0
  const deps: MemoryControllerDeps = {
    ipc: {
      sendSensitive(command, ...args) {
        const call = { key: `request-${calls.length}`, command, args, cb: undefined as any }
        calls.push(call)
        return {
          key: call.key,
          then(cb) {
            call.cb = cb
          }
        }
      },
      off(key) {
        removed.push(key)
      }
    },
    id: () => `uuid-${++ids}`,
    readPreferences: async () => undefined,
    writePreferences: async () => {},
    configure: async () => ({ success: true }),
    copyRules: async () => {},
    downloadRules: async () => true,
    openPath: async () => {},
    notify: () => {},
    timeoutMs: 1000,
    ...overrides
  }
  const manager = new MemoryController(deps)
  const reply = (index: number, response: any) => calls[index].cb!(calls[index].key, response)
  return { manager, calls, removed, reply, ids: () => ids }
}
const success = (id = 'saved') => ({
  code: 0,
  data: { outcome: 'success', data: { id, revision: 1 } }
})

test('double save fixes one input/request ID; progress remains busy and terminal cleanup survives page reentry', async () => {
  const f = fixture({
    notify: () => {
      throw new Error('notification failure')
    }
  })
  const input = { title: 'Original', content: 'Body', tags: ['one'] }
  const first = f.manager.mutate({ scope: 'global' }, 'store', input as any)
  const duplicate = f.manager.mutate({ scope: 'global' }, 'store', input as any)
  input.title = 'Changed'
  input.tags.push('two')
  assert.equal(first, duplicate)
  assert.equal(f.ids(), 1)
  assert.equal(f.calls[0].args[1].title, 'Original')
  assert.deepEqual(f.calls[0].args[1].tags, ['one'])
  f.reply(0, { code: 200, data: 'progress' })
  assert.equal(f.manager.mutation?.status, 'running')
  assert.equal(f.removed.length, 0)
  f.reply(0, success())
  const result = await first
  assert.equal(result.outcome, 'success')
  assert.equal(f.manager.mutation?.result?.data?.id, 'saved')
  assert.equal(f.manager.mutation?.status, 'complete')
  assert.deepEqual(f.removed, ['request-0'])
})
test('unknown retains original request; explicit retry reuses it without a new ID', async () => {
  const f = fixture()
  const pending = f.manager.mutate({ scope: 'global' }, 'store', { title: 'One' } as any)
  f.reply(0, { code: 1, outcome: 'unknown' })
  assert.equal((await pending).outcome, 'unknown')
  const blocked = await f.manager.mutate({ scope: 'global' }, 'store', {
    title: 'Different'
  } as any)
  assert.equal(blocked.outcome, 'unknown')
  assert.equal(f.calls.length, 1)
  const retry = f.manager.retryMutation()
  assert.deepEqual(f.calls[1].args, f.calls[0].args)
  assert.equal(f.ids(), 1)
  f.reply(1, success())
  assert.equal((await retry).outcome, 'success')
})
test('transport timeout releases listener and does not claim a mutation failed; a late reply cannot overwrite retry', async () => {
  const f = fixture({ timeoutMs: 15 })
  const first = await f.manager.mutate({ scope: 'global' }, 'store', {} as any)
  assert.equal(first.outcome, 'unknown')
  assert.equal(f.removed.length, 1)
  const retry = f.manager.retryMutation()
  f.reply(0, success('late'))
  assert.equal(f.manager.mutation?.status, 'running')
  f.reply(1, success('confirmed'))
  assert.equal((await retry).data!.id, 'confirmed')
})
test('new search/detail selection wins against older replies; filters and admin scope are snapshotted', async () => {
  const f = fixture()
  const old = f.manager.search({ scope: 'global' }, { queries: ['old'] })
  const filters = { queries: ['new'] }
  const current = f.manager.search({ projectId: 'project-id' }, filters)
  filters.queries.push('changed')
  assert.deepEqual(f.calls[1].args, [
    'callForProject',
    'project-id',
    'search',
    { queries: ['new'] }
  ])
  f.reply(1, {
    code: 0,
    data: { outcome: 'success', data: { results: [{ id: 'new' }], truncated: false } }
  })
  await current
  f.reply(0, {
    code: 0,
    data: { outcome: 'success', data: { results: [{ id: 'old' }], truncated: false } }
  })
  await old
  assert.equal(f.manager.searchResult?.data?.results[0].id, 'new')
  assert.equal(f.removed.length, 2)
  const detail = f.manager.get({ scope: 'global' }, 'one')
  f.manager.clearDetail()
  f.reply(2, { code: 0, data: { outcome: 'success', data: { id: 'one' } } })
  await detail
  assert.equal(f.manager.detail, undefined)
})
test('client configurations, copied rules and diagnostics have independent terminal outcomes', async () => {
  const f = fixture({
    configure: async (client) => ({
      success: client === 'kimi',
      errorCode: client === 'kimi' ? undefined : 'client_config_failed'
    }),
    copyRules: async () => {
      throw new Error('clipboard unavailable')
    }
  })
  const [codex, kimi, copied] = await Promise.all([
    f.manager.configureClient('codex'),
    f.manager.configureClient('kimi'),
    f.manager.copyRules()
  ])
  assert.equal(codex.success, false)
  assert.equal(kimi.success, true)
  assert.equal(copied.success, false)
  assert.equal(f.manager.actions['configure:kimi'].result?.success, true)
  assert.equal('installed' in f.manager.actions['rules:copy'], false)
  const diagnostics = f.manager.loadDiagnostics()
  const mutation = f.manager.mutate({ scope: 'global' }, 'update', {} as any)
  f.reply(0, { code: 1 })
  f.reply(1, success())
  await diagnostics
  assert.equal((await mutation).outcome, 'success')
  assert.equal(f.manager.diagnosticsResult?.outcome, 'failed')
})
test('ordinary failure can be retried with exact input; preference failure is independent of search', async () => {
  const f = fixture({
    writePreferences: async () => {
      throw new Error('disk')
    }
  })
  const operation = f.manager.mutate({ projectId: 'old-root' }, 'forget', {
    id: 'one',
    expected_revision: 2
  } as any)
  f.reply(0, { code: 0, data: { outcome: 'failed', error_code: 'deletion_unavailable' } })
  await operation
  const retry = f.manager.retryMutation()
  assert.deepEqual(f.calls[1].args, f.calls[0].args)
  f.reply(1, { code: 0, data: { outcome: 'already_deleted' } })
  await retry
  assert.equal(f.manager.mutation?.result?.outcome, 'already_deleted')
  assert.equal((await f.manager.savePreference({ scope: 'global' })).success, false)
})

test('committed deletion removes the visible body and search row while keeping its partial receipt', async () => {
  const f = fixture()
  f.manager.detail = {
    outcome: 'success',
    data: { id: 'one', revision: 2, content: 'Private' } as any
  }
  f.manager.searchResult = {
    outcome: 'success',
    data: { results: [{ id: 'one' } as any], truncated: true, next_cursor: 'old' }
  }
  const operation = f.manager.mutate({ scope: 'global' }, 'forget', {
    id: 'one',
    expected_revision: 2
  })
  f.reply(0, {
    code: 0,
    data: { outcome: 'partial', data: { id: 'one', revision: 3, cleanup_state: 'pending' } }
  })
  await operation
  assert.equal(f.manager.detail, undefined)
  assert.equal(f.manager.searchResult?.data?.results.length, 0)
  assert.equal(f.manager.searchResult?.data?.next_cursor, undefined)
  assert.equal(f.manager.mutation?.result?.data.cleanup_state, 'pending')
})
