import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'

async function setup(overrides: Record<string, any> = {}) {
  const calls: any[] = []
  const notices: any[] = []
  const manager: any = {
    preferences: { a: { marks: { old: 'keep' } }, b: {} },
    credentials: { a: { user: 'root', password: 'old' } },
    operations: {},
    snapshots: {},
    groupFor: () => ({ mode: 'standalone', memberIds: ['a'] }),
    deps: { notify: (...args: any[]) => notices.push(args) },
    command: async (...args: any[]) => {
      calls.push(args)
      return true
    },
    savePreferences: async (id: string, patch: any) => {
      manager.preferences[id] = { ...manager.preferences[id], ...patch }
      return { status: 'completed' }
    },
    ...overrides
  }
  const boundary = {
    manager,
    copy: async (_value: string) => undefined,
    open: async (_path: string): Promise<any> => '',
    pick: async () => ({ canceled: true, filePaths: [] })
  }
  ;(globalThis as any).__mysqlManagement = boundary
  const result = await build({
    entryPoints: ['plugins/mysql-cluster/render/manage.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    plugins: [
      {
        name: 'management-host',
        setup(builder) {
          builder.onResolve({ filter: /^(?:@|\.\/manager$|element-plus$)/ }, (args) => ({
            path: args.path,
            namespace: 'host'
          }))
          builder.onLoad({ filter: /.*/, namespace: 'host' }, (args) => ({
            contents:
              args.path === '@/util/Index'
                ? 'export const reactiveBind=x=>x'
                : args.path === '@lang/index'
                  ? 'export const I18nT=x=>x'
                  : args.path === './manager'
                    ? 'export const MysqlClusterManager=globalThis.__mysqlManagement.manager'
                    : args.path === 'element-plus'
                      ? 'export const ElMessageBox={confirm:async()=>true}'
                      : 'export const clipboard={writeText:v=>globalThis.__mysqlManagement.copy(v)};export const dialog={showOpenDialog:()=>globalThis.__mysqlManagement.pick()};export const shell={openPath:p=>globalThis.__mysqlManagement.open(p)}'
          }))
        }
      }
    ]
  })
  const { MysqlManagementController } = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Math.random()}`
  )
  return { c: new MysqlManagementController(), manager, calls, notices, boundary }
}

test('database SQL success survives supplementary save and refresh failures', async () => {
  const { c, calls, notices } = await setup({
    command: async (id: string, method: string, args: any[], write: boolean) => {
      calls.push([id, method, args, write])
      if (method === 'getDatabasesWithUsers') throw new Error('refresh failed')
      return { userCreated: true }
    },
    savePreferences: async () => {
      throw new Error('storage failed')
    }
  })
  assert.equal(
    await c.add('a', { database: 'app', user: 'app', password: 'secret', charset: 'utf8mb4' }),
    true
  )
  assert.equal(calls.filter((call) => call[1] === 'addDatabase').length, 1)
  assert.equal(calls[0][3], true)
  assert.equal(notices.length, 2)
  assert.equal(c.busy('a'), false)
})

test('backup shares active promise, freezes selection and keeps terminal outcomes when opening folder fails', async () => {
  let finish!: (value: any) => void
  const { c, manager, calls, boundary } = await setup({
    command: async (...args: any[]) => {
      calls.push(args)
      return new Promise((resolve) => {
        finish = resolve
      })
    }
  })
  manager.preferences.a.backupDir = '/export'
  boundary.open = async () => {
    throw new Error('folder unavailable')
  }
  const selection = ['app']
  const first = c.backup('a', selection)
  const second = c.backup('a', ['other'])
  selection.push('later')
  assert.equal(first, second)
  await Promise.resolve()
  assert.equal(c.actions.a, 'backup')
  assert.deepEqual(calls[0][2][1], ['app'])
  const result = {
    status: 'partial',
    items: [
      { id: 'app', status: 'completed' },
      { id: 'other', status: 'failed' }
    ]
  }
  finish(result)
  assert.deepEqual(await first, result)
  assert.equal(c.busy('a'), false)
})

test('SQL password reset refreshes all group sessions despite one preference failure', async () => {
  const { c, manager, calls } = await setup({
    groupFor: () => ({ mode: 'replication', memberIds: ['a', 'b'] })
  })
  manager.preferences.a.rootCredential = { user: 'root', password: 'old' }
  const saved: string[] = []
  manager.savePreferences = async (id: string) => {
    saved.push(id)
    if (id === 'a') throw new Error('storage unavailable')
    return { status: 'completed' }
  }
  assert.equal(await c.password('a', 'root', 'localhost', 'new', true), true)
  assert.deepEqual(saved, ['a', 'b'])
  assert.equal(manager.credentials.a.password, 'new')
  assert.equal(manager.credentials.b.password, 'new')
  assert.equal(calls[0][1], 'passwordChange')
  assert.equal(calls[0][3], true)
})

test('saving a password or note is per-instance local persistence without a SQL mutation', async () => {
  const { c, manager, calls } = await setup()
  assert.equal(await c.savePassword('a', 'app', '%', 'saved'), true)
  assert.equal(await c.saveMark('a', 'app', 'note'), true)
  assert.equal(manager.preferences.a.passwords['app@%'], 'saved')
  assert.deepEqual(manager.preferences.a.marks, { old: 'keep', app: 'note' })
  assert.deepEqual(manager.preferences.b, {})
  assert.deepEqual(calls, [])
})

test('copy notification failures never reclassify a successful clipboard write', async () => {
  const notices: string[] = []
  const { c, boundary } = await setup({
    deps: {
      notify(type: string) {
        notices.push(type)
        throw new Error('presentation')
      }
    }
  })
  let copied = ''
  boundary.copy = async (value) => {
    copied = value
  }
  await c.copy('secret')
  assert.equal(copied, 'secret')
  assert.deepEqual(notices, ['success'])
})

test('replica and unknown GR roles stay readonly while a confirmed online primary is writable', async () => {
  const { c, manager } = await setup()
  manager.groupFor = () => ({ mode: 'replication', memberIds: ['a', 'b'] })
  assert.equal(c.readOnly('b'), true)
  assert.equal(c.readOnly('a'), false)
  manager.groupFor = () => ({ mode: 'group-replication', memberIds: ['a', 'b'] })
  assert.equal(c.readOnly('a'), true)
  manager.snapshots.a = { replication: { role: 'PRIMARY', state: 'online' } }
  assert.equal(c.readOnly('a'), false)
})
