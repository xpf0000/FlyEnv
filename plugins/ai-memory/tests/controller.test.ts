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
    readConnection: async () => ({ running: false, http: false, enabledCount: 0 }),
    chooseProject: async () => undefined,
    copyVerification: async () => {},
    copyRules: async () => {},
    downloadRules: async () => true,
    openPath: async () => {},
    openTerminal: async () => {},
    notify: () => {},
    timeoutMs: 1000,
    ...overrides
  }
  const manager = new MemoryController(deps)
  const reply = (index: number, response: any) => calls[index].cb!(calls[index].key, response)
  return { manager, calls, removed, reply, ids: () => ids }
}
test('connection checks are shared, clear stale readiness on failure and never configure implicitly', async () => {
  let resolve!: (value: any) => void
  let reads = 0
  let fail = false
  let configured = 0
  const f = fixture({
    readConnection: () => {
      reads++
      if (fail) return Promise.reject(new Error('offline'))
      return new Promise((done) => {
        resolve = done
      })
    },
    configure: async () => {
      configured++
      return { success: true }
    }
  })
  const first = f.manager.loadConnection()
  assert.equal(first, f.manager.loadConnection())
  await Promise.resolve()
  resolve({ running: true, http: true, enabledCount: 5 })
  await first
  assert.equal(reads, 1)
  assert.equal(f.manager.connection?.enabledCount, 5)
  assert.equal(configured, 0)
  fail = true
  await f.manager.loadConnection()
  assert.equal(f.manager.connection, undefined)
  assert.equal(f.manager.actions.connection.result?.success, false)
})

test('leaving an unfinished project selection clears old results and ignores the pending search response', async () => {
  const f = fixture()
  const pending = f.manager.search({ scope: 'global' })
  f.manager.clearSearch()
  f.reply(0, {
    code: 0,
    data: { outcome: 'success', data: { results: [{ id: 'old' }], truncated: false } }
  })
  await pending
  assert.equal(f.manager.searchResult, undefined)
  assert.equal(f.manager.searchBusy, false)
  assert.deepEqual(f.removed, ['request-0'])
})

test('directory cancellation is not a failure; selection and verification copying use owned actions', async () => {
  let selected: string | undefined = undefined
  let copies = 0
  const f = fixture({
    chooseProject: async () => selected,
    copyVerification: async () => {
      copies++
    }
  })
  assert.equal(await f.manager.chooseProject(), undefined)
  assert.equal(f.manager.actions['project:choose'].result?.cancelled, true)
  selected = '/project'
  assert.equal(await f.manager.chooseProject(), '/project')
  await f.manager.copyVerification()
  assert.equal(copies, 1)
})
test('a retry panel can only access the request that its own form or record submitted', async () => {
  const f = fixture()
  const pending = f.manager.mutate({ scope: 'global' }, 'forget', { id: 'record-a' })
  const requestId = f.manager.mutation!.input.request_id
  f.reply(0, { code: 0, data: { outcome: 'failed', error_code: 'operation_failed' } })
  await pending
  assert.equal(f.manager.mutationFor(undefined), undefined)
  assert.equal(f.manager.mutationFor('another-form'), undefined)
  assert.equal(f.manager.mutationFor(requestId)?.input.id, 'record-a')
})
const success = (id = 'saved') => ({
  code: 0,
  data: { outcome: 'success', data: { id, revision: 1 } }
})

test('forget invalidates a pending detail for its scope and ID without discarding another record read', async () => {
  for (const mode of ['same', 'other-id', 'other-scope']) {
    const f = fixture()
    const target = { projectId: 'project' }
    const id = mode === 'other-id' ? 'other' : 'deleted'
    const read = f.manager.get(mode === 'other-scope' ? { scope: 'global' } : target, id)
    const forgotten = f.manager.forget(target, { id: 'deleted', revision: 1 } as any)
    f.reply(1, success('deleted'))
    await forgotten
    f.reply(0, {
      code: 0,
      data: {
        outcome: 'success',
        data: { id, content: 'old snapshot' }
      }
    })
    await read
    assert.equal(f.manager.detail?.data?.id, mode === 'same' ? undefined : id)
    assert.equal(f.manager.detailBusy, false)
  }
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
test('client configurations, copied rules and call records have independent terminal outcomes', async () => {
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
  const calls = f.manager.loadCalls()
  const mutation = f.manager.mutate({ scope: 'global' }, 'update', {} as any)
  f.reply(0, { code: 1 })
  f.reply(1, success())
  await calls
  assert.equal((await mutation).outcome, 'success')
  assert.equal(f.manager.callsResult?.outcome, 'failed')
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

test('star map loads all data with one internal request and coalesces duplicate invocation', async () => {
  const f = fixture()
  const target = { projectId: 'project-a' }
  const filters = { queries: ['original'] }
  const first = f.manager.search(target, filters, true)
  assert.equal(first, f.manager.search(target, filters, true))
  target.projectId = 'changed'
  filters.queries.push('changed')
  assert.deepEqual(f.calls[0].args, ['universeForProject', 'project-a', { queries: ['original'] }])
  f.reply(0, { code: 200, data: 'progress' })
  assert.equal(f.manager.searchBusy, true)
  assert.equal(f.removed.length, 0)
  f.reply(0, {
    code: 0,
    data: {
      outcome: 'success',
      data: { results: Array.from({ length: 48 }, (_, i) => ({ id: String(i) })), truncated: false }
    }
  })
  assert.equal((await first).data?.results.length, 48)
  assert.equal(f.calls.length, 1)
  assert.equal(f.manager.searchBusy, false)
  assert.deepEqual(f.removed, ['request-0'])
})

test('star map global request strips pagination and only latest query or clearSearch may publish', async () => {
  for (const clear of [false, true]) {
    const f = fixture()
    const old = f.manager.search(
      { scope: 'global' },
      { queries: ['old'], limit: 1, cursor: 'discard' },
      true
    )
    assert.deepEqual(f.calls[0].args, ['universe', { queries: ['old'], scope: 'global' }])
    if (clear) f.manager.clearSearch()
    else {
      const current = f.manager.search({ projectId: 'new' }, {}, true)
      f.reply(1, {
        code: 0,
        data: { outcome: 'success', data: { results: [{ id: 'current' }], truncated: false } }
      })
      await current
    }
    f.reply(0, {
      code: 0,
      data: { outcome: 'success', data: { results: [{ id: 'old' }], truncated: false } }
    })
    await old
    assert.deepEqual(
      f.manager.searchResult?.data?.results.map((hit) => hit.id),
      clear ? undefined : ['current']
    )
    assert.equal(f.manager.searchBusy, false)
  }
})

test('star map preserves backend partial warnings or failures without replay; list stays paginated', async () => {
  const f = fixture()
  const all = f.manager.search({ scope: 'global' }, {}, true)
  const partial = {
    outcome: 'partial' as const,
    warnings: [{ code: 'record_invalid', id: 'bad' }],
    data: { results: [{ id: 'valid' }], truncated: false }
  }
  f.reply(0, { code: 0, data: partial })
  assert.deepEqual(await all, partial)
  const failed = f.manager.search({ scope: 'global' }, {}, true)
  f.reply(1, { code: 0, data: { outcome: 'failed', error_code: 'scope_unavailable' } })
  assert.equal((await failed).outcome, 'failed')
  assert.equal(f.calls.length, 2)
  const list = f.manager.search({ scope: 'global' })
  assert.deepEqual(f.calls[2].args, ['search', { scope: 'global' }])
  f.reply(2, {
    code: 0,
    data: {
      outcome: 'success',
      data: { results: [{ id: 'one' }], truncated: true, next_cursor: 'next' }
    }
  })
  assert.equal((await list).data?.next_cursor, 'next')
  assert.equal(f.calls.length, 3)
})

test('project directory opens preserve path, coalesce clicks and release after completion', async () => {
  const paths: string[] = []
  let finish!: () => void
  const f = fixture({
    openPath: (path) => {
      paths.push(path)
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    }
  })
  const path = '/workspace/Project With Spaces'
  const first = f.manager.openProjectDirectory(path)
  assert.equal(first, f.manager.openProjectDirectory(path))
  await Promise.resolve()
  assert.deepEqual(paths, [path])
  assert.equal(f.manager.actions[`project:open:${path}`].status, 'running')
  finish()
  assert.equal((await first).success, true)
  assert.equal(f.manager.actions[`project:open:${path}`].status, 'complete')
  const second = f.manager.openProjectDirectory(path)
  await Promise.resolve()
  finish()
  await second
  assert.equal(paths.length, 2)
  assert.equal(f.calls.length, 0)
})

test('project directory failures notify without replaying or changing query results', async () => {
  const notices: string[] = []
  let attempts = 0
  const f = fixture({
    openPath: async () => {
      attempts++
      throw new Error('missing')
    },
    notify: (_type, key) => {
      notices.push(key)
    }
  })
  const result = await f.manager.openProjectDirectory('/missing/project')
  assert.equal(result.success, false)
  assert.equal(result.errorCode, 'directory_unavailable')
  assert.equal(attempts, 1)
  assert.deepEqual(notices, ['directory_unavailable'])
  assert.equal(f.manager.searchBusy, false)
  assert.equal(f.calls.length, 0)
})

test('project terminal keeps its path snapshot, coalesces clicks and retains pending state', async () => {
  const paths: string[] = []
  let finish!: () => void
  const f = fixture({
    openTerminal: (path) => {
      paths.push(path)
      return new Promise<void>((resolve) => {
        finish = resolve
      })
    }
  })
  const path = '/workspace/Project With Spaces'
  const first = f.manager.openProjectTerminal(path)
  assert.equal(first, f.manager.openProjectTerminal(path))
  await Promise.resolve()
  assert.equal(f.manager.actions[`project:terminal:${path}`].status, 'running')
  assert.deepEqual(paths, [path])
  finish()
  assert.equal((await first).success, true)
  assert.equal(f.manager.actions[`project:terminal:${path}`].status, 'complete')
  assert.equal(f.calls.length, 0)
})

test('project terminal failure is local and permits an explicit retry without replay', async () => {
  let attempts = 0
  const notices: string[] = []
  const f = fixture({
    openTerminal: async () => {
      attempts++
      throw new Error('unavailable')
    },
    notify: (_type, key) => {
      notices.push(key)
    }
  })
  assert.equal((await f.manager.openProjectTerminal('/project')).success, false)
  assert.equal(f.manager.actions['project:terminal:/project'].status, 'complete')
  assert.equal(attempts, 1)
  assert.deepEqual(notices, ['terminalUnavailable'])
  await f.manager.openProjectTerminal('/project')
  assert.equal(attempts, 2)
  assert.equal(f.calls.length, 0)
})

test('project relocation keeps ID selection and promotes legacy path preference without touching records', async () => {
  let saved: any
  const f = fixture({
    writePreferences: async (value) => {
      saved = value
    }
  })
  f.manager.preferredTarget = { scope: 'project', project_path: '/old' }
  const result = await f.manager.applyProjectRelink({
    projectId: 'retained-id',
    name: 'Project',
    previousPath: '/old',
    project_path: '/new',
    changed: true
  })
  assert.equal(result.success, true)
  assert.deepEqual(f.manager.preferredTarget, { projectId: 'retained-id' })
  assert.deepEqual(saved, { projectId: 'retained-id' })
  assert.equal(f.manager.relinkedProject?.project_path, '/new')
  assert.equal(f.calls.length, 0)
})

test('a relocation preference waits for the previous path write and persists the retained ID', async () => {
  let release!: () => void
  const writes: any[] = []
  const f = fixture({
    writePreferences: async (target) => {
      writes.push(target)
      if (writes.length === 1)
        await new Promise<void>((r) => {
          release = r
        })
    }
  })
  const first = f.manager.savePreference({ scope: 'project', project_path: '/old' })
  for (let i = 0; i < 5; i++) await Promise.resolve()
  const promoted = f.manager.applyProjectRelink({
    projectId: 'id',
    name: 'Project',
    previousPath: '/old',
    project_path: '/new',
    changed: true
  })
  release()
  await first
  await promoted
  assert.deepEqual(writes, [{ scope: 'project', project_path: '/old' }, { projectId: 'id' }])
})

test('a backend-confirmed canonical alias also promotes the selected legacy project path', async () => {
  const f = fixture()
  f.manager.preferredTarget = { scope: 'project', project_path: '/alias/' }
  await f.manager.applyProjectRelink({
    projectId: 'id',
    name: 'Project',
    previousPath: '/canonical/old',
    selectedPath: '/alias/',
    project_path: '/new',
    changed: true
  })
  assert.deepEqual(f.manager.preferredTarget, { projectId: 'id' })
})

test('a merged member selection follows the retained project ID without discarding its memories', async () => {
  const f = fixture()
  f.manager.preferredTarget = { projectId: 'B' }
  await f.manager.applyProjectRelink({
    projectId: 'A',
    name: 'A',
    previousPath: '/a',
    project_path: '/b',
    changed: true,
    merged: true,
    mergedProjectIds: ['B']
  })
  assert.deepEqual(f.manager.preferredTarget, { projectId: 'A' })
})

test('loading a merged mapping repairs a persisted retired project selection after restart', async () => {
  let saved: any
  const f = fixture({
    readPreferences: async () => ({ projectId: 'B' }),
    writePreferences: async (target) => {
      saved = target
    }
  })
  await f.manager.initialize()
  const pending = f.manager.loadProjects()
  f.reply(0, {
    code: 0,
    data: {
      outcome: 'success',
      data: [
        {
          projectId: 'A',
          name: 'A',
          project_path: '/new',
          path_status: 'available',
          mergedProjectIds: ['B']
        }
      ]
    }
  })
  await pending
  for (let i = 0; i < 8; i++) await Promise.resolve()
  assert.deepEqual(f.manager.preferredTarget, { projectId: 'A' })
  assert.deepEqual(saved, { projectId: 'A' })
})

test('a saved project removed from current memory data resets its preference to global', async () => {
  let saved: any
  const f = fixture({
    readPreferences: async () => ({ projectId: 'removed' }),
    writePreferences: async (target) => {
      saved = target
    }
  })
  await f.manager.initialize()
  const flight = f.manager.loadProjects()
  f.reply(0, { code: 0, data: { outcome: 'success', data: [] } })
  await flight
  for (let i = 0; i < 8; i++) await Promise.resolve()
  assert.deepEqual(f.manager.preferredTarget, { scope: 'global' })
  assert.deepEqual(saved, { scope: 'global' })
})

test('failed project data does not reset the selected project or persist a guessed global scope', async () => {
  let writes = 0
  const f = fixture({
    readPreferences: async () => ({ projectId: 'previous' }),
    writePreferences: async () => {
      writes++
    }
  })
  await f.manager.initialize()
  const flight = f.manager.loadProjects()
  f.reply(0, { code: 0, data: { outcome: 'failed', error_code: 'project_registry_corrupt' } })
  await flight
  assert.deepEqual(f.manager.preferredTarget, { projectId: 'previous' })
  assert.equal(writes, 0)
})

test('a delayed project listing reconciles the latest selection rather than an earlier stored project', async () => {
  const f = fixture()
  f.manager.preferredTarget = { projectId: 'removed' }
  const flight = f.manager.loadProjects()
  await f.manager.savePreference({ projectId: 'new-selection' })
  f.reply(0, {
    code: 0,
    data: {
      outcome: 'success',
      data: [
        { projectId: 'new-selection', name: 'New', project_path: '/new', path_status: 'available' }
      ]
    }
  })
  await flight
  assert.deepEqual(f.manager.preferredTarget, { projectId: 'new-selection' })
})

test('management caches complete and empty scopes, separates queries, and refresh bypasses the cache', async () => {
  const f = fixture()
  const global = { scope: 'global' as const }
  const first = f.manager.search(global, { queries: [] }, true)
  f.reply(0, {
    code: 0,
    data: { outcome: 'success', data: { results: [{ id: 'global' }], truncated: false } }
  })
  await first
  await f.manager.search(global, { queries: [] }, true)
  assert.equal(f.calls.length, 1, 'returning to the page uses the loaded result')
  const empty = f.manager.search({ projectId: 'empty' }, {}, true)
  f.reply(1, { code: 0, data: { outcome: 'success', data: { results: [], truncated: false } } })
  await empty
  await f.manager.search(global, { queries: [] }, true)
  assert.equal(f.manager.searchResult?.data?.results[0].id, 'global')
  await f.manager.search({ projectId: 'empty' }, {}, true)
  assert.equal(f.calls.length, 2, 'empty data is cached too')
  assert.deepEqual(f.manager.searchResult?.data?.results, [])
  const filtered = f.manager.search(global, { queries: ['other'] }, true)
  f.reply(2, {
    code: 0,
    data: { outcome: 'success', data: { results: [{ id: 'match' }], truncated: false } }
  })
  await filtered
  const fresh = f.manager.search(global, { queries: [] }, true, true)
  assert.equal(f.calls.length, 4)
  assert.equal(fresh, f.manager.search(global, { queries: [] }, true, true))
  f.reply(3, {
    code: 0,
    data: { outcome: 'success', data: { results: [{ id: 'new' }], truncated: false } }
  })
  await fresh
  await f.manager.search(global, { queries: [] }, true)
  assert.equal(f.calls.length, 4)
  assert.equal(f.manager.searchResult?.data?.results[0].id, 'new')
})

test('cached project listing is reused and explicit refresh drains a pre-change listing', async () => {
  const f = fixture()
  const first = f.manager.loadProjects()
  f.reply(0, { code: 0, data: { outcome: 'success', data: [] } })
  await first
  await f.manager.loadProjects()
  assert.equal(f.calls.length, 1)
  const fresh = f.manager.loadProjects(true)
  const afterChange = f.manager.loadProjects(true)
  f.reply(1, { code: 0, data: { outcome: 'success', data: [] } })
  await fresh
  await Promise.resolve()
  assert.equal(f.calls.length, 3)
  f.reply(2, { code: 0, data: { outcome: 'success', data: [] } })
  await afterChange
})

test('successful writes invalidate all cached scopes and pre-write replies cannot refill them', async () => {
  const f = fixture()
  const global = { scope: 'global' as const }
  const first = f.manager.search(global, {}, true)
  f.reply(0, {
    code: 0,
    data: { outcome: 'success', data: { results: [{ id: 'old' }], truncated: false } }
  })
  await first
  const pending = f.manager.search({ projectId: 'project' }, {}, true)
  const write = f.manager.mutate(global, 'store', { title: 'New' })
  f.reply(2, success())
  await write
  f.reply(1, {
    code: 0,
    data: { outcome: 'success', data: { results: [{ id: 'stale' }], truncated: false } }
  })
  await pending
  assert.notEqual(f.manager.searchResult?.data?.results[0]?.id, 'stale')
  const again = f.manager.search(global, {}, true)
  assert.equal(f.calls.length, 4)
  f.reply(3, {
    code: 0,
    data: { outcome: 'success', data: { results: [{ id: 'fresh' }], truncated: false } }
  })
  await again
})

test('manual refresh keeps same-query data on failure and does not substitute another scope', async () => {
  const f = fixture()
  const global = { scope: 'global' as const }
  const first = f.manager.search(global, {}, true)
  f.reply(0, {
    code: 0,
    data: { outcome: 'success', data: { results: [{ id: 'kept' }], truncated: false } }
  })
  await first
  const refresh = f.manager.search(global, {}, true, true)
  assert.equal(f.manager.searchResult?.data?.results[0].id, 'kept')
  f.reply(1, { code: 0, data: { outcome: 'failed', error_code: 'scope_unavailable' } })
  await refresh
  assert.equal(f.manager.searchResult?.outcome, 'failed')
  assert.equal(f.manager.searchResult?.data?.results[0].id, 'kept')
  const other = f.manager.search({ projectId: 'different' }, {}, true)
  assert.equal(f.manager.searchResult, undefined)
  f.reply(2, { code: 0, data: { outcome: 'failed', error_code: 'scope_unavailable' } })
  await other
  assert.equal(f.manager.searchResult?.data, undefined)
})

test('restore invalidation rejects pre-restore project and memory replies before reusing any cache', async () => {
  const f = fixture()
  f.manager.preferredTarget = { projectId: 'retained' }
  const projects = f.manager.loadProjects()
  f.reply(0, {
    code: 0,
    data: { outcome: 'success', data: [{ projectId: 'retained', name: 'Project' }] }
  })
  await projects
  const first = f.manager.search({ scope: 'global' }, {}, true)
  f.reply(1, {
    code: 0,
    data: { outcome: 'success', data: { results: [{ id: 'before' }], truncated: false } }
  })
  await first
  const oldProjects = f.manager.loadProjects(true)
  const oldSearch = f.manager.search({ projectId: 'retained' }, {}, true)
  f.manager.invalidateData()
  const refreshedProjects = f.manager.loadProjects()
  f.reply(2, { code: 0, data: { outcome: 'success', data: [] } })
  f.reply(3, {
    code: 0,
    data: { outcome: 'success', data: { results: [{ id: 'stale' }], truncated: false } }
  })
  await Promise.all([oldProjects, oldSearch])
  assert.deepEqual(f.manager.preferredTarget, { projectId: 'retained' })
  assert.equal(f.manager.searchResult, undefined)
  assert.equal(f.calls.length, 5)
  f.reply(4, { code: 0, data: { outcome: 'success', data: [] } })
  await refreshedProjects
  assert.deepEqual(f.manager.preferredTarget, { scope: 'global' })
  const restored = f.manager.search({ scope: 'global' }, {}, true)
  assert.equal(f.calls.length, 6)
  f.reply(5, { code: 0, data: { outcome: 'success', data: { results: [], truncated: false } } })
  await restored
  assert.deepEqual(f.manager.searchResult?.data?.results, [])
})

test('partial deletion and unknown writes invalidate cached data without replaying the mutation', async () => {
  for (const outcome of ['partial', 'unknown'] as const) {
    const f = fixture()
    const first = f.manager.search({ scope: 'global' }, {}, true)
    f.reply(0, {
      code: 0,
      data: { outcome: 'success', data: { results: [{ id: 'old' }], truncated: false } }
    })
    await first
    const mutation = f.manager.mutate({ scope: 'global' }, 'forget', { id: 'old' })
    f.reply(1, { code: 0, data: { outcome, data: { id: 'old' } } })
    await mutation
    const refresh = f.manager.search({ scope: 'global' }, {}, true)
    assert.equal(f.calls.length, 3)
    assert.equal(f.ids(), 1)
    f.reply(2, { code: 0, data: { outcome: 'success', data: { results: [], truncated: false } } })
    await refresh
    assert.equal(f.manager.mutation?.result?.outcome, outcome)
  }
})
