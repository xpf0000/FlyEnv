import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { resolve } from 'node:path'

async function fixture(states: Record<string, string> = { a: 'running', b: 'stopped' }) {
  const state: any = { states: { ...states }, events: [], opens: 0, panelStops: 0 }
  ;(globalThis as any).__mcDbGateFork = state
  const result = await build({
    entryPoints: ['plugins/mysql-cluster/fork/index.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [
      {
        name: 'isolated-host',
        setup(builder) {
          builder.onResolve({ filter: /^(?:@|\.\/|node:fs$)/ }, (args) => {
            if (args.kind === 'entry-point') return
            if (args.path === './dbgate')
              return { path: resolve('plugins/mysql-cluster/fork/dbgate.ts') }
            if (args.path === '@shared/ForkPromise')
              return { path: resolve('src/shared/ForkPromise.ts') }
            return { path: args.path, namespace: 'isolated-host' }
          })
          builder.onLoad({ filter: /.*/, namespace: 'isolated-host' }, (args) => {
            if (args.path === 'node:fs')
              return {
                contents:
                  'export const existsSync=path=>path.endsWith("dbgate.pid")?!!globalThis.__mcDbGateFork.retainedPid:globalThis.__mcDbGateFork.panelState!==false;'
              }
            if (args.path === '@fork/module/Base') return { contents: 'export class Base {}' }
            if (args.path === '@fork/module/DbGate')
              return {
                contents: `
          export const dbGateEnv = (paths, port, creds) => ({ PASSWORD: creds.password, PORT: String(port) });
          export class DbGateRuntime {
            constructor(base, options) { this.paths={root:base+'/dbgate',entry:base+'/dbgate/node_modules/dbgate-serve/bin/dbgate-serve.js',pid:base+'/dbgate/dbgate.pid',startOut:base+'/dbgate/out',startError:base+'/dbgate/err'}; this.options=options; globalThis.__mcDbGateFork.panel=this; }
            async open(node,on) { const s=globalThis.__mcDbGateFork; s.opens++;s.events.push('panel-open');on({code:200,msg:'install'}); if(s.openWait)await s.openWait; return {url:'http://flyenv:private@127.0.0.1:3000','APP-Service-Start-PID':'900','APP-Service-Start-Item':{typeFlag:'mongodb',bin:node.bin,path:this.paths.root,version:'dbgate'}}; }
            async stop(pid) { const s=globalThis.__mcDbGateFork;s.panelStops++;s.expectedPid=pid;s.events.push('panel-stop');if(s.failPanel)throw Error('panel cleanup denied');return ['900']; }
          }`
              }
            if (args.path === '@fork/util/ServiceStart')
              return {
                contents:
                  'export const serviceStartSpawn=async options=>{globalThis.__mcDbGateFork.startOptions=options;options.on({"APP-On-Log":"safe"});return {"APP-Service-Start-PID":"900"}}'
              }
            if (args.path === '@shared/StopProcessList')
              return {
                contents:
                  'export const StopProcessListFetch=async()=>[];export const fetchStopProcessListLocal=async()=>Object.entries(globalThis.__mcDbGateFork.states).map(([id,state])=>({id,state}));'
              }
            const names: Record<string, string[]> = {
              './dbgateInstall': ['installDbGate'],
              './dbgateListeners': ['dbGateListeningPids'],
              './packages': [
                'preparePackageCommand',
                'prepareHomebrewInstall',
                'cleanupPackageCommand',
                'removeStaticPackage'
              ],
              '@shared/StopProcessList': ['StopProcessListFetch'],
              './catalog': ['InstanceCatalog'],
              './runtime': ['MysqlInstanceRuntime'],
              './service': ['InstanceStopAdapter'],
              './initialize': ['initializeInstance'],
              './replication': ['ReplicationService'],
              './groupReplication': ['GroupReplicationService'],
              './io': ['writeAtomic'],
              './config': ['validateConfigEdit'],
              './manage': [
                'listDatabases',
                'mutateDatabase',
                'createDatabase',
                'backupDatabase',
                'readLog'
              ],
              '../policy': ['validateCreateRequest']
            }
            if (!names[args.path]) throw Error('Unexpected dependency ' + args.path)
            return {
              contents: names[args.path].map((name) => `export const ${name}=()=>{};`).join('\n')
            }
          })
        }
      }
    ]
  })
  const { MysqlClusterModule } = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Math.random()}`
  )
  ;(globalThis as any).Server = { BaseDir: '/isolated/server' }
  const module = new MysqlClusterModule()
  module.catalogValue = {
    read: async () => ({ instances: Object.keys(state.states).map((id) => ({ id })) }),
    paths: (id: string) => ({ config: `/instances/${id}/my.cnf` })
  }
  module.runtimeValue = {
    listInstances: async () =>
      Object.entries(state.states).map(([id, status]) => ({ id, state: status })),
    stop: async (id: string) => {
      state.events.push(`mysql-stop:${id}`)
      if (state.failMysql) throw Error('mysql stop denied')
      state.states[id] = 'stopped'
      return [id === 'a' ? '101' : '102']
    }
  }
  return { module, state }
}
const node: any = { bin: '/node/bin/node', path: '/node', version: '22' }
const item = (id: string): any => ({
  bin: `/instances/${id}/my.cnf`,
  pid: id === 'a' ? '101' : '102'
})

test('global DbGate open relays install notices and registers its shared entry for plugin exit', async () => {
  const { module, state } = await fixture()
  const events: any[] = []
  const result = await module.openDbGate(node).on((event: any) => events.push(event))
  assert.deepEqual(events, [{ code: 200, msg: 'install' }])
  assert.equal(result.url, 'http://flyenv:private@127.0.0.1:3000')
  assert.deepEqual(result['APP-Service-Start-Item'], {
    typeFlag: 'mysql-cluster',
    version: 'dbgate',
    bin: '/isolated/server/dbgate/node_modules/dbgate-serve/bin/dbgate-serve.js',
    path: '/isolated/server/dbgate'
  })
  const stopArgs = module.companionStopArgs('openDbGate', '900', [node])
  assert.equal(stopArgs[0].bin, result['APP-Service-Start-Item'].bin)
  assert.equal(stopArgs[0].pid, '900')
  assert.deepEqual(stopArgs[1], { dbGateOnly: true })
  assert.equal(module.companionStopArgs('startService', '101', [item('a')]), undefined)
  const stopped = await module.stopService(...stopArgs)
  assert.deepEqual(stopped, { 'APP-Service-Stop-PID': ['900'] })
  assert.equal(state.states.a, 'running')
  assert.equal(state.expectedPid, '900')
})

test('DbGate spawn uses plugin service identity with the global entry and suppresses credential logging', async () => {
  const { module, state } = await fixture()
  await module.openDbGate(node)
  await state.panel.options.starter(
    node,
    state.panel.paths,
    3000,
    { login: 'flyenv', password: 'secret' },
    () => {}
  )
  assert.equal(state.startOptions.sensitive, true)
  assert.equal(state.startOptions.version.typeFlag, 'mysql-cluster')
  assert.equal(state.startOptions.version.bin, state.panel.paths.entry)
  assert.equal(state.startOptions.execEnv.PASSWORD, 'secret')
  assert.deepEqual(state.startOptions.execArgs, [state.panel.paths.entry])
})

test('opening requires a real running snapshot and duplicate opens share one process request', async () => {
  const { module, state } = await fixture({ a: 'unknown' })
  await assert.rejects(
    Promise.resolve().then(() => module.openDbGate(node)),
    /running/i
  )
  assert.equal(state.opens, 0)
  state.states.a = 'running'
  let release!: () => void
  state.openWait = new Promise<void>((r) => {
    release = r
  })
  const firstEvents: any[] = [],
    secondEvents: any[] = []
  const first = module.openDbGate(node).on((v: any) => firstEvents.push(v))
  const second = module.openDbGate(node).on((v: any) => secondEvents.push(v))
  await new Promise((r) => setTimeout(r, 0))
  release()
  await Promise.all([first, second])
  assert.equal(state.opens, 1)
  assert.deepEqual(firstEvents, [{ code: 200, msg: 'install' }])
  assert.deepEqual(secondEvents, firstEvents)
})

test('parallel parent stops close DbGate before the final MySQL and report only stopped PIDs', async () => {
  const { module, state } = await fixture({ a: 'running', b: 'running' })
  const results = await Promise.all([
    module.stopService(item('a'), { id: 'a' }),
    module.stopService(item('b'), { id: 'b' })
  ])
  assert.deepEqual(state.events, ['mysql-stop:a', 'panel-stop', 'mysql-stop:b'])
  assert.deepEqual(results, [
    { 'APP-Service-Stop-PID': ['101'] },
    { 'APP-Service-Stop-PID': ['102', '900'] }
  ])
})
test('last-parent observation reads fresh process state instead of the frozen batch stop table', async () => {
  const { module, state } = await fixture({ a: 'running', b: 'running' })
  const initial = [
    { id: 'a', state: 'running' },
    { id: 'b', state: 'running' }
  ]
  module.runtimeValue.listInstances = async (fresh: any) => fresh ?? initial
  await Promise.all([
    module.stopService(item('a'), { id: 'a' }),
    module.stopService(item('b'), { id: 'b' })
  ])
  assert.deepEqual(state.events, ['mysql-stop:a', 'panel-stop', 'mysql-stop:b'])
})

test('required companion cleanup failure preserves the final MySQL and permits a later retry', async () => {
  const { module, state } = await fixture()
  state.failPanel = true
  await assert.rejects(module.stopService(item('a'), { id: 'a' }), /cleanup denied/)
  assert.equal(state.states.a, 'running')
  assert.deepEqual(state.events, ['panel-stop'])
  state.failPanel = false
  const stopped = await module.stopService(item('a'), { id: 'a' })
  assert.deepEqual(stopped, { 'APP-Service-Stop-PID': ['101', '900'] })
})

test('unknown peer identity preserves the panel without claiming every instance stopped', async () => {
  const { module, state } = await fixture({ a: 'running', b: 'unknown' })
  assert.deepEqual(await module.stopService(item('a'), { id: 'a' }), {
    'APP-Service-Stop-PID': ['101']
  })
  assert.equal(state.panelStops, 0)
})
test('an unopened, uninstalled companion adds no process observation or panel stop to ordinary lifecycle', async () => {
  const { module, state } = await fixture()
  state.panelState = false
  module.runtimeValue.listInstances = async () => {
    throw new Error('unnecessary panel observation')
  }
  assert.deepEqual(await module.stopService(item('a'), { id: 'a' }), {
    'APP-Service-Stop-PID': ['101']
  })
  assert.equal(state.panelStops, 0)
})
test('an unknown target cannot authorize final-parent panel shutdown', async () => {
  const { module, state } = await fixture({ a: 'unknown' })
  await module.stopService(item('a'), { id: 'a' })
  assert.equal(state.panelStops, 0)
})
test('retained global PID after native stop blocks final-parent shutdown', async () => {
  const { module, state } = await fixture()
  state.retainedPid = true
  await assert.rejects(module.stopService(item('a'), { id: 'a' }), /confirm|running|DbGate/i)
  assert.equal(state.states.a, 'running')
  assert.deepEqual(state.events, ['panel-stop'])
})

test('last-parent stop waits for admitted open then refuses a late open after all parents stopped', async () => {
  const { module, state } = await fixture()
  let release!: () => void
  state.openWait = new Promise<void>((r) => {
    release = r
  })
  const opening = module.openDbGate(node)
  const stopping = module.stopService(item('a'), { id: 'a' })
  await new Promise((r) => setTimeout(r, 0))
  assert.deepEqual(state.events, ['panel-open'])
  release()
  await Promise.all([opening, stopping])
  assert.deepEqual(state.events, ['panel-open', 'panel-stop', 'mysql-stop:a'])
  await assert.rejects(module.openDbGate(node), /running/i)
  assert.equal(state.opens, 1)
})
