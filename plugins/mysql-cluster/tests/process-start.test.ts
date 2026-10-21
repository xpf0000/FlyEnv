import assert from 'node:assert/strict'
import { test } from 'node:test'
import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { renderConfig } from '../fork/config'
import { instancePaths } from '../fork/paths'
import { OperationLocks } from '../fork/locks'
import type { Credential, InstanceSpec } from '../shared'

async function fixture(
  options: {
    stage?: string
    exited?: boolean
    identity?: boolean
    replication?: boolean
    groupReplication?: boolean
    source?: boolean
    version?: string
    noCompletion?: boolean
    failStop?: boolean
  } = {}
) {
  const root = await mkdtemp(join(tmpdir(), 'mc-start-'))
  const paths = instancePaths(root, 'node1')
  await mkdir(paths.dir, { recursive: true })
  const spec: InstanceSpec = {
    id: 'node1',
    name: 'node1',
    port: 13306,
    serverId: 13306,
    socket: join(root, 'mysql.sock'),
    dataDir: join(root, 'data'),
    engine: {
      bin: join(root, 'mysqld'),
      path: root,
      version: options.version ?? '9.6.0',
      source: 'Static'
    }
  }
  await writeFile(spec.engine.bin, '')
  await writeFile(
    paths.config,
    renderConfig(
      spec,
      options.groupReplication
        ? 'group-replication'
        : options.replication
          ? 'replication'
          : 'standalone',
      paths,
      'macOS'
    )
  )
  // An old successful start must not satisfy the initial setup completion check.
  await writeFile(paths.error, 'old ready for connections\n')
  const state: any = {
    stage: options.stage ?? 'ready',
    sql: 0,
    tcp: 0,
    spawnCount: 0,
    rows: [],
    clock: 0
  }
  const child: any = new EventEmitter()
  child.pid = 44123
  child.exitCode = null
  child.unref = () => undefined
  child.kill = () => {
    child.exitCode = 1
    state.killed = true
    return true
  }
  state.spawn = (_bin: string, args: string[]) => {
    state.spawnCount++
    state.args = args
    state.rows = [
      {
        PID: '44123',
        PPID: '1',
        COMMAND: `${options.identity === false ? '/unrelated/mysqld' : spec.engine.bin} --defaults-file=${paths.config}`
      }
    ]
    void writeFile(paths.pid, '44123')
    if (options.exited)
      queueMicrotask(() => {
        child.exitCode = 1
        child.emit('exit', 1)
      })
    return child
  }
  const catalog = {
    platform: 'macOS',
    operations: new OperationLocks(),
    paths: () => paths,
    instance: async () => ({
      spec,
      stage: state.stage,
      cluster: {
        mode: options.groupReplication
          ? 'group-replication'
          : options.replication
            ? 'replication'
            : 'standalone',
        memberIds: options.source ? ['node1', 'replica'] : ['source', 'node1']
      }
    }),
    setStage: async (_id: string, stage: string) => {
      state.stage = stage
    }
  }
  ;(globalThis as any).__mcProcessStart = state
  const overrides: Record<string, string> = {
    'node:child_process':
      'export const spawn=(...args)=>globalThis.__mcProcessStart.spawn(...args)',
    'mysql2/promise': `export const escape=value=>"'"+value.replaceAll("'", "\\\\'")+"'";export const createConnection=async()=>{globalThis.__mcProcessStart.sql++;throw new Error('SQL login forbidden')}`,
    'node:net': `export const createServer=require('net').createServer;export const createConnection=()=>{globalThis.__mcProcessStart.tcp++;throw new Error('TCP readiness forbidden')}`,
    '@lang/runtime': 'export const I18nT=key=>key',
    '@shared/EnvSync': 'export default {sync:async()=>process.env}',
    '@shared/Process': 'export const ProcessListFetch=async()=>[]',
    '@shared/WindowsSystemPaths': 'export const resolveWindowsPowerShellPath=()=>""',
    '@shared/utils':
      'export const isWindows=()=>false;export const isLinux=()=>false;export const isMacOS=()=>true',
    'service-fn': `import fs from 'node:fs';import fsp from 'node:fs/promises';export const existsSync=fs.existsSync;export const mkdirp=dir=>fsp.mkdir(dir,{recursive:true});export const readFile=fsp.readFile;export const writeFile=fsp.writeFile;export const remove=file=>fsp.rm(file,{force:true});export const AppLog=(level,text)=>({level,text});export const execPromise=async()=>{};export const execPromiseSudo=async()=>{};export const removeByRoot=remove;export const spawnPromiseWithEnv=async()=>{};export const waitPidFile=async()=>{};export const waitTime=async()=>{}`,
    'service-helper':
      'export default {send:async()=>{throw new Error("Unexpected helper invocation")}}'
  }
  const result = await build({
    entryPoints: ['plugins/mysql-cluster/fork/runtime.ts'],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    packages: 'external',
    plugins: [
      {
        name: 'process-boundaries',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) => {
            const key =
              args.importer.endsWith('/util/ServiceStart.ts') && args.path === '../Fn'
                ? 'service-fn'
                : args.importer.endsWith('/util/ServiceStart.ts') && args.path === '../Helper'
                  ? 'service-helper'
                  : args.path
            if (overrides[key]) return { path: key, namespace: 'boundary' }
            return undefined
          })
          builder.onLoad({ filter: /.*/, namespace: 'boundary' }, (args) => ({
            contents: overrides[args.path],
            loader: 'js'
          }))
        }
      }
    ]
  })
  const module: any = { exports: {} }
  const fakeDate = class extends Date {
    static now() {
      return state.clock
    }
  }
  const fastTimeout = (callback: () => void, delay: number) =>
    setTimeout(async () => {
      state.clock += delay
      if (
        !options.noCompletion &&
        state.stage === 'initialized' &&
        state.clock >= 2400 &&
        !state.consumed
      ) {
        state.initAtConsumption = await readFile(paths.init, 'utf8').catch(() => '')
        state.consumed = true
        await writeFile(paths.error, 'old ready for connections\nnew ready for connections\n')
      }
      callback()
    }, 0)
  new Function('require', 'module', 'exports', 'setTimeout', 'Date', result.outputFiles[0].text)(
    createRequire(import.meta.url),
    module,
    module.exports,
    fastTimeout,
    fakeDate
  )
  const runtime = new module.exports.MysqlInstanceRuntime(catalog, {
    list: async () => state.rows,
    stop: async () => {
      state.stops = (state.stops ?? 0) + 1
      if (options.failStop) throw new Error('Stop could not complete')
      child.kill()
      return ['44123']
    }
  })
  return {
    state,
    paths,
    runtime,
    async cleanup() {
      await rm(root, { recursive: true, force: true })
      delete (globalThis as any).__mcProcessStart
    }
  }
}

for (const [label, credential] of [
  ['absent credentials', undefined],
  ['incorrect stored root password', { user: 'root', password: 'wrong' }]
] as [string, Credential | undefined][]) {
  test(`ready instance starts with ${label} using only process validation`, async () => {
    const f = await fixture()
    try {
      const result = await f.runtime.start('node1', credential)
      assert.equal(result.pid, '44123')
      assert.equal(f.state.stage, 'ready')
      assert.equal(f.state.sql, 0)
      assert.equal(f.state.tcp, 0)
      assert.deepEqual(f.state.args, [`--defaults-file=${f.paths.config}`])
    } finally {
      await f.cleanup()
    }
  })
}

test('early child exit fails startup without marking an initialized instance ready', async () => {
  const f = await fixture({ stage: 'initialized', exited: true })
  try {
    await assert.rejects(f.runtime.start('node1', { user: 'root', password: 'Chosen-password-19' }))
    assert.equal(f.state.stage, 'initialized')
  } finally {
    await f.cleanup()
  }
})

test('initialized startup keeps its password init-file until this startup completes', async () => {
  const f = await fixture({ stage: 'initialized' })
  try {
    assert.equal(
      (await f.runtime.start('node1', { user: 'root', password: 'Chosen-password-19' })).pid,
      '44123'
    )
    assert.match(
      f.state.initAtConsumption,
      /ALTER USER 'root'@'localhost' IDENTIFIED BY 'Chosen-password-19'/
    )
    assert.equal(f.state.stage, 'ready')
    assert.equal(f.state.sql, 0)
    assert.equal(f.state.tcp, 0)
    await assert.rejects(readFile(f.paths.init), { code: 'ENOENT' })
  } finally {
    await f.cleanup()
  }
})

test('initial root password remains required before a first startup', async () => {
  const f = await fixture({ stage: 'initialized' })
  try {
    await assert.rejects(f.runtime.start('node1', undefined), /Initial root credentials/)
    assert.equal(f.state.spawnCount, 0)
  } finally {
    await f.cleanup()
  }
})

test('startup does not accept a process outside the managed installation identity', async () => {
  const f = await fixture({ identity: false })
  try {
    await assert.rejects(f.runtime.start('node1', undefined), /identity|verify|startup/i)
    assert.equal(f.state.killed, true)
  } finally {
    await f.cleanup()
  }
})

for (const [version, flag] of [
  ['8.0.22', 'skip-slave-start'],
  ['9.6.0', 'skip-replica-start']
]) {
  test(`replica ${version} resumes its saved channel with process arguments and stays read-only`, async () => {
    const f = await fixture({ replication: true, version })
    try {
      assert.equal((await f.runtime.start('node1', undefined)).pid, '44123')
      assert.deepEqual(f.state.args, [
        `--defaults-file=${f.paths.config}`,
        `--${flag}=OFF`,
        '--read-only=ON',
        '--super-read-only=ON'
      ])
      assert.equal(f.state.sql, 0)
    } finally {
      await f.cleanup()
    }
  })
}

test('replication source resumes without replica read-only flags', async () => {
  const f = await fixture({ replication: true, source: true })
  try {
    await f.runtime.start('node1', undefined)
    assert.deepEqual(f.state.args, [
      `--defaults-file=${f.paths.config}`,
      '--skip-replica-start=OFF'
    ])
  } finally {
    await f.cleanup()
  }
})

test('replica initial root setup remains writable until replication is configured', async () => {
  const f = await fixture({ replication: true, stage: 'initialized' })
  try {
    await f.runtime.start('node1', { user: 'root', password: 'Chosen-password-19' })
    assert.deepEqual(f.state.args, [
      `--defaults-file=${f.paths.config}`,
      '--skip-replica-start=OFF',
      `--init-file=${f.paths.init}`
    ])
  } finally {
    await f.cleanup()
  }
})

test('initial setup timeout stops the new process and preserves the initialized stage', async () => {
  const f = await fixture({ stage: 'initialized', noCompletion: true })
  try {
    await assert.rejects(
      f.runtime.start('node1', { user: 'root', password: 'Chosen-password-19' }),
      /initial startup timed out/
    )
    assert.equal(f.state.stops, 1)
    assert.equal(f.state.killed, true)
    assert.equal(f.state.stage, 'initialized')
    await assert.rejects(readFile(f.paths.init), { code: 'ENOENT' })
  } finally {
    await f.cleanup()
  }
})

test('failed initial startup cleanup reports the failed stop and retains the unread init-file', async () => {
  const f = await fixture({ stage: 'initialized', noCompletion: true, failStop: true })
  try {
    await assert.rejects(
      f.runtime.start('node1', { user: 'root', password: 'Chosen-password-19' }),
      /Stop could not complete/
    )
    assert.match(await readFile(f.paths.init, 'utf8'), /ALTER USER/)
    assert.equal(f.state.stage, 'initialized')
  } finally {
    await f.cleanup()
  }
})

test('ready Group Replication nodes start read-only while waiting for explicit recovery', async () => {
  const f = await fixture({ groupReplication: true })
  try {
    await f.runtime.start('node1', undefined)
    assert.deepEqual(f.state.args, [
      `--defaults-file=${f.paths.config}`,
      '--read-only=ON',
      '--super-read-only=ON'
    ])
    assert.equal(f.state.sql, 0)
    assert.equal(f.state.tcp, 0)
  } finally {
    await f.cleanup()
  }
})

test('Group Replication initial root setup remains writable', async () => {
  const f = await fixture({ groupReplication: true, stage: 'initialized' })
  try {
    await f.runtime.start('node1', { user: 'root', password: 'Chosen-password-19' })
    assert.deepEqual(f.state.args, [
      `--defaults-file=${f.paths.config}`,
      `--init-file=${f.paths.init}`
    ])
  } finally {
    await f.cleanup()
  }
})
