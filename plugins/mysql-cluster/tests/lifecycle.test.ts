import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import { InstanceServices } from '../render/services'
async function load(entry: string, overrides: Record<string, string>) {
  const source = await readFile(entry, 'utf8')
  const names = new Set<string>()
  for (const match of source.matchAll(/import\s*{([^}]+)}\s*from/g))
    for (const name of match[1].split(','))
      names.add(
        name
          .trim()
          .split(/\s+as\s+/)
          .at(-1)!
      )
  const fallback = [
    'export default {};',
    ...[...names].map((name) => `export const ${name} = (...args) => undefined;`)
  ].join('\n')
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    plugins: [
      {
        name: 'host-boundaries',
        setup(builder) {
          builder.onResolve({ filter: /^(?:@|\.\/)/ }, (args) =>
            args.kind === 'entry-point' ? undefined : { path: args.path, namespace: 'host' }
          )
          builder.onLoad({ filter: /.*/, namespace: 'host' }, (args) => ({
            contents: overrides[args.path] ?? fallback,
            loader: 'js'
          }))
        }
      }
    ]
  })
  return import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}#${Math.random()}`
  )
}
test('real ModuleInstalledItem lifecycle forwards instance context and does not restart after failed stop', async () => {
  const sent: any[] = []
  const module = {
    startSingleFlight: (task: any) => task(),
    startExtParam: async () => [{ id: 'a' }],
    stopExtParam: async () => [{ id: 'a' }]
  }
  ;(globalThis as any).__mcHost = {
    module,
    failStop: false,
    request: async (channel: string, args: any[]) => {
      sent.push({ channel, args })
      return args[0] === 'stopService' && (globalThis as any).__mcHost.failStop
        ? { code: 1, msg: 'stop denied' }
        : { code: 0, data: { 'APP-Service-Start-PID': '123' } }
    }
  }
  const { ModuleInstalledItem } = await load('src/render/core/Module/ModuleInstalledItem.ts', {
    '@/store/brew': 'export const BrewStore = () => ({ module: () => globalThis.__mcHost.module })',
    '@/util/ForkTerminalRequest':
      'export const forkTerminalRequest = (...args) => globalThis.__mcHost.request(...args); export const isPositiveHostPid = pid => Number(pid)>0',
    '@/util/mcpServiceStatus':
      'export const beginServiceStatusPending = () => () => {}; export const noteServiceStatusRevision = () => {}',
    '@lang/index': 'export const I18nT = key => key'
  })
  const item = new ModuleInstalledItem({ bin: '/tmp/a/my.cnf', path: '/tmp/a', version: '8.4.8' })
  item.typeFlag = 'mysql-cluster'
  item._onStart = async () => module
  assert.equal(await item.start(), true)
  assert.equal(item.run, true)
  assert.deepEqual(sent[0].args.at(-1), { id: 'a' })
  ;(globalThis as any).__mcHost.failStop = true
  assert.equal(await item.restart(), 'stop denied')
  assert.equal(sent.length, 2)
  assert.equal(item.run, true)
})

test('original host Module stays empty while local real lifecycle entries start and stop without config writes', async () => {
  let writes = 0
  const store = {
    config: { setup: {} },
    serverCurrent: () => ({}),
    UPDATE_SERVER_CURRENT: () => {
      writes++
    },
    saveConfig: async () => {
      writes++
    }
  }
  ;(globalThis as any).__mcOriginalStore = store
  const { Module } = await load('src/render/core/Module/Module.ts', {
    '@/store/app': 'export const AppStore=()=>globalThis.__mcOriginalStore'
  })
  const module = new Module()
  module.typeFlag = 'mysql-cluster'
  module.isOnlyRunOne = false
  module.isPlugin = true
  module.startExtParam = async () => [{ id: 'a' }]
  module.stopExtParam = async () => [{ id: 'a' }]
  ;(globalThis as any).__mcHost = {
    module,
    request: async () => ({ code: 0, data: { 'APP-Service-Start-PID': '123' } })
  }
  const { ModuleInstalledItem } = await load('src/render/core/Module/ModuleInstalledItem.ts', {
    '@/store/brew': 'export const BrewStore=()=>({module:()=>globalThis.__mcHost.module})',
    '@/util/ForkTerminalRequest':
      'export const forkTerminalRequest=(...args)=>globalThis.__mcHost.request(...args);export const isPositiveHostPid=pid=>Number(pid)>0',
    '@/util/mcpServiceStatus':
      'export const beginServiceStatusPending=()=>()=>{};export const noteServiceStatusRevision=()=>{}',
    '@lang/index': 'export const I18nT=key=>key'
  })
  await module.applyInstalledVersions([])
  const services = new InstanceServices(
    () => module,
    (row) => new ModuleInstalledItem(row)
  )
  services.sync([{ typeFlag: 'mysql-cluster', bin: '/a/my.cnf', path: '/a', version: '8.4.8' }])
  const item = services.item('/a/my.cnf')
  assert.equal(await item.start(), true)
  assert.equal(await item.stop(), true)
  assert.equal(module.installed.length, 0)
  assert.equal(writes, 0)
})
