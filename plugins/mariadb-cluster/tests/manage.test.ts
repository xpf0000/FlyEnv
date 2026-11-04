import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { instancePaths } from '../fork/paths'
import { OperationLocks } from '../fork/locks'
const api = await import('../fork/manage').catch(() => ({}) as any)
test('read-only or unknown members cannot execute database management writes', async () => {
  assert.equal(typeof api.assertWritable, 'function')
  const statements: string[] = []
  const session = (rows: any[]) => ({
    async query(sql: string) {
      statements.push(sql)
      return rows
    }
  })
  await assert.rejects(api.assertWritable(session([{ readOnly: 1 }]), 'replication'), /read.only/i)
  await assert.rejects(api.assertWritable(session([]), 'standalone'), /read.only/i)
  await api.assertWritable(session([{ readOnly: 0 }]), 'replication')
  assert.ok(statements.every((sql) => !/super_read_only/i.test(sql)))
  assert.ok(statements.every((sql) => !/performance_schema/i.test(sql)))
})
test('backup option files keep literal secrets off argv and reject NUL', () => {
  const file = api.backupOptions?.({ user: 'root', password: 'a\\b"$`' }, 13307)
  assert.match(file ?? '', /port=13307/)
  assert.match(file, /password="a\\\\b\\"\$`"/)
  assert.throws(() => api.backupOptions({ user: 'root', password: 'a\0b' }, 13307), /credential/i)
})
test('database creation binds user values, escapes identifiers and keeps partial completion visible', async () => {
  const statements: string[] = []
  const session = {
    async query(sql: string) {
      statements.push(sql)
      if (sql.startsWith('CREATE USER')) throw new Error('user failed')
      return []
    }
  }
  await assert.rejects(
    api.createDatabase(session, { database: 'a`b', user: "x'", password: 'p', charset: 'utf8mb4' }),
    /database.*created/i
  )
  assert.equal(
    statements.some((sql) => sql.includes('`a``b`')),
    true
  )
  assert.equal(
    statements.some((sql) => sql.includes("x'")),
    false
  )
})
test('backup uses mariadb-dump without GTID purge flags and reports outcomes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-backup-'))
  try {
    const engineBin = join(root, 'engine', 'bin')
    await mkdir(engineBin, { recursive: true })
    const dump = join(engineBin, 'mariadb-dump')
    await writeFile(dump, '')
    const dataDir = join(root, 'data')
    const paths = instancePaths(root, 'node1')
    await mkdir(paths.dir, { recursive: true })
    const spec = {
      id: 'node1',
      name: 'node1',
      port: 13307,
      serverId: 13307,
      socket: join(root, 'mariadb.sock'),
      dataDir,
      engine: {
        bin: join(engineBin, 'mariadbd'),
        path: join(root, 'engine'),
        version: '10.11.9',
        source: 'Static'
      }
    }
    const catalog = {
      platform: 'macOS',
      operations: new OperationLocks(),
      paths: () => paths,
      instance: async () => ({
        spec,
        cluster: { id: 'g', name: 'g', mode: 'standalone', memberIds: ['node1'] }
      })
    }
    const state: { spawns: { bin: string; args: string[] }[] } = { spawns: [] }
    ;(globalThis as any).__mcBackup = state
    const overrides: Record<string, string> = {
      'node:child_process': `const {EventEmitter}=require('node:events');const {Readable}=require('node:stream');export const spawn=(bin,args)=>{globalThis.__mcBackup.spawns.push({bin,args});const child=new EventEmitter();child.stdout=Readable.from(['-- dump\\n']);child.kill=()=>true;setImmediate(()=>child.emit('close',0));return child}`,
      'mysql2/promise': `export const escape=v=>"'"+v+"'";export const createConnection=async()=>({query:async()=>[[{port:13307,dataDir:${JSON.stringify(dataDir)}}]],end:async()=>{}})`
    }
    const result = await build({
      entryPoints: ['plugins/mariadb-cluster/fork/manage.ts'],
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'node',
      packages: 'external',
      plugins: [
        {
          name: 'backup-boundaries',
          setup(builder) {
            builder.onResolve({ filter: /.*/ }, (args) =>
              overrides[args.path] ? { path: args.path, namespace: 'boundary' } : undefined
            )
            builder.onLoad({ filter: /.*/, namespace: 'boundary' }, (args) => ({
              contents: overrides[args.path],
              loader: 'js'
            }))
          }
        }
      ]
    })
    const module: any = { exports: {} }
    new Function('require', 'module', 'exports', result.outputFiles[0].text)(
      createRequire(import.meta.url),
      module,
      module.exports
    )
    const outcome = await module.exports.backupDatabase(
      catalog,
      'node1',
      { user: 'root', password: 'p' },
      ['app'],
      join(root, 'backups'),
      () => {}
    )
    assert.equal(state.spawns.length, 1)
    assert.equal(state.spawns[0].bin, dump)
    assert.deepEqual(state.spawns[0].args.slice(1), [
      '--single-transaction',
      '--routines',
      '--events',
      '--triggers',
      '--databases',
      '--',
      'app'
    ])
    assert.ok(!state.spawns[0].args.some((arg) => /gtid/i.test(arg)))
    assert.equal(outcome.status, 'completed')
  } finally {
    delete (globalThis as any).__mcBackup
    await rm(root, { recursive: true, force: true })
  }
})
