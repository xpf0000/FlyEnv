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
import { initializeInstance } from '../fork/initialize'
import type { Credential, InstanceSpec } from '../shared'

async function fixture(
  options: {
    stage?: string
    exited?: boolean
    identity?: boolean
    replication?: boolean
    source?: boolean
    version?: string
    noCompletion?: boolean
    failStop?: boolean
    windowsBin?: string
  } = {}
) {
  const root = await mkdtemp(join(tmpdir(), options.windowsBin ? 'mdbc-start space-' : 'mc-start-'))
  const platform = options.windowsBin ? 'Windows' : 'macOS'
  const paths = instancePaths(root, 'node1')
  await mkdir(paths.dir, { recursive: true })
  const spec: InstanceSpec = {
    id: 'node1',
    name: 'node1',
    port: 13307,
    serverId: 13307,
    socket: join(root, 'mariadb.sock'),
    dataDir: join(root, 'data'),
    engine: {
      bin: join(root, options.windowsBin ?? 'mariadbd'),
      path: root,
      version: options.version ?? '10.11.9',
      source: 'Static'
    }
  }
  await writeFile(spec.engine.bin, '')
  await writeFile(
    paths.config,
    renderConfig(spec, options.replication ? 'replication' : 'standalone', paths, platform)
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
        COMMAND: options.windowsBin
          ? `"${spec.engine.bin}" ${args.map((arg) => (arg.includes(' ') ? `"${arg}"` : arg)).join(' ')}`
          : `${options.identity === false ? '/unrelated/mariadbd' : spec.engine.bin} --defaults-file=${paths.config}`
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
    platform,
    operations: new OperationLocks(),
    paths: () => paths,
    instance: async () => ({
      spec,
      stage: state.stage,
      cluster: {
        mode: options.replication ? 'replication' : 'standalone',
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
    entryPoints: ['plugins/mariadb-cluster/fork/runtime.ts'],
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
            const importer = args.importer.replace(/\\/g, '/')
            const key =
              importer.endsWith('/util/ServiceStart.ts') && args.path === '../Fn'
                ? 'service-fn'
                : importer.endsWith('/util/ServiceStart.ts') && args.path === '../Helper'
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
  const runtime = new module.exports.MariadbInstanceRuntime(catalog, {
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
      /ALTER USER 'root'@'localhost' IDENTIFIED VIA mysql_native_password USING PASSWORD\('Chosen-password-19'\)/
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

for (const windowsBin of ['mariadbd.exe', 'mysqld.exe']) {
  test(`Windows first startup verifies ${windowsBin} quoted init-file arguments until consumed`, async () => {
    const f = await fixture({ stage: 'initialized', windowsBin })
    try {
      const result = await f.runtime.start('node1', {
        user: 'root',
        password: 'Chosen-password-19'
      })
      assert.equal(result.pid, '44123')
      assert.equal(f.state.stage, 'ready')
      assert.match(f.state.initAtConsumption, /ALTER USER/)
      assert.equal(f.state.stops, undefined)
      await assert.rejects(readFile(f.paths.init), { code: 'ENOENT' })
    } finally {
      await f.cleanup()
    }
  })
}

test('startup does not accept a process outside the managed installation identity', async () => {
  const f = await fixture({ identity: false })
  try {
    await assert.rejects(f.runtime.start('node1', undefined), /identity|verify|startup/i)
    assert.equal(f.state.killed, true)
  } finally {
    await f.cleanup()
  }
})

test('replica resumes its saved channel with process arguments and stays read-only', async () => {
  const f = await fixture({ replication: true })
  try {
    assert.equal((await f.runtime.start('node1', undefined)).pid, '44123')
    assert.deepEqual(f.state.args, [
      `--defaults-file=${f.paths.config}`,
      '--skip-slave-start=OFF',
      '--read-only=ON'
    ])
    assert.equal(f.state.sql, 0)
  } finally {
    await f.cleanup()
  }
})

test('replication source resumes without replica read-only flags', async () => {
  const f = await fixture({ replication: true, source: true })
  try {
    await f.runtime.start('node1', undefined)
    assert.deepEqual(f.state.args, [`--defaults-file=${f.paths.config}`, '--skip-slave-start=OFF'])
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
      '--skip-slave-start=OFF',
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

test('initialization resolves mariadb-install-db and passes Unix install arguments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-install-db-'))
  try {
    const enginePath = join(root, 'engine')
    await mkdir(join(enginePath, 'bin'), { recursive: true })
    const installBin = join(enginePath, 'bin', 'mariadb-install-db')
    await writeFile(installBin, '')
    const paths = instancePaths(root, 'node1')
    await mkdir(paths.dir, { recursive: true })
    const dataDir = join(root, 'data')
    await mkdir(dataDir, { recursive: true })
    const spec: InstanceSpec = {
      id: 'node1',
      name: 'node1',
      port: 13307,
      serverId: 13307,
      socket: join(root, 'mariadb.sock'),
      dataDir,
      engine: {
        bin: join(enginePath, 'bin', 'mariadbd'),
        path: enginePath,
        version: '10.11.9',
        source: 'Static'
      }
    }
    await writeFile(paths.config, renderConfig(spec, 'standalone', paths, 'macOS'))
    let stage = 'prepared'
    const calls: { bin: string; args: string[]; timeout?: number }[] = []
    const catalog: any = {
      platform: 'macOS',
      operations: new OperationLocks(),
      paths: () => paths,
      instance: async () => ({
        spec,
        stage,
        pendingUpdate: false,
        cluster: { id: 'g', name: 'g', mode: 'standalone', memberIds: ['node1'] }
      }),
      read: async () => ({
        schemaVersion: 1,
        instances: [spec],
        clusters: [{ id: 'g', name: 'g', mode: 'standalone', memberIds: ['node1'] }],
        stages: { node1: stage }
      }),
      prepare: async () => undefined,
      setStage: async (_id: string, next: string) => {
        stage = next
      }
    }
    const result = await initializeInstance(
      catalog,
      'node1',
      () => {},
      async (bin, args, timeout) => {
        calls.push({ bin, args, timeout })
        return ''
      }
    )
    assert.equal(result, 'initialized')
    assert.equal(calls.length, 1)
    assert.equal(calls[0].bin, installBin)
    assert.deepEqual(calls[0].args, [
      `--datadir=${dataDir}`,
      `--basedir=${enginePath}`,
      '--auth-root-authentication-method=normal',
      `--defaults-file=${paths.config}`
    ])
    assert.equal(calls[0].timeout, 180_000)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('Windows initialization uses mariadb-install-db.exe with --config arguments', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-install-db-win-'))
  try {
    const enginePath = join(root, 'engine')
    await mkdir(join(enginePath, 'bin'), { recursive: true })
    const installBin = join(enginePath, 'bin', 'mariadb-install-db.exe')
    await writeFile(installBin, '')
    const paths = instancePaths(root, 'node1')
    await mkdir(paths.dir, { recursive: true })
    const dataDir = join(root, 'data')
    await mkdir(dataDir, { recursive: true })
    const spec: InstanceSpec = {
      id: 'node1',
      name: 'node1',
      port: 13307,
      serverId: 13307,
      socket: 'FlyEnvMDBC-node1',
      dataDir,
      engine: {
        bin: join(enginePath, 'bin', 'mariadbd.exe'),
        path: enginePath,
        version: '10.11.9',
        source: 'Static'
      }
    }
    await writeFile(paths.config, renderConfig(spec, 'standalone', paths, 'Windows'))
    let stage = 'prepared'
    const calls: { bin: string; args: string[] }[] = []
    const catalog: any = {
      platform: 'Windows',
      operations: new OperationLocks(),
      paths: () => paths,
      instance: async () => ({
        spec,
        stage,
        pendingUpdate: false,
        cluster: { id: 'g', name: 'g', mode: 'standalone', memberIds: ['node1'] }
      }),
      read: async () => ({
        schemaVersion: 1,
        instances: [spec],
        clusters: [{ id: 'g', name: 'g', mode: 'standalone', memberIds: ['node1'] }],
        stages: { node1: stage }
      }),
      prepare: async () => undefined,
      setStage: async (_id: string, next: string) => {
        stage = next
      }
    }
    await initializeInstance(
      catalog,
      'node1',
      () => {},
      async (bin, args) => {
        calls.push({ bin, args })
        return ''
      }
    )
    assert.equal(calls.length, 1)
    assert.equal(calls[0].bin, installBin)
    assert.deepEqual(calls[0].args, [`--datadir=${dataDir}`, `--config=${paths.config}`])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('initialization refuses an installation without mariadb-install-db', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mc-install-db-missing-'))
  try {
    const enginePath = join(root, 'engine')
    await mkdir(join(enginePath, 'bin'), { recursive: true })
    const paths = instancePaths(root, 'node1')
    await mkdir(paths.dir, { recursive: true })
    const dataDir = join(root, 'data')
    await mkdir(dataDir, { recursive: true })
    const spec: InstanceSpec = {
      id: 'node1',
      name: 'node1',
      port: 13307,
      serverId: 13307,
      socket: join(root, 'mariadb.sock'),
      dataDir,
      engine: {
        bin: join(enginePath, 'bin', 'mariadbd'),
        path: enginePath,
        version: '10.11.9',
        source: 'Static'
      }
    }
    await writeFile(paths.config, renderConfig(spec, 'standalone', paths, 'macOS'))
    let stage = 'prepared'
    const catalog: any = {
      platform: 'macOS',
      operations: new OperationLocks(),
      paths: () => paths,
      instance: async () => ({
        spec,
        stage,
        pendingUpdate: false,
        cluster: { id: 'g', name: 'g', mode: 'standalone', memberIds: ['node1'] }
      }),
      read: async () => ({
        schemaVersion: 1,
        instances: [spec],
        clusters: [{ id: 'g', name: 'g', mode: 'standalone', memberIds: ['node1'] }],
        stages: { node1: stage }
      }),
      prepare: async () => undefined,
      setStage: async (_id: string, next: string) => {
        stage = next
      }
    }
    let runs = 0
    await assert.rejects(
      initializeInstance(
        catalog,
        'node1',
        () => {},
        async () => {
          runs++
          return ''
        }
      ),
      /mariadb-install-db/
    )
    assert.equal(runs, 0)
    assert.equal(stage, 'unknown')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
