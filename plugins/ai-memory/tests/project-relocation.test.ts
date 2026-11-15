import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, cp, rm, readFile, writeFile, symlink } from 'node:fs/promises'
import { basename, join, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID, createHash } from 'node:crypto'
import { MemoryEngine } from '../fork/MemoryEngine'
import { MemoryWorkspace } from '../fork/MemoryWorkspace'
import { AtomicFile, AtomicWriteFailure } from '../fork/AtomicFile'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'memory-relocation-'))
  const old = join(root, 'old')
  const next = join(root, 'new')
  const data = join(root, 'data')
  await mkdir(old)
  await mkdir(next)
  await mkdir(data)
  return { root, old, next, data, clean: () => rm(root, { recursive: true, force: true }) }
}
const draft = (path: string) => ({
  scope: 'project' as const,
  project_path: path,
  type: 'fact' as const,
  topic: 'relocation',
  title: 'Retained project identity',
  summary: 'Synthetic relocation fixture',
  tags: [],
  content: 'original',
  source: { kind: 'document' as const, agent: 'test', description: 'Synthetic test data' },
  request_id: randomUUID()
})

test('relocation retains ID, record/history bytes and deletion receipts across restart and backup restore', async () => {
  const f = await fixture()
  let ws = await MemoryWorkspace.open(f.data)
  try {
    const record = await ws.run((e) => e.call('store', draft(f.old)))
    const id = record.data!.id
    await ws.run((e) =>
      e.call('update', {
        scope: 'project',
        project_path: f.old,
        id,
        expected_revision: 1,
        reason: 'history',
        changes: { content: 'revision two' },
        request_id: randomUUID()
      })
    )
    const deleted = await ws.run((e) => e.call('store', draft(f.old)))
    const forget = {
      scope: 'project' as const,
      project_path: f.old,
      id: deleted.data!.id,
      expected_revision: 1,
      request_id: randomUUID()
    }
    await ws.run((e) => e.call('forget', forget))
    const project = (await ws.run((e) => e.listProjects())).data![0]
    const raw = await readFile(join(f.data, 'projects', project.projectId, 'records', `${id}.json`))
    const digest = createHash('sha256').update(raw).digest('hex')
    await rm(f.old, { recursive: true })
    const input = {
      projectId: project.projectId,
      expectedPath: project.project_path,
      newPath: f.next
    }
    assert.equal((await ws.run((e) => e.relinkProject(input))).outcome, 'success')
    assert.equal(
      createHash('sha256')
        .update(
          await readFile(join(f.data, 'projects', project.projectId, 'records', `${id}.json`))
        )
        .digest('hex'),
      digest
    )
    assert.equal(
      (await ws.run((e) => e.call('get', { scope: 'project', project_path: f.next, id }))).data!
        .content,
      'revision two'
    )
    assert.equal(
      (
        await ws.run((e) =>
          e.call('get', { scope: 'project', project_path: f.next, id, revision: 1 })
        )
      ).data!.content,
      'original'
    )
    assert.equal(
      (await ws.run((e) => e.call('forget', { ...forget, project_path: f.next }))).outcome,
      'success'
    )
    const map = await readFile(join(f.data, 'projects.json'), 'utf8')
    assert.equal((await ws.run((e) => e.relinkProject(input))).data!.changed, false)
    assert.equal(await readFile(join(f.data, 'projects.json'), 'utf8'), map)
    const backup = await ws.backup(f.root)
    assert.equal((await ws.restore(backup.data!.path)).outcome, 'success')
    await ws.close()
    ws = await MemoryWorkspace.open(f.data)
    assert.equal((await ws.run((e) => e.listProjects())).data![0].projectId, project.projectId)
    assert.equal(
      (await ws.run((e) => e.call('search', { scope: 'project', project_path: f.next }))).data!
        .results[0].id,
      id
    )
  } finally {
    await ws.close()
    await f.clean()
  }
})

test('conflicting destinations including symlink aliases, invalid directories and stale UI do not modify mappings', async () => {
  const f = await fixture()
  const e = new MemoryEngine(f.data)
  try {
    await e.call('store', draft(f.old))
    await e.call('store', draft(f.next))
    const projects = (await e.listProjects()).data!
    const project = projects.find((p) => basename(p.project_path) === 'old')!
    const input = {
      projectId: project.projectId,
      expectedPath: project.project_path,
      newPath: f.next
    }
    const original = await readFile(join(f.data, 'projects.json'), 'utf8')
    assert.equal((await e.relinkProject(input)).error_code, 'project_path_in_use')
    const alias = join(f.root, 'alias')
    await symlink(f.next, alias, process.platform === 'win32' ? 'junction' : 'dir')
    assert.equal(
      (await e.relinkProject({ ...input, newPath: alias })).error_code,
      'project_path_in_use'
    )
    assert.equal(
      (await e.relinkProject({ ...input, newPath: join(f.root, 'missing') })).error_code,
      'invalid_project_path'
    )
    const file = join(f.root, 'file')
    await writeFile(file, 'not a directory')
    assert.equal(
      (await e.relinkProject({ ...input, newPath: file })).error_code,
      'invalid_project_path'
    )
    const third = join(f.root, 'third')
    await mkdir(third)
    assert.equal(
      (await e.relinkProject({ ...input, newPath: third, expectedPath: '/stale/path' })).outcome,
      'conflict'
    )
    assert.equal(await readFile(join(f.data, 'projects.json'), 'utf8'), original)
  } finally {
    await e.close()
    await f.clean()
  }
})

test('concurrent moves into one destination retain separate identities and reject the loser', async () => {
  const f = await fixture()
  const e = new MemoryEngine(f.data)
  try {
    await e.call('store', draft(f.old))
    await e.call('store', draft(f.next))
    const projects = (await e.listProjects()).data!
    const destination = join(f.root, 'destination')
    await mkdir(destination)
    const result = await Promise.all(
      projects.map((p) =>
        e.relinkProject({
          projectId: p.projectId,
          expectedPath: p.project_path,
          newPath: destination
        })
      )
    )
    assert.deepEqual(result.map((r) => r.outcome).sort(), ['conflict', 'success'])
    assert.equal(new Set((await e.listProjects()).data!.map((p) => p.project_path)).size, 2)
  } finally {
    await e.close()
    await f.clean()
  }
})

test('an uncertain committed mapping is confirmed by exact retry without another write', async () => {
  const f = await fixture()
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
    await e.call('store', draft(f.old))
    const p = (await e.listProjects()).data![0]
    uncertain = true
    const input = { projectId: p.projectId, expectedPath: p.project_path, newPath: f.next }
    assert.equal((await e.relinkProject(input)).outcome, 'unknown')
    const before = writes
    assert.equal((await e.relinkProject(input)).outcome, 'success')
    assert.equal(writes, before)
  } finally {
    await e.close()
    await f.clean()
  }
})

test('failed previous mapping preservation prevents reassociation and leaves the current path intact', async () => {
  const f = await fixture()
  const atomic = new AtomicFile()
  let fail = false
  const e = new MemoryEngine(f.data, {
    atomic: {
      replace: async (path, bytes) => {
        if (fail && path.endsWith('projects.previous.json')) throw new AtomicWriteFailure('failed')
        return atomic.replace(path, bytes)
      }
    }
  })
  try {
    await e.call('store', draft(f.old))
    const p = (await e.listProjects()).data![0]
    fail = true
    const result = await e.relinkProject({
      projectId: p.projectId,
      expectedPath: p.project_path,
      newPath: f.next
    })
    assert.equal(result.outcome, 'failed')
    assert.equal((await e.listProjects()).data![0].project_path, p.project_path)
  } finally {
    await e.close()
    await f.clean()
  }
})

test('restored foreign absolute paths can be listed and explicitly rebound to a local directory', async () => {
  const f = await fixture()
  const id = randomUUID()
  await writeFile(
    join(f.data, 'projects.json'),
    JSON.stringify({
      schema_version: 1,
      revision: 1,
      projects: [
        {
          id,
          name: 'Imported project',
          canonical_path: 'C:\\Users\\test\\Project',
          created_at: new Date().toISOString()
        }
      ]
    })
  )
  const e = new MemoryEngine(f.data)
  try {
    const p = (await e.listProjects()).data![0]
    assert.equal(p.path_status, 'missing')
    assert.equal(
      (await e.relinkProject({ projectId: id, expectedPath: p.project_path, newPath: f.next }))
        .outcome,
      'success'
    )
    assert.equal((await e.listProjects()).data![0].projectId, id)
  } finally {
    await e.close()
    await f.clean()
  }
})

test('relocation resolves the captured legacy selection alias before changing its mapping', async () => {
  const f = await fixture()
  const e = new MemoryEngine(f.data)
  try {
    await e.call('store', draft(f.old))
    const p = (await e.listProjects()).data![0]
    const alias = join(f.root, 'selected-alias')
    await symlink(f.old, alias, process.platform === 'win32' ? 'junction' : 'dir')
    const input = {
      projectId: p.projectId,
      expectedPath: p.project_path,
      newPath: f.next,
      selectedPath: alias + sep
    }
    const result = await e.relinkProject(input)
    assert.equal(result.outcome, 'success')
    assert.equal(result.data!.selectedPath, alias + sep)
    assert.equal((await e.relinkProject(input)).data!.selectedPath, alias + sep)
  } finally {
    await e.close()
    await f.clean()
  }
})

test('unusable optional selection hints never prevent a valid project reassociation', async () => {
  for (const selectedPath of ['relative/old', 'C:\\Users\\someone\\Old']) {
    const f = await fixture()
    const e = new MemoryEngine(f.data)
    try {
      await e.call('store', draft(f.old))
      const p = (await e.listProjects()).data![0]
      const result = await e.relinkProject({
        projectId: p.projectId,
        expectedPath: p.project_path,
        newPath: f.next,
        selectedPath
      })
      assert.equal(result.outcome, 'success')
      assert.equal(result.data!.selectedPath, undefined)
    } finally {
      await e.close()
      await f.clean()
    }
  }
})

test('independent registration cannot erase an uncertain relocation selection proof', async () => {
  const f = await fixture()
  const atomic = new AtomicFile()
  let uncertain = false
  const e = new MemoryEngine(f.data, {
    atomic: {
      replace: async (path, bytes) => {
        await atomic.replace(path, bytes)
        if (uncertain && path.endsWith('projects.json')) throw new AtomicWriteFailure('unknown')
        return 'committed'
      }
    }
  })
  try {
    await e.call('store', draft(f.old))
    const p = (await e.listProjects()).data![0]
    const alias = join(f.root, 'alias')
    await symlink(f.old, alias, process.platform === 'win32' ? 'junction' : 'dir')
    const input = {
      projectId: p.projectId,
      expectedPath: p.project_path,
      newPath: f.next,
      selectedPath: alias + sep
    }
    uncertain = true
    assert.equal((await e.relinkProject(input)).outcome, 'unknown')
    uncertain = false
    const other = join(f.root, 'unrelated')
    await mkdir(other)
    assert.equal((await e.call('store', draft(other))).outcome, 'success')
    const result = await e.relinkProject(input)
    assert.equal(result.outcome, 'success')
    assert.equal(result.data!.previousPath, p.project_path)
    assert.equal(result.data!.selectedPath, input.selectedPath)
  } finally {
    await e.close()
    await f.clean()
  }
})

test('a renamed backup restores into another data root and relinks project memories without affecting global data', async () => {
  const f = await fixture()
  const source = await MemoryWorkspace.open(f.data)
  let destination: MemoryWorkspace | undefined
  try {
    const projectRecord = await source.run((e) => e.call('store', draft(f.old)))
    const globalRecord = await source.run((e) =>
      e.call('store', { ...draft(f.old), scope: 'global', project_path: undefined })
    )
    assert.equal(globalRecord.outcome, 'success')
    const project = (await source.run((e) => e.listProjects())).data![0]
    const backup = await source.backup(f.root)
    await source.close()
    await rm(f.old, { recursive: true })
    const otherComputer = join(f.root, 'another-computer')
    await mkdir(otherComputer)
    const movedBackup = join(otherComputer, 'renamed-backup')
    await cp(backup.data!.path, movedBackup, { recursive: true })
    const data = join(otherComputer, 'data')
    await mkdir(data)
    destination = await MemoryWorkspace.open(data)
    assert.equal((await destination.restore(movedBackup)).outcome, 'success')
    const imported = (await destination.run((e) => e.listProjects())).data![0]
    assert.equal(imported.path_status, 'missing')
    assert.equal(imported.projectId, project.projectId)
    assert.equal(
      (
        await destination.run((e) =>
          e.relinkProject({
            projectId: imported.projectId,
            expectedPath: imported.project_path,
            newPath: f.next
          })
        )
      ).outcome,
      'success'
    )
    assert.equal(
      (
        await destination.run((e) =>
          e.call('get', { scope: 'project', project_path: f.next, id: projectRecord.data!.id })
        )
      ).data!.content,
      'original'
    )
    assert.equal(
      (await destination.run((e) => e.call('get', { scope: 'global', id: globalRecord.data!.id })))
        .data!.content,
      'original'
    )
  } finally {
    await source.close()
    await destination?.close()
    await f.clean()
  }
})
