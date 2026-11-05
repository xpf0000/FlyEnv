import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { AjvJsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/ajv-provider.js'
import { MemoryEngine, memoryToolResult } from '../fork/MemoryEngine'
import { memoryInputSchema } from '../core/schema'
import { validateInput } from '../core/validation'
import { PREVIEW_BUDGETS } from '../core/limits'
import { AtomicFile, AtomicWriteFailure } from '../fork/AtomicFile'
import type { MemoryInputs, MemoryMethod } from '../shared'

const draft = (): MemoryInputs['store'] => ({
  scope: 'global',
  request_id: randomUUID(),
  type: 'decision',
  title: 'Durable choice',
  topic: 'storage',
  summary: 'Use JSON with immutable Markdown',
  tags: ['Storage'],
  content: 'Complete fixture body',
  source: { kind: 'user_statement', agent: 'fixture', description: 'Constructed choice' }
})

test('public MCP names retain the approved flyenv_memory prefix', async () => {
  const manifest = JSON.parse(await readFile(new URL('../plugin.json', import.meta.url), 'utf8'))
  assert.deepEqual(
    manifest.mcp.tools.map((tool: any) => tool.name),
    ['search', 'get', 'store', 'update', 'forget'].map((method) => `flyenv_memory_${method}`)
  )
})

test('accepted large UTF-8 or escaped metadata remains searchable with bounded pages and complete get', async () => {
  const f = await fixture()
  try {
    const ids: string[] = []
    const small = await f.engine.call('store', draft())
    ids.push(small.data!.id)
    for (const char of ['😀', '\u0001']) {
      const input = {
        ...draft(),
        pinned: true,
        title: char.repeat(120),
        summary: char.repeat(600),
        topic: char.repeat(160),
        tags: Array.from({ length: 12 }, (_, i) => char.repeat(62) + i),
        source: {
          kind: 'document' as const,
          agent: char.repeat(120),
          description: char.repeat(600),
          uri: 'https://x/' + 'a'.repeat(2038)
        }
      }
      const stored = await f.engine.call('store', input)
      assert.equal(stored.outcome, 'success')
      ids.push(stored.data!.id)
      assert.deepEqual(
        (await f.engine.call('get', { scope: 'global', id: stored.data!.id })).data!.source,
        input.source
      )
    }
    const seen: string[] = []
    let cursor: string | undefined
    do {
      const page = await f.engine.call('search', { scope: 'global', ...(cursor ? { cursor } : {}) })
      assert.equal(page.outcome, 'success')
      assert.ok(Buffer.byteLength(JSON.stringify(page)) <= PREVIEW_BUDGETS.responseBytes)
      assert.ok(page.data!.results.length > 0)
      for (const row of page.data!.results) {
        if (row.id !== small.data!.id) assert.ok(row.metadata_omitted?.length)
      }
      seen.push(...page.data!.results.map((row) => row.id))
      assert.ok(seen.length <= ids.length, 'pagination must advance without duplicates')
      cursor = page.data!.next_cursor
    } while (cursor)
    assert.deepEqual(seen.sort(), ids.sort())
  } finally {
    await f.clean()
  }
})
async function fixture(options: ConstructorParameters<typeof MemoryEngine>[1] = {}) {
  const temp = await mkdtemp(join(tmpdir(), 'flyenv-api-'))
  const root = join(temp, 'data')
  const project = join(temp, 'project')
  await mkdir(project)
  const engine = new MemoryEngine(root, options)
  return {
    temp,
    root,
    project,
    engine,
    clean: async () => {
      await engine.close()
      await rm(temp, { recursive: true, force: true })
    }
  }
}

test('one engine preserves receipts across restart, history/reasons and global lookup scope', async () => {
  const f = await fixture()
  try {
    const input = draft()
    const stored = await f.engine.call('store', input)
    assert.equal(stored.outcome, 'success')
    assert.deepEqual(Object.keys(stored).sort(), ['data', 'outcome'])
    const id = stored.data!.id
    const changed = await f.engine.call('update', {
      scope: 'global',
      id,
      expected_revision: 1,
      request_id: randomUUID(),
      reason: 'Confirmed choice',
      changes: { content: 'Second body' }
    })
    assert.equal(changed.data!.revision, 2)
    assert.equal(
      (await f.engine.call('get', { scope: 'global', id })).data!.change_reason,
      'Confirmed choice'
    )
    assert.equal(
      (await f.engine.call('get', { scope: 'global', id, revision: 1 })).data!.content,
      input.content
    )
    await f.engine.close()
    const restarted = new MemoryEngine(f.root)
    assert.deepEqual(await restarted.call('store', input), stored)
    const combined = await restarted.call('search', {
      scope: 'project',
      project_path: f.project,
      include_global: true
    })
    assert.equal(combined.data!.results[0].scope, 'global')
    assert.equal(
      (await restarted.call('get', { scope: 'project', project_path: f.project, id })).error_code,
      'project_unregistered'
    )
    assert.equal(
      (await restarted.call('get', { scope: 'global', id })).data!.content,
      'Second body'
    )
    await restarted.close()
  } finally {
    await f.clean()
  }
})
test('unknown project reads do not create data; child choice requires explicit independent registration', async () => {
  const f = await fixture()
  try {
    const empty = await f.engine.call('search', { scope: 'project', project_path: f.project })
    assert.equal(empty.data!.unregistered, true)
    await assert.rejects(readdir(f.root), { code: 'ENOENT' })
    await f.engine.call('store', { ...draft(), scope: 'project', project_path: f.project })
    const child = join(f.project, 'child')
    await mkdir(child)
    const candidate = await f.engine.call('search', { scope: 'project', project_path: child })
    assert.equal(candidate.data!.project_candidates!.length, 1)
    const next = { ...draft(), scope: 'project' as const, project_path: child }
    assert.equal((await f.engine.call('store', next)).error_code, 'project_selection_required')
    assert.equal(
      (await f.engine.call('store', { ...next, create_project: true })).outcome,
      'success'
    )
    assert.equal((await f.engine.listProjects()).data!.length, 2)
  } finally {
    await f.clean()
  }
})
test('admin ID access works after the project root disappears and rejects injected scope/path/method', async () => {
  const f = await fixture()
  try {
    const stored = await f.engine.call('store', {
      ...draft(),
      scope: 'project',
      project_path: f.project
    })
    const projectId = (await f.engine.listProjects()).data![0].projectId
    await rm(f.project, { recursive: true })
    assert.equal((await f.engine.listProjects()).data![0].path_status, 'missing')
    const id = stored.data!.id
    assert.equal(
      (
        await f.engine.callForProject(projectId, 'update', {
          id,
          expected_revision: 1,
          request_id: randomUUID(),
          reason: 'Archive',
          changes: { status: 'archived' }
        })
      ).data!.revision,
      2
    )
    assert.equal((await f.engine.callForProject(projectId, 'search', {})).data!.results.length, 0)
    assert.equal(
      (await f.engine.callForProject(projectId, 'search', { status: 'archived' })).data!.results
        .length,
      1
    )
    assert.equal(
      (await f.engine.callForProject(projectId, 'get', { id, project_path: '/bad' } as any))
        .error_code,
      'invalid_input'
    )
    assert.equal(
      (await f.engine.callForProject(projectId, 'close' as any, {})).error_code,
      'invalid_method'
    )
    const forgotten = await f.engine.callForProject(projectId, 'forget', {
      id,
      expected_revision: 2,
      request_id: randomUUID()
    })
    assert.equal(forgotten.outcome, 'success')
    assert.equal((await f.engine.callForProject(projectId, 'get', { id })).outcome, 'deleted')
  } finally {
    await f.clean()
  }
})
test('search filters archived and expired records, validates source/reason and exposes controlled corrupt-record warnings', async () => {
  const f = await fixture()
  try {
    const stored = await f.engine.call('store', { ...draft(), expires_at: '2020-01-01T00:00:00Z' })
    assert.equal((await f.engine.call('search', { scope: 'global' })).data!.results.length, 0)
    assert.equal(
      (await f.engine.call('search', { scope: 'global', include_expired: true })).data!.results[0]
        .expired,
      true
    )
    assert.equal(
      (
        await f.engine.call('update', {
          scope: 'global',
          id: stored.data!.id,
          expected_revision: 1,
          request_id: randomUUID(),
          reason: '',
          changes: { title: 'No reason' }
        })
      ).error_code,
      'invalid_input'
    )
    assert.equal(
      (await f.engine.call('store', { ...draft(), source: {} as any })).error_code,
      'invalid_input'
    )
    await f.engine.close()
    await writeFile(
      join(f.root, 'global', 'records', `${randomUUID()}.json`),
      'PRIVATE corrupt text'
    )
    const restarted = new MemoryEngine(f.root)
    const result = await restarted.call('search', { scope: 'global', include_expired: true })
    assert.equal(result.outcome, 'partial')
    assert.equal(result.data!.results.length, 1)
    assert.equal(memoryToolResult('search', result).isError, false)
    assert.equal(JSON.stringify(result).includes('PRIVATE'), false)
    await restarted.close()
  } finally {
    await f.clean()
  }
})
test('first scope access recovers pending deletion, and a corrupt sibling never prevents a valid write', async () => {
  const f = await fixture({
    deletionIO: {
      unlink: async () => {
        throw new Error('denied')
      }
    }
  })
  try {
    const saved = await f.engine.call('store', draft())
    const request = {
      scope: 'global' as const,
      id: saved.data!.id,
      expected_revision: 1,
      request_id: randomUUID()
    }
    const pending = await f.engine.call('forget', request)
    assert.equal(pending.outcome, 'partial')
    assert.equal(memoryToolResult('forget', pending).isError, true)
    await f.engine.close()
    await writeFile(join(f.root, 'global', 'records', `${randomUUID()}.json`), '{bad')
    const restarted = new MemoryEngine(f.root)
    const next = await restarted.call('store', draft())
    assert.equal(next.outcome, 'success')
    const tomb = JSON.parse(
      await readFile(join(f.root, 'global', 'records', `${saved.data!.id}.json`), 'utf8')
    )
    assert.equal(tomb.cleanup_state, 'complete')
    assert.equal(
      (await restarted.call('store', { ...draft(), request_id: request.request_id })).outcome,
      'success'
    )
    assert.equal(
      (await restarted.call('forget', { ...request, request_id: randomUUID() })).outcome,
      'already_deleted'
    )
    await restarted.close()
  } finally {
    await f.clean()
  }
})
test('committed cache-publication failure and lost reply preserve durable receipt without replay', async () => {
  const f = await fixture({ budgets: { ...PREVIEW_BUDGETS, cacheBytes: 1500 } })
  try {
    const first = await f.engine.call('store', draft())
    await f.engine.call('search', { scope: 'global' })
    const secondInput = { ...draft(), summary: '长'.repeat(600) }
    const second = await f.engine.call('store', secondInput)
    assert.equal(second.outcome, 'success')
    assert.equal(second.warnings?.[0].code, 'cache_invalidated')
    assert.equal(
      (await f.engine.call('get', { scope: 'global', id: second.data!.id })).data!.revision,
      1
    )
    // Simulated delivery loss happens after the engine returns; retry uses the same request.
    const replay = await f.engine.call('store', secondInput)
    assert.deepEqual(replay.data, second.data)
    assert.equal(
      (await f.engine.call('get', { scope: 'global', id: first.data!.id })).outcome,
      'success'
    )
  } finally {
    await f.clean()
  }
})
test('unknown JSON commit is reported, then reconciled from disk before a dependent mutation', async () => {
  const atomic = new AtomicFile()
  let once = true
  const f = await fixture({
    atomic: {
      replace: async (path, bytes) => {
        await atomic.replace(path, bytes)
        if (once && path.includes('/records/')) {
          once = false
          throw new AtomicWriteFailure('unknown')
        }
        return 'committed' as const
      }
    }
  })
  try {
    const request = draft()
    const unknown = await f.engine.call('store', request)
    assert.equal(unknown.outcome, 'unknown')
    assert.equal(memoryToolResult('store', unknown).isError, true)
    const replay = await f.engine.call('store', request)
    assert.equal(replay.outcome, 'success')
    assert.equal(replay.data!.revision, 1)
    assert.equal((await f.engine.call('search', { scope: 'global' })).data!.results.length, 1)
  } finally {
    await f.clean()
  }
})
test('manifest exposes exactly five valid schemas and classifies MCP failures without losing machine fields', async () => {
  const manifest = JSON.parse(await readFile(new URL('../plugin.json', import.meta.url), 'utf8'))
  assert.deepEqual(manifest.mcp.tools.map((tool: any) => tool.name).sort(), [
    'flyenv_memory_forget',
    'flyenv_memory_get',
    'flyenv_memory_search',
    'flyenv_memory_store',
    'flyenv_memory_update'
  ])
  const valid: Record<MemoryMethod, any> = {
    search: { scope: 'global' },
    get: { scope: 'global', id: randomUUID() },
    store: draft(),
    update: {
      scope: 'global',
      id: randomUUID(),
      expected_revision: 1,
      request_id: randomUUID(),
      reason: 'Change',
      changes: { title: 'Title' }
    },
    forget: { scope: 'global', id: randomUUID(), expected_revision: 1, request_id: randomUUID() }
  }
  for (const tool of manifest.mcp.tools) {
    const method = tool.method as MemoryMethod
    assert.deepEqual(tool.inputSchema, memoryInputSchema(method))
    const check = new AjvJsonSchemaValidator().getValidator(tool.inputSchema)
    assert.equal(check(valid[method]).valid, true)
    assert.doesNotThrow(() => validateInput(method, valid[method]))
    assert.equal(check({ ...valid[method], body_ref: '/arbitrary' }).valid, false)
    assert.throws(
      () => validateInput(method, { ...valid[method], body_ref: '/arbitrary' }),
      /invalid_input/
    )
  }
  for (const outcome of ['failed', 'conflict', 'unknown', 'busy'] as const) {
    const result = memoryToolResult('store', {
      outcome,
      id: 'machine-id',
      revision: 2,
      error_code: 'controlled'
    })
    assert.equal(result.isError, true)
    assert.equal(result.id, 'machine-id')
    assert.equal(result.revision, 2)
  }
  assert.equal(memoryToolResult('forget', { outcome: 'already_deleted' }).isError, false)
  assert.equal(memoryToolResult('store', { outcome: 'success' }).isError, false)
})
