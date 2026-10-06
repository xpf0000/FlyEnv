import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = await mkdtemp(join(tmpdir(), 'flyenv-hosts-dns-'))
const state = {
  macOS: true,
  content: 'original',
  writes: 0,
  refreshes: 0,
  changed: true,
  writeFails: false,
  logFails: false,
  logHangs: false,
  digest: 'a'.repeat(64),
  reads: 0,
  heldWrite: undefined as Promise<void> | undefined,
  calls: [] as string[],
  logs: [] as string[]
}
;(globalThis as any).__hostsDNS = state
try {
  const mocks: Record<string, string> = {
    '@shared/utils': `export const isMacOS=()=>globalThis.__hostsDNS.macOS;
      export const appDebugLog=async(flag,info)=>{const s=globalThis.__hostsDNS;s.logs.push(flag+info);if(s.logFails)throw Error('log unavailable');if(s.logHangs)await new Promise(()=>{})};`,
    '../../Helper': `export default {send:async(module,fn,arg)=>{
      const s=globalThis.__hostsDNS;
      s.calls.push(fn);
      if(fn==='readHosts'){s.reads++;return {content:s.content,digest:s.digest}};
      if(fn==='dnsRefresh'){s.refreshes++;throw Error('resolver unavailable')}
      if(fn==='replaceHostsContent'&&s.heldWrite)await s.heldWrite;
      if(s.writeFails)throw Error('hosts write denied');
      if(arg.digest!==s.digest)throw Error('hosts changed externally');
      s.writes++;s.content=arg.content??JSON.stringify(arg.entries);s.digest=String(s.writes%9+1).repeat(64);return s.changed;
    }};`
  }
  const bundled = await build({
    entryPoints: ['src/fork/module/Host/UnixHosts.ts'],
    platform: 'node',
    format: 'esm',
    bundle: true,
    write: false,
    plugins: [
      {
        name: 'hosts-dns-boundaries',
        setup(builder) {
          builder.onResolve({ filter: /./ }, ({ path }) =>
            mocks[path] ? { path, namespace: 'mock' } : undefined
          )
          builder.onLoad({ filter: /./, namespace: 'mock' }, ({ path }) => ({
            contents: mocks[path],
            loader: 'js'
          }))
        }
      }
    ]
  })
  const file = join(directory, 'hosts.mjs')
  await writeFile(file, bundled.outputFiles[0].text)
  const hosts = await import(pathToFileURL(file).href)
  assert.equal(await hosts.replaceUnixHosts('saved', 'a'.repeat(64)), true)
  assert.equal(state.content, 'saved', 'DNS failure must preserve the completed write')
  assert.equal(state.writes, 1, 'DNS failure must never replay the write')
  assert.equal(state.refreshes, 1, 'macOS full-text edits must refresh DNS')
  assert.match(state.logs[0], /resolver unavailable/)
  const readsBeforeMissingDigest = state.reads
  await assert.rejects(hosts.replaceUnixHosts('old text'), /original.*digest/i)
  assert.equal(
    state.reads,
    readsBeforeMissingDigest,
    'a missing edit digest must not read a fresh snapshot'
  )
  await assert.rejects(
    hosts.replaceUnixHosts('old text', 'a'.repeat(64)),
    /hosts changed externally/
  )
  assert.equal(state.content, 'saved', 'an externally changed snapshot must not be overwritten')
  state.logFails = true
  assert.equal(await hosts.syncUnixHosts(['127.0.0.1 example.test']), true)
  assert.equal(state.refreshes, 2, 'managed synchronization shares the same refresh boundary')
  state.changed = false
  assert.equal(await hosts.syncUnixHosts([]), false)
  assert.equal(state.refreshes, 2, 'unchanged managed entries do not refresh DNS')
  state.writeFails = true
  await assert.rejects(hosts.replaceUnixHosts('denied', 'a'.repeat(64)), /hosts write denied/)
  assert.equal(state.refreshes, 2, 'a required write failure must propagate without DNS refresh')
  state.writeFails = false
  state.changed = true
  state.macOS = false
  assert.equal(await hosts.replaceUnixHosts('linux', state.digest), true)
  assert.equal(state.refreshes, 2, 'Linux must not call the macOS resolver operation')
  state.macOS = true
  let releaseWrite!: () => void
  state.heldWrite = new Promise<void>((resolve) => {
    releaseWrite = resolve
  })
  const callStart = state.calls.length
  const replacement = hosts.replaceUnixHosts('queued editor', state.digest)
  const synchronization = hosts.syncUnixHosts(['127.0.0.1 queued.test'])
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(
    state.calls.slice(callStart),
    ['replaceHostsContent'],
    'managed sync waits for the full replacement'
  )
  releaseWrite()
  await Promise.all([replacement, synchronization])
  state.heldWrite = undefined
  assert.deepEqual(state.calls.slice(callStart), [
    'replaceHostsContent',
    'dnsRefresh',
    'readHosts',
    'syncManagedEntries',
    'dnsRefresh'
  ])
  state.logHangs = true
  state.logFails = false
  const loggedWrite = hosts.replaceUnixHosts('logged saved', state.digest)
  await Promise.race([
    loggedWrite,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('diagnostic held a completed write')), 500)
    )
  ])
  await hosts.finishUnixHostsEditing()
  const beforeExitRefresh = state.refreshes
  assert.equal(await hosts.syncUnixHosts([]), true)
  assert.equal(
    state.refreshes,
    beforeExitRefresh + 1,
    'exit cleanup must refresh DNS after removing entries'
  )
  console.log(
    'Unix hosts: macOS DNS refresh, completed writes, independent diagnostics and exit cleanup passed'
  )
} finally {
  await rm(directory, { recursive: true, force: true })
  delete (globalThis as any).__hostsDNS
}
