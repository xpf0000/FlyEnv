import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const directory = await mkdtemp(join(tmpdir(), 'flyenv-online-cache-'))
const values = new Map<string, string>()
const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value)
  }
})
const bin = join(directory, 'static-Temurin-21.0.8/bin/java')
const row = { version: '21.0.8', bin, zip: join(directory, 'java.tar.gz'), installed: true }
const requests: string[] = []
;(globalThis as any).__onlineCacheTest = {
  exists: async (file: string) => existsSync(file),
  send: (channel: string) => {
    requests.push(channel)
    return { then: (callback: any) => callback('key', { code: 0, data: [{ ...row }] }) }
  }
}
const mocks: Record<string, string> = {
  './IPC': 'export default {send:(...args)=>globalThis.__onlineCacheTest.send(...args),off:()=>{}}',
  '@/util/NodeFn': 'export const fs={existsSync:(bin)=>globalThis.__onlineCacheTest.exists(bin)}',
  '@/util/Element': 'export const MessageError=(message)=>{throw new Error(message)}'
}
try {
  const result = await build({
    entryPoints: ['src/render/util/Brew.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    plugins: [
      {
        name: 'online-cache-fixtures',
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) =>
            mocks[path] ? { path, namespace: 'fixture' } : undefined
          )
          builder.onLoad({ filter: /./, namespace: 'fixture' }, ({ path }) => ({
            contents: mocks[path],
            loader: 'js'
          }))
        }
      }
    ]
  })
  const bundle = join(directory, 'brew.mjs')
  await writeFile(bundle, result.outputFiles[0].text)
  const { fetchVerion } = await import(pathToFileURL(bundle).href)
  const cached = (data: any[]) =>
    JSON.stringify({ expire: Math.round(Date.now() / 1000) + 3600, data })
  values.set(
    'fetchVerion-java',
    cached([{ ...row, bin: join(directory, 'obsolete/Contents/Home/bin/java'), installed: false }])
  )
  await mkdir(dirname(bin), { recursive: true })
  await writeFile(bin, '')
  let rows = await fetchVerion('java')
  assert.equal(requests.length, 1, 'legacy Java cache must be bypassed')
  assert.equal(rows[0].bin, bin)
  assert.equal(rows[0].installed, true)
  assert.ok(values.has('fetchVerion-java-v2'))
  rows = await fetchVerion('java')
  assert.equal(requests.length, 1, 'current Java metadata cache must still work')
  assert.equal(rows[0].installed, true)
  await rm(bin)
  rows = await fetchVerion('java')
  assert.equal(rows[0].installed, false, 'cache hits must recheck the actual package files')
  values.set('fetchVerion-bun', cached([{ ...row, version: '1.2.23', installed: true }]))
  rows = await fetchVerion('bun')
  assert.equal(rows[0].installed, false, 'other modules must also refresh cached installed flags')
  assert.equal(requests.length, 1, 'other module cache keys must remain compatible')
  console.log('version-manager-online-cache-test: ok')
} finally {
  await rm(directory, { recursive: true, force: true })
  delete (globalThis as any).__onlineCacheTest
  if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage)
  else delete (globalThis as any).localStorage
}
