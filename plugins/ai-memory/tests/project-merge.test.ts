import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, cp, chmod } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID, createHash } from 'node:crypto'
import { MemoryWorkspace } from '../fork/MemoryWorkspace'

const draft = (project_path: string, title = 'Memory') => ({
  scope: 'project' as const,
  project_path,
  type: 'fact' as const,
  topic: 'merge',
  title,
  summary: 'Synthetic merge fixture',
  tags: [],
  content: title,
  source: { kind: 'document' as const, agent: 'test', description: 'Synthetic merge test' },
  request_id: randomUUID()
})
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'memory-merge-'))
  const data = join(root, 'data')
  const a = join(root, 'A')
  const b = join(root, 'B')
  await mkdir(data)
  await mkdir(a)
  await mkdir(b)
  const ws = await MemoryWorkspace.open(data)
  const inputA = draft(a, 'A memory')
  const inputB = draft(b, 'B memory')
  const memoryA = await ws.run((e) => e.call('store', inputA))
  const memoryB = await ws.run((e) => e.call('store', inputB))
  const projects = (await ws.run((e) => e.listProjects())).data!
  const projectA = projects.find((p) => p.name === 'A')!
  const projectB = projects.find((p) => p.name === 'B')!
  const base = { projectId: projectA.projectId, expectedPath: projectA.project_path, newPath: b }
  async function choice() {
    const conflict = await ws.relinkProject(base)
    assert.equal(conflict.outcome, 'conflict')
    assert.equal(conflict.project_conflict?.projectId, projectB.projectId)
    return {
      ...base,
      mergeWith: projectB.projectId,
      mergeRevision: conflict.project_conflict!.revision
    }
  }
  return {
    root,
    data,
    a,
    b,
    ws,
    inputA,
    inputB,
    memoryA: memoryA.data!,
    memoryB: memoryB.data!,
    projectA,
    projectB,
    base,
    choice,
    clean: async () => {
      await ws.close()
      await rm(root, { recursive: true, force: true })
    }
  }
}
async function hashes(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  async function walk(path: string) {
    for (const file of await readdir(path, { withFileTypes: true })) {
      const full = join(path, file.name)
      if (file.isDirectory()) await walk(full)
      else
        result[full.slice(root.length)] = createHash('sha256')
          .update(await readFile(full))
          .digest('hex')
    }
  }
  await walk(root)
  return result
}

test('explicit merge retains all record bytes and routes search/get/history/update/forget to both original owners', async () => {
  const f = await fixture()
  try {
    await f.ws.run((e) =>
      e.call('update', {
        scope: 'project',
        project_path: f.b,
        id: f.memoryB.id,
        expected_revision: 1,
        changes: { content: 'B history two' },
        reason: 'Synthetic history',
        request_id: randomUUID()
      })
    )
    const before = await hashes(join(f.data, 'projects'))
    const input = await f.choice()
    const result = await f.ws.relinkProject(input)
    assert.equal(result.outcome, 'success')
    assert.equal(result.data!.projectId, f.projectA.projectId)
    assert.ok(result.data!.mergedProjectIds?.includes(f.projectB.projectId))
    assert.deepEqual(await hashes(join(f.data, 'projects')), before)
    assert.equal((await f.ws.run((e) => e.listProjects())).data!.length, 1)
    const search = await f.ws.run((e) => e.call('search', { scope: 'project', project_path: f.b }))
    assert.deepEqual(
      new Set(search.data!.results.map((r) => r.id)),
      new Set([f.memoryA.id, f.memoryB.id])
    )
    assert.equal(
      (
        await f.ws.run((e) =>
          e.call('get', { scope: 'project', project_path: f.b, id: f.memoryB.id, revision: 1 })
        )
      ).data!.content,
      'B memory'
    )
    assert.equal(
      (
        await f.ws.run((e) =>
          e.call('update', {
            scope: 'project',
            project_path: f.b,
            id: f.memoryB.id,
            expected_revision: 2,
            changes: { content: 'B after merge' },
            reason: 'After merge',
            request_id: randomUUID()
          })
        )
      ).data!.revision,
      3
    )
    assert.equal(
      (await f.ws.run((e) => e.callForProject(f.projectB.projectId, 'get', { id: f.memoryB.id })))
        .data!.content,
      'B after merge'
    )
    assert.equal(
      (
        await f.ws.run((e) =>
          e.call('forget', {
            scope: 'project',
            project_path: f.b,
            id: f.memoryA.id,
            expected_revision: 1,
            request_id: randomUUID()
          })
        )
      ).outcome,
      'success'
    )
    assert.equal(
      (await f.ws.run((e) => e.call('search', { scope: 'project', project_path: f.b }))).data!
        .results.length,
      1
    )
    const mapping = JSON.parse(await readFile(join(f.data, 'projects.json'), 'utf8'))
    assert.equal(mapping.schema_version, 2)
    assert.equal(
      mapping.projects.find((p: any) => p.id === f.projectB.projectId).merged_into,
      f.projectA.projectId
    )
  } finally {
    await f.clean()
  }
})

test('a conflict or stale choice never merges automatically and an exact committed merge retry writes nothing', async () => {
  const f = await fixture()
  try {
    const before = await readFile(join(f.data, 'projects.json'), 'utf8')
    const input = await f.choice()
    assert.equal(await readFile(join(f.data, 'projects.json'), 'utf8'), before)
    const c = join(f.root, 'C')
    await mkdir(c)
    await f.ws.run((e) => e.call('store', draft(c)))
    const stale = await f.ws.relinkProject(input)
    assert.equal(stale.outcome, 'conflict')
    assert.equal((await f.ws.run((e) => e.listProjects())).data!.length, 3)
    const refreshed = { ...input, mergeRevision: stale.project_conflict!.revision }
    assert.equal((await f.ws.relinkProject(refreshed)).outcome, 'success')
    const saved = await readFile(join(f.data, 'projects.json'), 'utf8')
    assert.equal((await f.ws.relinkProject(refreshed)).outcome, 'success')
    assert.equal(await readFile(join(f.data, 'projects.json'), 'utf8'), saved)
  } finally {
    await f.clean()
  }
})

test('store replay and deletion receipts survive merging; new concurrent stores remain idempotent', async () => {
  const f = await fixture()
  try {
    const deletedInput = draft(f.b, 'Deleted B')
    const deleted = await f.ws.run((e) => e.call('store', deletedInput))
    await f.ws.run((e) =>
      e.call('forget', {
        scope: 'project',
        project_path: f.b,
        id: deleted.data!.id,
        expected_revision: 1,
        request_id: randomUUID()
      })
    )
    await f.ws.relinkProject(await f.choice())
    const replay = await f.ws.run((e) => e.call('store', { ...f.inputB, project_path: f.b }))
    assert.equal(replay.data!.id, f.memoryB.id)
    const deletedReplay = await f.ws.run((e) => e.call('store', deletedInput))
    assert.equal(deletedReplay.outcome, 'deleted')
    const input = draft(f.b, 'New merged memory')
    const repeated = await Promise.all(
      Array.from({ length: 5 }, () => f.ws.run((e) => e.call('store', input)))
    )
    assert.equal(new Set(repeated.map((r) => r.data!.id)).size, 1)
    assert.equal(
      (await f.ws.run((e) => e.call('search', { scope: 'project', project_path: f.b }))).data!
        .results.length,
      3
    )
  } finally {
    await f.clean()
  }
})

test('merged groups remain readable after backup restore/restart and flatten a later merge', async () => {
  const f = await fixture()
  let reopened: MemoryWorkspace | undefined
  try {
    await f.ws.relinkProject(await f.choice())
    const c = join(f.root, 'C')
    await mkdir(c)
    const recordC = await f.ws.run((e) => e.call('store', draft(c, 'C memory')))
    const rootA = (await f.ws.run((e) => e.listProjects())).data!.find(
      (p) => p.projectId === f.projectA.projectId
    )!
    const base = { projectId: rootA.projectId, expectedPath: rootA.project_path, newPath: c }
    const conflict = await f.ws.relinkProject(base)
    await f.ws.relinkProject({
      ...base,
      mergeWith: conflict.project_conflict!.projectId,
      mergeRevision: conflict.project_conflict!.revision
    })
    const backup = await f.ws.backup(f.root)
    assert.equal((await f.ws.restore(backup.data!.path)).outcome, 'success')
    await f.ws.close()
    reopened = await MemoryWorkspace.open(f.data)
    const records = await reopened.run((e) =>
      e.call('search', { scope: 'project', project_path: c })
    )
    assert.deepEqual(
      new Set(records.data!.results.map((r) => r.id)),
      new Set([f.memoryA.id, f.memoryB.id, recordC.data!.id])
    )
    assert.equal((await reopened.run((e) => e.listProjects())).data!.length, 1)
  } finally {
    await reopened?.close()
    await f.clean()
  }
})

test('ambiguous duplicate record IDs preserve both projects instead of dropping a copy', async () => {
  const f = await fixture()
  try {
    const source = join(f.data, 'projects', f.projectA.projectId)
    const target = join(f.data, 'projects', f.projectB.projectId)
    await cp(
      join(source, 'records', `${f.memoryA.id}.json`),
      join(target, 'records', `${f.memoryA.id}.json`)
    )
    const before = await readFile(join(f.data, 'projects.json'), 'utf8')
    const result = await f.ws.relinkProject(await f.choice())
    assert.equal(result.error_code, 'project_merge_duplicate_ids')
    assert.equal(await readFile(join(f.data, 'projects.json'), 'utf8'), before)
  } finally {
    await f.clean()
  }
})

test('workspace merge waits for earlier work, holds subsequent calls, and drains on shutdown', async () => {
  const f = await fixture()
  try {
    const input = await f.choice()
    let release!: () => void
    const blocker = f.ws.run(
      async () =>
        new Promise<void>((r) => {
          release = r
        })
    )
    await Promise.resolve()
    const merge = f.ws.relinkProject(input)
    let later = false
    const pending = f.ws.run(async (e) => {
      later = true
      return e.listProjects()
    })
    await Promise.resolve()
    assert.equal(later, false)
    const close = f.ws.close()
    release()
    await blocker
    assert.equal((await merge).outcome, 'success')
    assert.equal((await pending).data!.length, 1)
    await close
  } finally {
    await f.clean()
  }
})

test('a shared historical request ID does not silently choose one of two original store receipts', async () => {
  const f = await fixture()
  try {
    const request_id = randomUUID()
    const input = draft(f.a, 'Same request on two scopes')
    await f.ws.run((e) => e.call('store', { ...input, request_id }))
    await f.ws.run((e) => e.call('store', { ...input, project_path: f.b, request_id }))
    await f.ws.relinkProject(await f.choice())
    const result = await f.ws.run((e) =>
      e.call('store', { ...input, project_path: f.b, request_id })
    )
    assert.equal(result.outcome, 'conflict')
    assert.equal(result.error_code, 'merged_request_conflict')
  } finally {
    await f.clean()
  }
})

test('unknown committed merge retries confirm the same group without a second mapping write', async () => {
  const { MemoryEngine } = await import('../fork/MemoryEngine')
  const { AtomicFile, AtomicWriteFailure } = await import('../fork/AtomicFile')
  const f = await fixture()
  await f.ws.close()
  const atomic = new AtomicFile()
  let uncertain = false
  let writes = 0
  const e = new MemoryEngine(f.data, {
    atomic: {
      replace: async (path, bytes) => {
        writes++
        await atomic.replace(path, bytes)
        if (uncertain && path.endsWith('projects.json')) throw new AtomicWriteFailure('unknown')
        return 'committed'
      }
    }
  })
  try {
    const conflict = await e.relinkProject(f.base)
    const input = {
      ...f.base,
      mergeWith: f.projectB.projectId,
      mergeRevision: conflict.project_conflict!.revision
    }
    uncertain = true
    assert.equal((await e.relinkProject(input)).outcome, 'unknown')
    const before = writes
    const confirmed = await e.relinkProject(input)
    assert.equal(confirmed.outcome, 'success')
    assert.equal(writes, before)
    assert.ok(confirmed.data!.mergedProjectIds!.includes(f.projectB.projectId))
    assert.equal(
      (await e.call('search', { scope: 'project', project_path: f.b })).data!.results.length,
      2
    )
  } finally {
    await e.close()
    await f.clean()
  }
})

test(
  'unavailable merged members produce partial search and do not hide an independently readable memory',
  { skip: process.platform === 'win32' || process.getuid?.() === 0 },
  async () => {
    const { MemoryEngine } = await import('../fork/MemoryEngine')
    const f = await fixture()
    let e: InstanceType<typeof MemoryEngine> | undefined
    const records = join(f.data, 'projects', f.projectB.projectId, 'records')
    try {
      await f.ws.relinkProject(await f.choice())
      await f.ws.close()
      await chmod(records, 0o000)
      e = new MemoryEngine(f.data)
      const search = await e.call('search', { scope: 'project', project_path: f.b })
      assert.equal(search.outcome, 'partial')
      assert.deepEqual(
        search.data!.results.map((r) => r.id),
        [f.memoryA.id]
      )
      const got = await e.call('get', { scope: 'project', project_path: f.b, id: f.memoryA.id })
      assert.equal(got.outcome, 'success')
      assert.ok(got.warnings?.length)
      assert.equal(
        (await e.call('store', draft(f.b, 'Cannot verify old receipts'))).outcome,
        'failed'
      )
    } finally {
      await e?.close()
      await chmod(records, 0o700)
      await f.clean()
    }
  }
)

test('cleanup warnings from one member stay supplementary when reading another member', async () => {
  const { MemoryEngine } = await import('../fork/MemoryEngine')
  const f = await fixture()
  let e: InstanceType<typeof MemoryEngine> | undefined
  try {
    await f.ws.relinkProject(await f.choice())
    await f.ws.close()
    const options = {
      deletionIO: {
        unlink: async () => {
          throw Error('synthetic cleanup failure')
        }
      }
    }
    e = new MemoryEngine(f.data, options)
    await e.call('forget', {
      scope: 'project',
      project_path: f.b,
      id: f.memoryB.id,
      expected_revision: 1,
      request_id: randomUUID()
    })
    await e.close()
    e = new MemoryEngine(f.data, options)
    const result = await e.call('get', { scope: 'project', project_path: f.b, id: f.memoryA.id })
    assert.equal(result.outcome, 'success')
    assert.ok(result.warnings?.length)
  } finally {
    await e?.close()
    await f.clean()
  }
})

test('invalid merge cycles, missing roots and v1 membership cannot be loaded or interpreted as empty projects', async () => {
  const { MemoryEngine } = await import('../fork/MemoryEngine')
  const f = await fixture()
  await f.ws.close()
  const original = JSON.parse(await readFile(join(f.data, 'projects.json'), 'utf8'))
  const [a, b] = original.projects
  const cases = [
    {
      ...original,
      schema_version: 2,
      projects: [
        { ...a, merged_into: b.id },
        { ...b, merged_into: a.id }
      ]
    },
    { ...original, schema_version: 2, projects: [a, { ...b, merged_into: randomUUID() }] },
    { ...original, schema_version: 1, projects: [a, { ...b, merged_into: a.id }] },
    { ...original, schema_version: 2, projects: [{ ...a, canonical_path: b.canonical_path }, b] }
  ]
  try {
    for (const mapping of cases) {
      await writeFile(join(f.data, 'projects.json'), JSON.stringify(mapping))
      const e = new MemoryEngine(f.data)
      try {
        assert.equal((await e.listProjects()).outcome, 'failed')
        assert.equal((await e.call('search', { scope: 'global' })).outcome, 'success')
      } finally {
        await e.close()
      }
    }
  } finally {
    await f.clean()
  }
})
