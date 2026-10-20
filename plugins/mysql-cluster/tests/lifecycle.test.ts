import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
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
test('Module current-version opt-out prevents shared configuration writes while default stays compatible', async () => {
  let calls = 0
  ;(globalThis as any).__mcHost = {
    AppStore: () => ({
      serverCurrent: () => ({}),
      UPDATE_SERVER_CURRENT: () => {
        calls++
      }
    })
  }
  const { Module } = await load('src/render/core/Module/Module.ts', {
    '@/store/app': 'export const AppStore = () => globalThis.__mcHost.AppStore()'
  })
  const module = new Module()
  module.typeFlag = 'mysql-cluster'
  module.installed = [{ version: '8.4.8', path: '/tmp/a', bin: '/tmp/a/my.cnf', enable: true }]
  module.persistCurrentVersion = false
  assert.equal(module.resetCurrentVersion(), false)
  assert.equal(calls, 0)
  module.persistCurrentVersion = true
  assert.equal(module.resetCurrentVersion(), true)
  assert.equal(calls, 1)
})
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
