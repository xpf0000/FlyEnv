import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  writeFile,
  rm,
  symlink,
  realpath,
  stat,
  copyFile
} from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProjectRegistry } from '../fork/ProjectRegistry'
import { AtomicFile, AtomicWriteFailure } from '../fork/AtomicFile'
import type { ResolvedScope } from '../shared'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'flyenv-projects-'))
  const data = join(root, 'data')
  const project = join(root, '代码 with spaces')
  await mkdir(project)
  return {
    root,
    data,
    project,
    registry: new ProjectRegistry(data),
    clean: () => rm(root, { recursive: true, force: true })
  }
}
const ref = (project_path: string) => ({ scope: 'project' as const, project_path })
const create = { create: true, createProject: false }
const scope = (value: any): ResolvedScope => {
  assert.ok(value?.projectId, JSON.stringify(value))
  return value
}

test('unknown search has no file side effects; registration yields a stable immutable project identity', async () => {
  const f = await fixture()
  try {
    const unknown: any = await f.registry.resolve(ref(f.project), { create: false })
    assert.equal(unknown.error_code, 'project_unregistered')
    assert.equal(await readdir(f.data).catch(() => null), null)
    const first = scope(await f.registry.resolve(ref(f.project), create))
    assert.ok(Object.isFrozen(first))
    assert.equal(
      scope(await new ProjectRegistry(f.data).resolve(ref(f.project), create)).projectId,
      first.projectId
    )
    assert.equal(
      JSON.parse(await readFile(join(f.data, 'projects.previous.json'), 'utf8')).revision,
      0
    )
  } finally {
    await f.clean()
  }
})
test('same names, component-prefix siblings and worktrees remain separate; real symlink aliases share identity', async () => {
  const f = await fixture()
  try {
    const roots = ['a/repo', 'b/repo', 'repo', 'repository', 'main-worktree', 'feature-worktree']
    const ids = new Set<string>()
    for (const name of roots) {
      const path = join(f.root, name)
      await mkdir(path, { recursive: true })
      ids.add(scope(await f.registry.resolve(ref(path), create)).projectId!)
    }
    assert.equal(ids.size, roots.length)
    const original = scope(await f.registry.resolve(ref(f.project), create))
    const alias = join(f.root, 'alias')
    await symlink(f.project, alias, process.platform === 'win32' ? 'junction' : 'dir')
    assert.equal(scope(await f.registry.resolve(ref(alias), create)).projectId, original.projectId)
  } finally {
    await f.clean()
  }
})
test('unknown descendants return only ancestor choices and require explicit independent creation', async () => {
  const f = await fixture()
  try {
    const parent = scope(await f.registry.resolve(ref(f.project), create))
    const child = join(f.project, 'child')
    await mkdir(child)
    const blocked: any = await f.registry.resolve(ref(child), create)
    assert.equal(blocked.error_code, 'project_selection_required')
    assert.deepEqual(blocked.project_candidates, [
      { name: '代码 with spaces', project_path: await realpath(f.project) }
    ])
    assert.equal(JSON.stringify(blocked).includes(parent.projectId!), false)
    const search: any = await f.registry.resolve(ref(child), { create: false })
    assert.equal(search.error_code, 'project_unregistered')
    const independent = scope(
      await f.registry.resolve(ref(child), { create: true, createProject: true })
    )
    assert.notEqual(independent.projectId, parent.projectId)
    assert.equal(
      scope(await f.registry.resolve(ref(child), create)).projectId,
      independent.projectId
    )
  } finally {
    await f.clean()
  }
})
test('concurrent first registrations are serialized and retain both identities', async () => {
  const f = await fixture()
  try {
    const second = join(f.root, 'second')
    await mkdir(second)
    const results = await Promise.all([
      f.registry.resolve(ref(f.project), create),
      f.registry.resolve(ref(second), create),
      f.registry.resolve(ref(f.project), create)
    ])
    assert.equal(scope(results[0]).projectId, scope(results[2]).projectId)
    assert.notEqual(scope(results[0]).projectId, scope(results[1]).projectId)
    assert.equal((await f.registry.listProjects()).data?.length, 2)
  } finally {
    await f.clean()
  }
})
test('native volume case behavior is respected without unconditional lowercasing', async () => {
  const f = await fixture()
  try {
    const upper = join(f.root, 'CaseProject')
    const lower = join(f.root, 'caseproject')
    await mkdir(upper)
    await mkdir(lower, { recursive: true })
    const a = scope(await f.registry.resolve(ref(upper), create))
    const b = scope(await f.registry.resolve(ref(lower), create))
    const [sa, sb] = await Promise.all([stat(upper), stat(lower)])
    assert.equal(a.projectId === b.projectId, sa.dev === sb.dev && sa.ino === sb.ino)
  } finally {
    await f.clean()
  }
})
test('invalid root inputs are rejected and global resolution bypasses a damaged project map', async () => {
  const f = await fixture()
  try {
    const file = join(f.root, 'file')
    await writeFile(file, 'not a directory')
    for (const path of ['relative', '\u0000', file, join(f.root, 'missing')]) {
      const result: any = await f.registry.resolve(ref(path), create)
      assert.equal(result.error_code, 'invalid_project_path')
    }
    await mkdir(f.data)
    await writeFile(join(f.data, 'projects.json'), '{')
    const broken = new ProjectRegistry(f.data)
    assert.equal(
      ((await broken.resolve(ref(f.project), create)) as any).error_code,
      'project_registry_corrupt'
    )
    const global: any = await broken.resolve({ scope: 'global' }, { create: false })
    assert.equal(global.key, 'global')
    assert.equal(global.projectId, undefined)
  } finally {
    await f.clean()
  }
})
test('previous snapshot is required before primary replacement and pre-commit failure preserves the map', async () => {
  for (const failedFile of ['projects.previous.json', 'projects.json']) {
    const f = await fixture()
    try {
      await f.registry.resolve(ref(f.project), create)
      const before = await readFile(join(f.data, 'projects.json'), 'utf8')
      const second = join(f.root, 'second')
      await mkdir(second)
      const atomic = new AtomicFile()
      const registry = new ProjectRegistry(f.data, {
        replace: async (path, bytes) => {
          if (path.endsWith(failedFile)) throw new AtomicWriteFailure('failed')
          return atomic.replace(path, bytes)
        }
      })
      assert.equal(((await registry.resolve(ref(second), create)) as any).outcome, 'failed')
      assert.equal(await readFile(join(f.data, 'projects.json'), 'utf8'), before)
      assert.equal((await registry.listProjects()).data?.length, 1)
    } finally {
      await f.clean()
    }
  }
})
test('post-commit uncertainty does not publish success and the next request reloads for confirmation', async () => {
  const f = await fixture()
  try {
    const atomic = new AtomicFile()
    let failed = false
    const registry = new ProjectRegistry(f.data, {
      replace: async (path, bytes) => {
        await atomic.replace(path, bytes)
        if (!failed && path.endsWith('projects.json')) {
          failed = true
          throw new AtomicWriteFailure('unknown')
        }
        return 'committed'
      }
    })
    const result: any = await registry.resolve(ref(f.project), create)
    assert.equal(result.outcome, 'unknown')
    const confirmed = scope(await registry.resolve(ref(f.project), { create: false }))
    assert.equal(
      JSON.parse(await readFile(join(f.data, 'projects.json'), 'utf8')).projects[0].id,
      confirmed.projectId
    )
  } finally {
    await f.clean()
  }
})
test('missing primary with existing project directories cannot initialize an empty mapping', async () => {
  const f = await fixture()
  try {
    const id = '123e4567-e89b-42d3-a456-426614174000'
    await mkdir(join(f.data, 'projects', id), { recursive: true })
    const result: any = await f.registry.resolve(ref(f.project), create)
    assert.equal(result.error_code, 'project_registry_missing')
    assert.equal(await readFile(join(f.data, 'projects.json'), 'utf8').catch(() => null), null)
    assert.deepEqual((await f.registry.inspectRecovery()).unmappedProjectIds, [id])
  } finally {
    await f.clean()
  }
})
test('offline previous restore exposes unmapped directories and removed roots remain manageable by ID', async () => {
  const f = await fixture()
  try {
    const first = scope(await f.registry.resolve(ref(f.project), create))
    await mkdir(first.directory, { recursive: true })
    const secondPath = join(f.root, 'second')
    await mkdir(secondPath)
    const second = scope(await f.registry.resolve(ref(secondPath), create))
    await mkdir(second.directory, { recursive: true })
    const report = await f.registry.inspectRecovery()
    assert.equal(report.primary.status, 'valid')
    assert.equal(report.previous.status, 'valid')
    assert.deepEqual(report.unmappedAfterPreviousRestore, [second.projectId])
    await rm(f.project, { recursive: true })
    assert.equal(scope(await f.registry.resolveById(first.projectId!)).projectId, first.projectId)
    assert.equal(
      (await f.registry.listProjects()).data?.find((p) => p.projectId === first.projectId)
        ?.path_status,
      'missing'
    )
    // Explicit offline recovery action; registry never does this copy itself.
    await copyFile(join(f.data, 'projects.previous.json'), join(f.data, 'projects.json'))
    const restored = new ProjectRegistry(f.data)
    assert.deepEqual((await restored.inspectRecovery()).unmappedProjectIds, [second.projectId])
    assert.ok((await stat(second.directory)).isDirectory())
  } finally {
    await f.clean()
  }
})

test('registration validates the current primary again before preserving or overwriting it', async () => {
  const f = await fixture()
  try {
    await f.registry.resolve(ref(f.project), create)
    await writeFile(join(f.data, 'projects.json'), '{damaged')
    const second = join(f.root, 'second')
    await mkdir(second)
    assert.equal(
      ((await f.registry.resolve(ref(second), create)) as any).error_code,
      'project_registry_corrupt'
    )
    assert.equal(await readFile(join(f.data, 'projects.json'), 'utf8'), '{damaged')
  } finally {
    await f.clean()
  }
})
test('unknown previous-snapshot persistence still means the primary registration was not attempted', async () => {
  const f = await fixture()
  try {
    await f.registry.resolve(ref(f.project), create)
    const before = await readFile(join(f.data, 'projects.json'), 'utf8')
    const second = join(f.root, 'second')
    await mkdir(second)
    const atomic = new AtomicFile()
    const registry = new ProjectRegistry(f.data, {
      replace: async (path, bytes) => {
        await atomic.replace(path, bytes)
        if (path.endsWith('projects.previous.json')) throw new AtomicWriteFailure('unknown')
        return 'committed'
      }
    })
    const result: any = await registry.resolve(ref(second), create)
    assert.equal(result.outcome, 'failed')
    assert.equal(result.error_code, 'project_previous_save_failed')
    assert.equal(await readFile(join(f.data, 'projects.json'), 'utf8'), before)
  } finally {
    await f.clean()
  }
})
