import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MemoryMaintenanceController, type MaintenanceDeps } from '../render/maintenance-controller'
const receipt = {
  path: '/backups/test',
  createdAt: '2026-11-14T00:00:00.000Z',
  files: 4,
  bytes: 200
}
function fixture(overrides: Partial<MaintenanceDeps> = {}) {
  const calls: string[] = []
  const deps: MaintenanceDeps = {
    id: () => 'request-id',
    choose: async () => '/selected',
    confirmRestore: async () => true,
    maintain: async (kind) => {
      calls.push(kind)
      return { outcome: 'success', data: receipt }
    },
    status: async () => ({ outcome: 'success', data: receipt }),
    inspect: async () => ({
      outcome: 'success',
      data: {
        primary: { status: 'missing' },
        previous: { status: 'missing' },
        projectDirectoryIds: [],
        unmappedProjectIds: [],
        unmappedAfterPreviousRestore: [],
        warnings: []
      }
    }),
    projects: async () => ({ outcome: 'success', data: [] }),
    selectedProjectPath: () => undefined,
    chooseProject: async () => '/new',
    confirmRelink: async () => true,
    relink: async (input) => ({
      outcome: 'success',
      data: {
        projectId: input.projectId,
        name: 'Project',
        previousPath: input.expectedPath,
        project_path: input.newPath,
        changed: true
      }
    }),
    afterRelink: async () => {},
    runtime: async () => ({ outcome: 'success', data: { dataRoot: '/data' } }),
    openPath: async () => {},
    afterRestore: async () => {},
    notify: () => {},
    ...overrides
  }
  return { controller: new MemoryMaintenanceController(deps), calls }
}
test('one operation owns selection, duplicate clicks, page re-entry and the terminal receipt', async () => {
  let choose!: (value: string) => void
  const f = fixture({
    choose: () =>
      new Promise((resolve) => {
        choose = resolve
      })
  })
  const first = f.controller.backup()
  assert.equal(first, f.controller.backup())
  assert.equal(first, f.controller.restore())
  assert.equal(f.controller.operation?.stage, 'selecting')
  choose('/backup-parent')
  await first
  assert.deepEqual(f.calls, ['backup'])
  assert.equal(f.controller.operation?.stage, 'complete')
  assert.deepEqual(f.controller.lastBackup, receipt)
})
test('cancellation and a declined restore never send writes or report an error', async () => {
  const f = fixture({ choose: async () => undefined })
  await f.controller.backup()
  assert.equal(f.calls.length, 0)
  assert.equal(f.controller.operation, undefined)
  const g = fixture({ confirmRestore: async () => false })
  await g.controller.restore()
  assert.equal(g.calls.length, 0)
  assert.equal(g.controller.operation, undefined)
})
test('unknown writes can only check the original receipt; they never execute another backup', async () => {
  const f = fixture({
    maintain: async () => {
      f.calls.push('backup')
      throw Error('operation_unknown')
    }
  })
  await f.controller.backup()
  assert.equal(f.controller.operation?.result?.outcome, 'unknown')
  await f.controller.restore()
  assert.deepEqual(f.calls, ['backup'])
  await f.controller.checkOperation()
  assert.equal(f.controller.operation?.result?.outcome, 'success')
  assert.deepEqual(f.calls, ['backup'])
  assert.deepEqual(f.controller.lastBackup, receipt)
})
test('refresh failures remain separate from successful restore and preserve the safety backup path', async () => {
  const f = fixture({
    maintain: async () => ({
      outcome: 'success',
      data: { ...receipt, safetyBackupPath: '/backup/before' }
    }),
    afterRestore: async () => {
      throw Error('refresh')
    }
  })
  await f.controller.restore()
  assert.equal(f.controller.operation?.result?.outcome, 'success')
  assert.equal(f.controller.lastRestore?.safetyBackupPath, '/backup/before')
  assert.ok(f.controller.operation?.result?.data?.warnings?.includes('maintenance_refresh_warning'))
})
test('directory actions are deduplicated and inspection failure never implies healthy data', async () => {
  let release!: () => void
  let opened = 0
  const f = fixture({
    openPath: async () => {
      opened++
      await new Promise<void>((r) => {
        release = r
      })
    },
    inspect: async () => {
      throw Error('offline')
    }
  })
  const first = f.controller.openDirectory('/data')
  assert.equal(first, f.controller.openDirectory('/data'))
  release()
  await first
  assert.equal(opened, 1)
  await f.controller.refresh()
  assert.equal(f.controller.inspection?.outcome, 'failed')
  assert.equal(f.controller.runtimeResult?.outcome, 'success')
})

test('reactive UI observes restore stages and re-enables actions after supplementary refresh finishes', async () => {
  const { reactive, computed, nextTick } = await import('vue')
  let release!: () => void
  const f = fixture({
    afterRestore: () =>
      new Promise<void>((resolve) => {
        release = resolve
      })
  })
  const controller = reactive(f.controller)
  const label = computed(() => controller.operation?.stage)
  const blocked = computed(() => controller.blocked)
  const flight = controller.restore()
  assert.equal(label.value, 'selecting')
  for (let i = 0; i < 5; i++) await Promise.resolve()
  await nextTick()
  assert.equal(label.value, 'running')
  assert.equal(blocked.value, true)
  release()
  await flight
  await nextTick()
  assert.equal(label.value, 'complete')
  assert.equal(blocked.value, false)
})

test('reassociation owns the selected project, rejects duplicate actions and refreshes restored path availability', async () => {
  let select!: (path: string | undefined) => void
  const project = {
    projectId: 'old-id',
    name: 'Old project',
    project_path: '/old',
    path_status: 'missing' as const
  }
  const inputs: any[] = []
  const f = fixture({
    chooseProject: () =>
      new Promise((resolve) => {
        select = resolve
      }),
    relink: async (input) => {
      inputs.push(input)
      return {
        outcome: 'success',
        data: {
          projectId: input.projectId,
          name: 'Old project',
          previousPath: input.expectedPath,
          project_path: input.newPath,
          changed: true
        }
      }
    },
    projects: async () => ({
      outcome: 'success',
      data: [{ ...project, project_path: '/new', path_status: 'available' }]
    })
  })
  const first = f.controller.relinkProject(project)
  assert.equal(first, f.controller.relinkProject({ ...project, projectId: 'other' }))
  await f.controller.backup()
  assert.equal(f.calls.length, 0)
  project.project_path = '/mutated-view'
  select('/new')
  await first
  assert.deepEqual(inputs, [{ projectId: 'old-id', expectedPath: '/old', newPath: '/new' }])
  assert.equal(f.controller.relinkOperation?.stage, 'complete')
  assert.equal(f.controller.blocked, false)
  assert.equal(f.controller.projectsResult?.data?.[0].path_status, 'available')
})

test('reassociation cancellation, conflicts, exact unknown retry and supplementary refresh keep distinct outcomes', async () => {
  const project = {
    projectId: 'id',
    name: 'Project',
    project_path: '/old',
    path_status: 'missing' as const
  }
  const cancelled = fixture({ chooseProject: async () => undefined })
  await cancelled.controller.relinkProject(project)
  assert.equal(cancelled.controller.relinkOperation, undefined)
  const refused = fixture({ confirmRelink: async () => false })
  await refused.controller.relinkProject(project)
  assert.equal(refused.controller.relinkOperation, undefined)
  const inputs: any[] = []
  let unknown = true
  const f = fixture({
    relink: async (input) => {
      inputs.push(input)
      if (unknown) throw Error('operation_unknown')
      return {
        outcome: 'success',
        data: {
          projectId: 'id',
          name: 'Project',
          previousPath: '/old',
          project_path: '/new',
          changed: false
        }
      }
    },
    afterRelink: async () => {
      throw Error('supplementary')
    }
  })
  await f.controller.relinkProject(project)
  assert.equal(f.controller.relinkOperation?.result?.outcome, 'unknown')
  await f.controller.restore()
  assert.equal(f.calls.length, 0)
  unknown = false
  await f.controller.retryRelink()
  assert.deepEqual(inputs[0], inputs[1])
  assert.equal(f.controller.relinkOperation?.result?.outcome, 'success')
  assert.ok(
    f.controller.relinkOperation?.result?.warnings?.some(
      (w) => w.code === 'project_relink_refresh_warning'
    )
  )
  const conflict = fixture({
    relink: async () => ({ outcome: 'conflict', error_code: 'project_path_changed' })
  })
  await conflict.controller.relinkProject(project)
  assert.equal(conflict.controller.relinkOperation?.result?.outcome, 'conflict')
})

test('a project listing failure remains visible while other maintenance status reads succeed', async () => {
  const f = fixture({
    projects: async () => {
      throw Error('unavailable')
    }
  })
  await f.controller.refresh()
  assert.equal(f.controller.projectsResult?.outcome, 'failed')
  assert.equal(f.controller.inspection?.outcome, 'success')
})

test('post-relink refresh drains an earlier read and requests fresh project paths', async () => {
  let oldRead!: (value: any) => void
  let reads = 0
  const f = fixture({
    projects: async () => {
      reads++
      if (reads === 1)
        return new Promise((r) => {
          oldRead = r
        })
      return {
        outcome: 'success',
        data: [{ projectId: 'id', name: 'Project', project_path: '/new', path_status: 'available' }]
      }
    }
  })
  const before = f.controller.refresh()
  const change = f.controller.relinkProject({
    projectId: 'id',
    name: 'Project',
    project_path: '/old',
    path_status: 'missing'
  })
  for (let i = 0; i < 8; i++) await Promise.resolve()
  oldRead({
    outcome: 'success',
    data: [{ projectId: 'id', name: 'Project', project_path: '/old', path_status: 'missing' }]
  })
  await before
  await change
  assert.equal(reads, 2)
  assert.equal(f.controller.projectsResult?.data?.[0].project_path, '/new')
})

test('a directory conflict waits for explicit choice and merges only after the user selects it', async () => {
  const project = {
    projectId: 'A',
    name: 'Project A',
    project_path: '/a',
    path_status: 'missing' as const
  }
  const inputs: any[] = []
  const f = fixture({
    relink: async (input) => {
      inputs.push(input)
      return input.mergeWith
        ? {
            outcome: 'success',
            data: {
              projectId: 'A',
              name: 'Project A',
              previousPath: '/a',
              project_path: '/new',
              changed: true,
              merged: true,
              mergedProjectIds: ['B']
            }
          }
        : {
            outcome: 'conflict',
            error_code: 'project_path_in_use',
            project_conflict: {
              projectId: 'B',
              name: 'Project B',
              project_path: '/new',
              revision: 7
            }
          }
    }
  })
  const flight = f.controller.relinkProject(project)
  for (let i = 0; i < 10; i++) await Promise.resolve()
  assert.equal(f.controller.relinkOperation?.stage, 'conflict')
  assert.equal(inputs.length, 1)
  assert.equal(inputs[0].mergeWith, undefined)
  assert.equal(flight, f.controller.relinkProject(project))
  f.controller.resolveProjectConflict('merge')
  await flight
  assert.equal(inputs.length, 2)
  assert.equal(inputs[1].mergeWith, 'B')
  assert.equal(inputs[1].mergeRevision, 7)
  assert.equal(f.controller.relinkOperation?.result?.data?.merged, true)
})

test('conflict cancellation writes nothing and choosing a different directory starts a new selection', async () => {
  const project = { projectId: 'A', name: 'A', project_path: '/a', path_status: 'missing' as const }
  let reads = 0
  const inputs: any[] = []
  const f = fixture({
    chooseProject: async () => (++reads === 1 ? '/occupied' : '/free'),
    relink: async (input) => {
      inputs.push(input)
      return input.newPath === '/occupied'
        ? {
            outcome: 'conflict',
            project_conflict: { projectId: 'B', name: 'B', project_path: '/occupied', revision: 1 }
          }
        : {
            outcome: 'success',
            data: {
              projectId: 'A',
              name: 'A',
              previousPath: '/a',
              project_path: '/free',
              changed: true
            }
          }
    }
  })
  const first = f.controller.relinkProject(project)
  for (let i = 0; i < 10; i++) await Promise.resolve()
  f.controller.resolveProjectConflict('reselect')
  await first
  assert.equal(inputs.length, 2)
  assert.equal(inputs[1].newPath, '/free')
  assert.equal(inputs[1].mergeWith, undefined)
  const g = fixture({
    relink: async () => ({
      outcome: 'conflict',
      project_conflict: { projectId: 'B', name: 'B', project_path: '/new', revision: 1 }
    })
  })
  const cancelled = g.controller.relinkProject(project)
  for (let i = 0; i < 10; i++) await Promise.resolve()
  g.controller.resolveProjectConflict('cancel')
  await cancelled
  assert.equal(g.controller.relinkOperation, undefined)
})

test('an unknown merge retry replays the chosen target and revision without deciding again', async () => {
  const inputs: any[] = []
  let committed = false
  const f = fixture({
    relink: async (input) => {
      inputs.push(input)
      if (!input.mergeWith)
        return {
          outcome: 'conflict',
          project_conflict: { projectId: 'B', name: 'B', project_path: '/new', revision: 9 }
        }
      if (!committed) throw Error('operation_unknown')
      return {
        outcome: 'success',
        data: {
          projectId: 'A',
          name: 'A',
          previousPath: '/a',
          project_path: '/new',
          changed: false,
          merged: true,
          mergedProjectIds: ['B']
        }
      }
    }
  })
  const flight = f.controller.relinkProject({
    projectId: 'A',
    name: 'A',
    project_path: '/a',
    path_status: 'missing'
  })
  for (let i = 0; i < 10; i++) await Promise.resolve()
  f.controller.resolveProjectConflict('merge')
  await flight
  assert.equal(f.controller.relinkOperation?.result?.outcome, 'unknown')
  committed = true
  await f.controller.retryRelink()
  assert.deepEqual(inputs[1], inputs[2])
  assert.equal(f.controller.relinkOperation?.stage, 'complete')
})
